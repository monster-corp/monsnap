import {prisma} from "@/lib/prisma";
import {
    getPeriodStart,
    getPeriodEnd,
    getPeriodKey,
    isInKstHourRange,
    MissionCycle,
} from "@/lib/period";
import type {Mission} from "@/app/generated/prisma/client";

export const ConditionType = {
    SCAN_COUNT: "SCAN_COUNT",
    WALK_SESSION_COUNT: "WALK_SESSION_COUNT",
    TOTAL_STEPS: "TOTAL_STEPS",
    DEX_REGISTER_COUNT: "DEX_REGISTER_COUNT",
    DAILY_MISSION_CLEAR: "DAILY_MISSION_CLEAR",
    HATCH_IN_TIME_RANGE: "HATCH_IN_TIME_RANGE",
    SCAN_WITH_ATTRIBUTE: "SCAN_WITH_ATTRIBUTE",
} as const;

export type ConditionType = (typeof ConditionType)[keyof typeof ConditionType];

const MATERIAL_LABELS: Record<string, string> = {
    NORMAL: "일반",
    FIRE: "불",
    WATER: "물",
    GRASS: "풀",
    METAL: "금속",
    CERAMIC: "도자기",
    PLASTIC: "플라스틱",
    GLASS: "유리",
    ELECTRIC: "전기",
};

const SHAPE_LABELS: Record<string, string> = {
    FREEFORM: "자유형",
    ROUND: "원형",
    TRIANGLE: "삼각형",
    SQUARE: "사각형",
    LONG: "길쭉한",
};

export type MissionProgress = {
    missionId: string;
    code: string;
    title: string;
    description: string | null;
    cycle: string;
    conditionType: string;
    progress: number;
    targetCount: number;
    completed: boolean;
    completedAt: string | null;
    claimedAt: string | null;
    periodEndsAt: string;
};

type TimeRangeMeta = {startHour: number; endHour: number};

/** 문자열을 정수 해시로 변환 (FNV-1a 변형) */
function hashString(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return Math.abs(h);
}

/**
 * periodKey를 시드로 재질/형태 조합을 결정한다.
 * 같은 주기에는 항상 같은 조합이 나오고 주기가 바뀌면 달라지므로,
 * 서버가 조합을 저장하거나 주기마다 갱신할 스케줄러가 필요 없다.
 *
 * 실제 몬스터가 존재하는 조합만 후보로 삼는다. 전체 45개 조합 중 24개만
 * 등록되어 있어, 빈 조합을 미션으로 내면 유저가 정확히 찍어도 폴백이 나온다.
 */
async function getPeriodAttribute(periodKey: string) {
    const combos = await prisma.monster.findMany({
        where: {isFallback: false},
        select: {material: true, shape: true},
        distinct: ["material", "shape"],
        orderBy: [{material: "asc"}, {shape: "asc"}],
    });

    return combos[hashString(periodKey) % combos.length];
}

/**
 * 조건 타입별 진행도 집계
 */
async function countProgress(
    userId: bigint,
    mission: Mission,
    periodStart: Date,
    periodKey: string
): Promise<number> {
    switch (mission.conditionType) {
        case ConditionType.SCAN_COUNT:
            return prisma.scan.count({
                where: {userId, createdAt: {gte: periodStart}, blockReason: "NONE"},
            });

        case ConditionType.WALK_SESSION_COUNT:
            return prisma.eggWalkSession.count({
                where: {userId, startedAt: {gte: periodStart}},
            });

        case ConditionType.TOTAL_STEPS: {
            const result = await prisma.eggWalkSession.aggregate({
                where: {userId, startedAt: {gte: periodStart}},
                _sum: {stepsCaptured: true},
            });
            return result._sum.stepsCaptured ?? 0;
        }

        case ConditionType.DEX_REGISTER_COUNT:
            return prisma.userMonster.count({
                where: {userId, firstCaughtAt: {gte: periodStart}},
            });

        case ConditionType.DAILY_MISSION_CLEAR:
            // 주기 시작 이후 완료된 일일 미션 수.
            // periodKey는 날짜별로 다르므로 completedAt 시각으로 필터한다.
            // 자기 자신은 제외해야 순환 참조가 되지 않는다.
            return prisma.userMission.count({
                where: {
                    userId,
                    completedAt: {gte: periodStart},
                    mission: {
                        cycle: MissionCycle.DAILY,
                        conditionType: {not: ConditionType.DAILY_MISSION_CLEAR},
                    },
                },
            });

        case ConditionType.HATCH_IN_TIME_RANGE: {
            const meta = mission.conditionMeta as TimeRangeMeta | null;
            if (!meta) return 0;

            const eggs = await prisma.egg.findMany({
                where: {userId, hatchedAt: {gte: periodStart}},
                select: {readyAt: true, hatchedAt: true},
            });

            // 걸음 완주(readyAt)와 부화(hatchedAt)가 모두 해당 시간대여야 인정한다.
            // 그 시간에 실제로 걸었다는 것을 보장하기 위함이다.
            return eggs.filter(
                (e) =>
                    e.readyAt !== null &&
                    e.hatchedAt !== null &&
                    isInKstHourRange(e.readyAt, meta.startHour, meta.endHour) &&
                    isInKstHourRange(e.hatchedAt, meta.startHour, meta.endHour)
            ).length;
        }

        case ConditionType.SCAN_WITH_ATTRIBUTE: {
            const attr = await getPeriodAttribute(periodKey);
            return prisma.scan.count({
                where: {
                    userId,
                    createdAt: {gte: periodStart},
                    blockReason: "NONE",
                    material: attr.material,
                    shape: attr.shape,
                },
            });
        }

        default:
            return 0;
    }
}

/**
 * 주기마다 조건이 바뀌는 미션은 제목을 동적으로 생성한다.
 */
async function resolveTitleAndDescription(
    mission: Mission,
    periodKey: string
): Promise<{title: string; description: string | null}> {
    if (mission.conditionType !== ConditionType.SCAN_WITH_ATTRIBUTE) {
        return {title: mission.title, description: mission.description};
    }

    const attr = await getPeriodAttribute(periodKey);
    const material = MATERIAL_LABELS[attr.material] ?? attr.material;
    const shape = SHAPE_LABELS[attr.shape] ?? attr.shape;

    return {
        title: `${material} ${shape} 몬스터 스캔하기`,
        description: `이번 주의 지정 몬스터는 ${material} 재질의 ${shape} 몬스터입니다`,
    };
}

async function resolveMission(
    userId: bigint,
    mission: Mission,
    now: Date
): Promise<MissionProgress> {
    const cycle = mission.cycle as MissionCycle;
    const periodStart = getPeriodStart(cycle, now);
    const periodKey = getPeriodKey(cycle, now);

    const progress = await countProgress(userId, mission, periodStart, periodKey);
    const completed = progress >= mission.targetCount;

    let userMission = await prisma.userMission.findUnique({
        where: {userId_missionId_periodKey: {userId, missionId: mission.id, periodKey}},
    });

    // 완료 시점은 계산으로 역산할 수 없으므로, 완료를 감지한 시점에 기록한다.
    // 조회 시점에 lazy upsert하므로 스케줄러가 필요 없다.
    if (completed && !userMission?.completedAt) {
        userMission = await prisma.userMission.upsert({
            where: {userId_missionId_periodKey: {userId, missionId: mission.id, periodKey}},
            update: {completedAt: now},
            create: {userId, missionId: mission.id, periodKey, completedAt: now},
        });
    }

    const {title, description} = await resolveTitleAndDescription(mission, periodKey);

    return {
        missionId: mission.id.toString(),
        code: mission.code,
        title,
        description,
        cycle: mission.cycle,
        conditionType: mission.conditionType,
        progress: Math.min(progress, mission.targetCount),
        targetCount: mission.targetCount,
        completed,
        completedAt: userMission?.completedAt?.toISOString() ?? null,
        claimedAt: userMission?.claimedAt?.toISOString() ?? null,
        periodEndsAt: getPeriodEnd(cycle, now).toISOString(),
    };
}

export async function getUserMissions(userId: bigint): Promise<MissionProgress[]> {
    const missions = await prisma.mission.findMany({
        where: {isActive: true},
        orderBy: [{cycle: "asc"}, {displayOrder: "asc"}],
    });

    const now = new Date();

    // DAILY_MISSION_CLEAR는 다른 미션의 completedAt에 의존하므로 2단계로 처리한다.
    // 1단계에서 일반 미션의 완료가 DB에 기록된 뒤 2단계가 그것을 카운트한다.
    const primary = missions.filter(
        (m) => m.conditionType !== ConditionType.DAILY_MISSION_CLEAR
    );
    const derived = missions.filter(
        (m) => m.conditionType === ConditionType.DAILY_MISSION_CLEAR
    );

    const primaryResults = await Promise.all(
        primary.map((m) => resolveMission(userId, m, now))
    );
    const derivedResults = await Promise.all(
        derived.map((m) => resolveMission(userId, m, now))
    );

    // 조회 순서(cycle, displayOrder)를 유지하기 위해 원래 순서로 재배열
    const byId = new Map(
        [...primaryResults, ...derivedResults].map((r) => [r.missionId, r])
    );
    return missions.map((m) => byId.get(m.id.toString())!);
}