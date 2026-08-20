import {prisma} from "@/lib/prisma";
import {Prisma} from "@/app/generated/prisma/client";
import {calculateFinalStats, IVStats} from "@/lib/stats";
import {NoPendingIvError, UserMonsterNotFoundError} from "@/lib/errors/user-monsters";

export type UserMonsterWithMonster = Prisma.UserMonsterGetPayload<{
    include: { monster: true };
}>;

// 아래 속성을 제외한 나머지 값으로 정렬 불가능
const SORT_FIELDS = {
    monsterId: "monsterId",
    dexId: "monster.dexId",
    level: "level",
    catchCount: "catchCount",
    firstCaughtAt: "firstCaughtAt",
    name: "name",
    rarity: "rarity",
} as const;

export type SortField = keyof typeof SORT_FIELDS;
export type SortOrder = "asc" | "desc";

const DEFAULT_SORT_FIELD: SortField = "dexId";
const DEFAULT_SORT_ORDER: SortOrder = "asc";

const APP_SORT_FIELDS = new Set<SortField>(["name", "rarity"]);

const RARITY_ORDER: Record<string, number> = {EPIC: 0, RARE: 1, COMMON: 2};

export function parseSortFields(param: string | null): SortField[] {
    if (!param) return [DEFAULT_SORT_FIELD];

    const fields: SortField[] = [];
    for (const raw of param.split(",")) {
        const field = raw.trim();
        if (Object.hasOwn(SORT_FIELDS, field)) {
            fields.push(field as SortField);
        }
    }

    return fields.length > 0 ? fields : [DEFAULT_SORT_FIELD];
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
        case "dexId":
            return a.monster.dexId - b.monster.dexId;
        case "monsterId":
            return a.monsterId < b.monsterId ? -1 : a.monsterId > b.monsterId ? 1 : 0;
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
        orderBy: sortFields.map((field, i) =>
            field === "dexId"
                ? {monster: {dexId: sortOrders[i]}}
                : {[SORT_FIELDS[field]]: sortOrders[i]}
        ),
    });
}

/**
 * pendingIv 컬럼이 모두 채워져 있으면 IVStats로 변환한다.
 * 하나라도 null이면 대기 중인 제안이 없다고 본다.
 */
export function extractPendingIv(um: {
    pendingIvHp: number | null;
    pendingIvAttack: number | null;
    pendingIvDefense: number | null;
    pendingIvSpeed: number | null;
}): IVStats | null {
    if (
        um.pendingIvHp === null ||
        um.pendingIvAttack === null ||
        um.pendingIvDefense === null ||
        um.pendingIvSpeed === null
    ) {
        return null;
    }

    return {
        ivHp: um.pendingIvHp,
        ivAttack: um.pendingIvAttack,
        ivDefense: um.pendingIvDefense,
        ivSpeed: um.pendingIvSpeed,
    };
}

const CLEAR_PENDING_IV = {
    pendingIvHp: null,
    pendingIvAttack: null,
    pendingIvDefense: null,
    pendingIvSpeed: null,
} as const;

export type IvDecision = "accept" | "reject";

export async function resolvePendingIv(
    userId: bigint,
    userMonsterId: bigint,
    decision: IvDecision
) {
    return prisma.$transaction(async (tx) => {
        // 동시 accept/reject 요청을 직렬화하기 위해 대상 row를 잠근다.
        // 이후 Prisma 조회는 락 획득 후의 최신 상태를 읽는다.
        const locked = await tx.$queryRaw<Array<{id: bigint}>>`
            SELECT id FROM user_monsters
            WHERE id = ${userMonsterId} AND user_id = ${userId}
            FOR UPDATE
        `;
        if (locked.length === 0) {
            throw new UserMonsterNotFoundError();
        }

        // 락 획득 이후 최신 상태를 다시 읽는다.
        // 락을 기다린 뒤에 진입한 transaction은 이 시점에 pending이 이미 제거된 것을 본다.
        const um = await tx.userMonster.findFirst({
            where: {id: userMonsterId, userId},
            include: {monster: true},
        });
        if (!um) {
            throw new UserMonsterNotFoundError();
        }

        const pendingIv = extractPendingIv(um);
        if (!pendingIv) {
            throw new NoPendingIvError();
        }

        // 채택하면 확정 컬럼으로 옮기고, 거부하면 제안만 비운다.
        // 어느 경우든 pending은 비워야 같은 제안이 재확인 대상으로 남지 않는다.
        const updated = await tx.userMonster.update({
            where: {id: userMonsterId},
            data: {
                ...(decision === "accept" ? pendingIv : {}),
                ...CLEAR_PENDING_IV,
            },
        });

        return {
            userMonster: updated,
            monster: um.monster,
            accepted: decision === "accept",
            currentStats: calculateFinalStats(um.monster, updated),
        };
    });
}