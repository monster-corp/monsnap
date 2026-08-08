import {prisma} from "@/lib/prisma";
import {EggNotHatchableError, EggSlotFullError} from "@/lib/errors/eggs";
import {EggStatus, WalkSessionEndReason, WalkSessionStatus} from "@/lib/status";
import type {Egg, Monster, UserMonster} from "@/app/generated/prisma/client";
import {EggNotFoundError} from "@/lib/errors/walk-session";

const MAX_ACTIVE_EGGS = 3;

export async function createEggFromScan(
    userId: bigint,
    scanId: bigint,
    monster: Pick<Monster, "id" | "rarity">
): Promise<Egg> {
    return prisma.$transaction(async (tx) => {
        const activeCount = await tx.egg.count({
            where: {
                userId,
                status: {not: EggStatus.HATCHED},
            },
        });

        if (activeCount >= MAX_ACTIVE_EGGS) {
            throw new EggSlotFullError();
        }

        const stepRequirement = await tx.rarityStepRequirement.findUniqueOrThrow({
            where: {
                rarity: monster.rarity
            },
        });

        return tx.egg.create({
            data: {
                userId,
                scanId,
                monsterId: monster.id,
                requiredSteps: stepRequirement.requiredSteps,
            },
        });
    });
}

export type HatchEggResult = {
    egg: Egg;
    monster: Monster;
    userMonster: UserMonster;
    isNewMonster: boolean;
};

export async function hatchEgg(userId: bigint, eggId: bigint): Promise<HatchEggResult> {
    return prisma.$transaction(async (tx) => {
        const egg = await tx.egg.findFirst({
            where: {id: eggId, userId},
            include: {monster: true},
        });
        if (!egg) {
            throw new EggNotFoundError();
        }

        const hatchedAt = new Date();

        const updateResult = await tx.egg.updateMany({
            where: {id: eggId, userId, status: EggStatus.READY},
            data: {status: EggStatus.HATCHED, hatchedAt},
        });

        if (updateResult.count === 0) {
            throw new EggNotHatchableError();
        }

        const updatedEgg = {...egg, status: EggStatus.HATCHED, hatchedAt};

        // 정상 플로우에서는 READY 도달 후 walk session이 이미 종료되어 있어 대상이 없다.
        // 예외적으로 ACTIVE 세션이 남아 있다면 부화와 함께 자동 종료한다.
        // 현재는 READY 상태에서만 부화가 가능하므로 STEP_GOAL_REACHED로 기록한다.
        await tx.eggWalkSession.updateMany({
            where: {eggId, userId, status: WalkSessionStatus.ACTIVE},
            data: {
                status: WalkSessionStatus.ENDED,
                endedAt: hatchedAt,
                endReason: WalkSessionEndReason.STEP_GOAL_REACHED,
            },
        });

        const userMonster = await tx.userMonster.upsert({
            where: {
                userId_monsterId: {userId, monsterId: egg.monsterId}
            },
            update: {
                catchCount: {increment: 1}, eggId
            },
            create: {
                userId, monsterId: egg.monsterId, eggId, catchCount: 1
            }
        })

        return {
            egg: updatedEgg,
            monster: egg.monster,
            userMonster,
            isNewMonster: userMonster.catchCount === 1,
        };
    });
}

export function getUserEggs(userId: bigint) {
    return prisma.egg.findMany({
        where: {userId, status: {not: EggStatus.HATCHED}},
        select: {
            id: true,
            status: true,
            currentSteps: true,
            requiredSteps: true,
            eggWalkSessions: {
                where: {status: WalkSessionStatus.ACTIVE},
                select: {id: true},
            },
        },
        orderBy: {createdAt: "asc"},
    });
}