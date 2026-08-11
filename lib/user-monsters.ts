import {prisma} from "@/lib/prisma";
import {Prisma} from "@/app/generated/prisma/client";

export type UserMonsterWithMonster = Prisma.UserMonsterGetPayload<{
    include: { monster: true };
}>;

// 아래 속성을 제외한 나머지 값으로 정렬 불가능
const SORT_FIELDS = {
    //TODO: monsterId는 DB ID값이 아닌 개별값 사용 시 수정 필요
    monsterId: "monsterId",
    level: "level",
    catchCount: "catchCount",
    firstCaughtAt: "firstCaughtAt",
    name: "name",
    rarity: "rarity",
} as const;

export type SortField = keyof typeof SORT_FIELDS;
export type SortOrder = "asc" | "desc";

const DEFAULT_SORT_FIELD: SortField = "monsterId";
const DEFAULT_SORT_ORDER: SortOrder = "asc";

const APP_SORT_FIELDS = new Set<SortField>(["name", "rarity"]);

const RARITY_ORDER: Record<string, number> = {EPIC: 0, RARE: 1, COMMON: 2};

export function parseSortFields(param: string | null): SortField[] {
    if (!param) return [DEFAULT_SORT_FIELD];

    const seen = new Set<SortField>();
    for (const raw of param.split(",")) {
        const field = raw.trim();
        if (field in SORT_FIELDS) {
            seen.add(field as SortField);
        }
    }

    return seen.size > 0 ? [...seen] : [DEFAULT_SORT_FIELD];
}

export function parseSortOrders(param: string | null, count: number): SortOrder[] {
    const parsed = (param ?? "")
        .split(",")
        .map((raw) => (raw.trim() === "desc" ? "desc" : DEFAULT_SORT_ORDER));

    return Array.from({length: count}, (_, i) => parsed[i] ?? DEFAULT_SORT_ORDER);
}

function compareByField(
    a: UserMonsterWithMonster,
    b: UserMonsterWithMonster,
    field: SortField
): number {
    switch (field) {
        case "name":
            return a.monster.name.localeCompare(b.monster.name, "ko");
        case "rarity":
            return RARITY_ORDER[a.monster.rarity] - RARITY_ORDER[b.monster.rarity];
        case "monsterId":
            return Number(a.monsterId - b.monsterId);
        case "level":
            return a.level - b.level;
        case "catchCount":
            return a.catchCount - b.catchCount;
        case "firstCaughtAt":
            return a.firstCaughtAt.getTime() - b.firstCaughtAt.getTime();
    }
}

export async function getUserMonsters(
    userId: bigint,
    sortFields: SortField[],
    sortOrders: SortOrder[]
): Promise<UserMonsterWithMonster[]> {
    const needsAppSort = sortFields.some((f) => APP_SORT_FIELDS.has(f));

    if (needsAppSort) {
        const rows = await prisma.userMonster.findMany({
            where: {userId},
            include: {monster: true},
        });

        return rows.sort((a, b) => {
            for (let i = 0; i < sortFields.length; i++) {
                const cmp = compareByField(a, b, sortFields[i]);
                if (cmp !== 0) {
                    return sortOrders[i] === "asc" ? cmp : -cmp;
                }
            }
            return 0;
        });
    }

    return prisma.userMonster.findMany({
        where: {userId},
        include: {monster: true},
        orderBy: sortFields.map((field, i) => ({
            [SORT_FIELDS[field]]: sortOrders[i],
        })),
    });
}