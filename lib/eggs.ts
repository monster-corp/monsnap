import {prisma} from "@/lib/prisma";
import {EggSlotFullError} from "@/lib/errors/eggs";
import type {Monster, Egg} from "@/app/generated/prisma/client";

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
                status: {not: "HATCHED"},
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