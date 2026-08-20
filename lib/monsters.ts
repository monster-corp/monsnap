import {prisma} from "@/lib/prisma";

const RARITY_ORDER: Record<string, number> = {EPIC: 0, RARE: 1, COMMON: 2};

export async function getMonsterDex(userId: bigint) {
    const monsters = await prisma.monster.findMany({
        select: {
            id: true,
            dexId: true,
            name: true,
            rarity: true,
            material: true,
            shape: true,
            imageUrl: true,
            cutoutImageUrl: true,
            isFallback: true,
            baseHp: true,
            baseAttack: true,
            baseDefense: true,
            baseSpeed: true,
            userMonsters: {
                where: {userId},
                select: {id: true},
            },
        },
    });

    // 기본 정렬: EPIC -> RARE -> COMMON, 등급 내 dexId 오름차순
    return monsters.sort((a, b) => {
        const diff = RARITY_ORDER[a.rarity] - RARITY_ORDER[b.rarity];
        return diff !== 0 ? diff : a.dexId - b.dexId;
    });
}

type DexMonster = Awaited<ReturnType<typeof getMonsterDex>>[number];

export function toUncaughtDexEntry(m: DexMonster) {
    return {
        monsterId: m.id.toString(),
        dexId: m.dexId,
        name: m.name,
        rarity: m.rarity,
        caught: false as const,
    };
}

export function toCaughtDexEntry(m: DexMonster) {
    return {
        monsterId: m.id.toString(),
        dexId: m.dexId,
        name: m.name,
        rarity: m.rarity,
        caught: true as const,
        material: m.material,
        shape: m.shape,
        imageUrl: m.imageUrl,
        cutoutImageUrl: m.cutoutImageUrl ?? null,
        isFallback: m.isFallback,
        baseStats: {
            hp: m.baseHp,
            attack: m.baseAttack,
            defense: m.baseDefense,
            speed: m.baseSpeed,
        },
    };
}