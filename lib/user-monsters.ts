import {prisma} from "@/lib/prisma";
import {Prisma} from "@/app/generated/prisma/client";

export type UserMonsterWithMonster = Prisma.UserMonsterGetPayload<{
    include: { monster: true };
}>;

export function getUserMonsters(userId: bigint): Promise<UserMonsterWithMonster[]> {
    return prisma.userMonster.findMany({
        where: {userId},
        include: {monster: true},
        orderBy: {firstCaughtAt: "desc"},
    });
}