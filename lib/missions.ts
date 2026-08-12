import {prisma} from "@/lib/prisma";
import {getPeriodEnd, getPeriodKey, getPeriodStart, MissionCycle} from "@/lib/period";
import {Mission} from "@/app/generated/prisma/client";

export const ConditionType = {
    SCAN_COUNT: "SCAN_COUNT",
    WALK_SESSION_COUNT: "WALK_SESSION_COUNT",
    TOTAL_STEPS: "TOTAL_STEPS",
    HATCH_COUNT: "HATCH_COUNT",
    DEX_REGISTER_COUNT: "DEX_REGISTER_COUNT",
    DAILY_MISSION_CLEAR: "DAILY_MISSION_CLEAR",
} as const;

export type ConditionType = (typeof ConditionType)[keyof typeof ConditionType];

export type MissionProgress = {
    missionId: string;
    code: string;
    title: string;
    cycle: string;
    conditionType: string;
    progress: number;
    targetCount: number;
    completed: boolean;
    completedAt: string | null;
    claimedAt: string | null;
    periodEndsAt: string;
};

async function countProgress(
    userId: bigint,
    conditionType: string,
    periodStart: Date
): Promise<number> {
    switch (conditionType) {
        case ConditionType.SCAN_COUNT:
            return prisma.scan.count({
                where: {
                    userId,
                    createdAt: {
                        gte: periodStart
                    },
                    blockReason: "NONE",
                },
            });
        case ConditionType.WALK_SESSION_COUNT:
            return prisma.eggWalkSession.count({
                where: {
                    userId,
                    startedAt: {
                        gte: periodStart
                    }
                },
            });
        case ConditionType.TOTAL_STEPS:
            const result = await prisma.eggWalkSession.aggregate({
                where: {
                    userId,
                    startedAt: {
                        gte: periodStart
                    }
                },
                _sum: {stepsCaptured: true},
            });
            return result._sum.stepsCaptured ?? 0;
        case ConditionType.HATCH_COUNT:
            return prisma.egg.count({
                where: {
                    userId,
                    hatchedAt: {
                        gte: periodStart
                    }
                },
            });
        case ConditionType.DEX_REGISTER_COUNT:
            return prisma.userMonster.count({
                where: {
                    userId,
                    firstCaughtAt: {
                        gte: periodStart
                    }
                },
            });
        case ConditionType.DAILY_MISSION_CLEAR:
            return prisma.userMission.count({
                where: {
                    userId,
                    completedAt: {
                        gte: periodStart
                    },
                    mission: {
                        cycle: MissionCycle.DAILY,
                        conditionType: {
                            not: ConditionType.DAILY_MISSION_CLEAR
                        },
                    },
                },
            });

        default:
            return 0;
    }
}

async function resolveMission(
    userId: bigint,
    mission: Mission,
    now: Date
): Promise<MissionProgress> {
    const cycle = mission.cycle as MissionCycle;
    const periodStart = getPeriodStart(cycle, now);
    const periodKey = getPeriodKey(cycle, now);

    const progress = await countProgress(userId, mission.conditionType, periodStart);
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

    return {
        missionId: mission.id.toString(),
        code: mission.code,
        title: mission.title,
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