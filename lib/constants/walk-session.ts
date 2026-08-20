/**
 * 걷기 세션 타임아웃. 이 시간 동안 걸음이 증가하지 않으면 방치된 세션으로 본다.
 *
 * lastActiveAt은 걸음이 실제로 증가한 PATCH에서만 갱신되므로,
 * 프론트의 호출 주기와 무관하게 "마지막으로 걸은 시각"을 의미한다.
 */
export const WALK_SESSION_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** 현재 시각 기준 만료 임계점. 이보다 오래된 lastActiveAt은 만료로 판정한다. */
export function walkSessionExpiryThreshold(now: Date = new Date()): Date {
    return new Date(now.getTime() - WALK_SESSION_TIMEOUT_MS);
}