import {prisma} from "@/lib/prisma";
import {EggNotHatchableError, EggSlotFullError} from "@/lib/errors/eggs";
import {EggStatus, WalkSessionEndReason, WalkSessionStatus} from "@/lib/status";
import type {Egg, Monster, UserMonster} from "@/app/generated/prisma/client";
import {EggNotFoundError} from "@/lib/errors/walk-session";
import {calculateFinalStats, FinalStats, generateRandomIVs, IVStats} from "@/lib/stats";
import {WALK_SESSION_TIMEOUT_MS} from "@/lib/constants/walk-session";

const MAX_ACTIVE_EGGS = 3;

export async function createEggFromScan(
    userId: bigint,
    scanId: bigint,
    monster: Pick<Monster, "id" | "rarity">
): Promise<Egg> {
    return prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id
                             FROM users
                             WHERE id = ${userId} FOR UPDATE`;

        const activeCount = await tx.egg.count({
            where: {userId, status: {not: EggStatus.HATCHED}},
        });

        if (activeCount >= MAX_ACTIVE_EGGS) {
            throw new EggSlotFullError();
        }

        const stepRequirement = await tx.rarityStepRequirement.findUniqueOrThrow({
            where: {rarity: monster.rarity},
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
    rolledIv: IVStats;
    rolledStats: FinalStats;
    currentStats: FinalStats;
};

export async function hatchEgg(userId: bigint, eggId: bigint): Promise<HatchEggResult> {
    return prisma.$transaction(async (tx) => {
        // 만약 유저가 서로 다른 egg 두 개를 동시에 부화 요청하면,
        // 두 hatchEgg 트랜잭션이 같은 User 행을 잠그려고 경쟁하다가 하나가 완료될 때까지 다른 하나가 대기함
        await tx.$executeRaw`SELECT id
                             FROM users
                             WHERE id = ${userId} FOR UPDATE`;

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

        await tx.eggWalkSession.updateMany({
            where: {eggId, userId, status: WalkSessionStatus.ACTIVE},
            data: {
                status: WalkSessionStatus.ENDED,
                endedAt: hatchedAt,
                endReason: WalkSessionEndReason.STEP_GOAL_REACHED,
            },
        });

        const rolledIv = generateRandomIVs();
        const rolledStats = calculateFinalStats(egg.monster, rolledIv);

        const existing = await tx.userMonster.findUnique({
            where: {userId_monsterId: {userId, monsterId: egg.monsterId}},
        });

        // 첫 포획이면 개체값을 즉시 확정한다. 비교 대상이 없으므로 확인 절차가 불필요하다.
        if (!existing) {
            const userMonster = await tx.userMonster.create({
                data: {
                    userId,
                    monsterId: egg.monsterId,
                    eggId,
                    catchCount: 1,
                    ...rolledIv,
                },
            });

            return {
                egg: updatedEgg,
                monster: egg.monster,
                userMonster,
                isNewMonster: true,
                rolledIv,
                rolledStats,
                currentStats: rolledStats,
            };
        }

        // 중복 포획. 개체값 우열은 스탯 역할에 따라 달라지므로(공격형/방어형 등)
        // 총합으로 서버가 걸러내지 않고 항상 제안하여 유저가 결정하게 한다.
        const userMonster = await tx.userMonster.update({
            where: {id: existing.id},
            data: {
                catchCount: {increment: 1},
                eggId,
                pendingIvHp: rolledIv.ivHp,
                pendingIvAttack: rolledIv.ivAttack,
                pendingIvDefense: rolledIv.ivDefense,
                pendingIvSpeed: rolledIv.ivSpeed,
            },
        });

        return {
            egg: updatedEgg,
            monster: egg.monster,
            userMonster,
            isNewMonster: false,
            rolledIv,
            rolledStats,
            currentStats: calculateFinalStats(egg.monster, existing),
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
            monster: {select: {imageUrl: true}},
            eggWalkSessions: {
                where: {
                    status: WalkSessionStatus.ACTIVE,
                    lastActiveAt: {gte: new Date(Date.now() - WALK_SESSION_TIMEOUT_MS)},
                },
                select: {id: true},
            },
        },
        orderBy: {createdAt: "asc"},
    });
}

export async function assertEggSlotAvailable(userId: bigint): Promise<void> {
    const activeCount = await prisma.egg.count({
        where: {userId, status: {not: EggStatus.HATCHED}},
    });
    if (activeCount >= MAX_ACTIVE_EGGS) {
        throw new EggSlotFullError();
    }
}