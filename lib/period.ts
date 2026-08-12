const RESET_HOUR_MS = 5 * 60 * 60 * 1000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export const MissionCycle = {
    DAILY: "DAILY",
    WEEKLY: "WEEKLY",
} as const;

export type MissionCycle = (typeof MissionCycle)[keyof typeof MissionCycle];

/**
 * 현재 시각이 속한 일일 주기의 시작 시각(UTC Date). KST 05:00 기준.
 */
export function getDailyPeriodStart(now: Date = new Date()): Date {
    const shifted = now.getTime() + KST_OFFSET_MS - RESET_HOUR_MS;
    const daysSinceEpoch = Math.floor(shifted / DAY_MS);
    return new Date(daysSinceEpoch * DAY_MS - KST_OFFSET_MS + RESET_HOUR_MS);
}

/**
 * 현재 시각이 속한 주간 주기의 시작 시각(UTC Date). KST 월요일 05:00 기준.
 */
export function getWeeklyPeriodStart(now: Date = new Date()): Date {
    const dailyStart = getDailyPeriodStart(now);
    const daysSinceEpoch = Math.floor(
        (dailyStart.getTime() + KST_OFFSET_MS - RESET_HOUR_MS) / DAY_MS
    );
    // epoch day 0(1970-01-01)은 목요일이므로 월요일까지 3일을 보정한다
    const daysSinceMonday = (daysSinceEpoch + 3) % 7;
    return new Date(dailyStart.getTime() - daysSinceMonday * DAY_MS);
}

export function getPeriodStart(cycle: MissionCycle, now: Date = new Date()): Date {
    return cycle === MissionCycle.WEEKLY
        ? getWeeklyPeriodStart(now)
        : getDailyPeriodStart(now);
}

/**
 * 주기 식별 문자열. UserMission.periodKey로 사용한다.
 * 주간은 W 접두사를 붙여 같은 날짜의 일일 주기와 로그상 구분되게 한다.
 */
export function getPeriodKey(cycle: MissionCycle, now: Date = new Date()): string {
    const start = getPeriodStart(cycle, now);
    const kst = new Date(start.getTime() + KST_OFFSET_MS);
    const dateStr = kst.toISOString().slice(0, 10);

    return cycle === MissionCycle.WEEKLY ? `W${dateStr}` : dateStr;
}

/** 다음 주기 시작 시각. 클라이언트 카운트다운 표시용 */
export function getPeriodEnd(cycle: MissionCycle, now: Date = new Date()): Date {
    const start = getPeriodStart(cycle, now);
    const days = cycle === MissionCycle.WEEKLY ? 7 : 1;
    return new Date(start.getTime() + days * DAY_MS);
}