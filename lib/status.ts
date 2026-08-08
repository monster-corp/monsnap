export const EggStatus = {
    INCUBATING: "INCUBATING",
    READY: "READY",
    HATCHED: "HATCHED",
} as const;

export type EggStatus = (typeof EggStatus)[keyof typeof EggStatus];

export const WalkSessionStatus = {
    ACTIVE: "ACTIVE",
    ENDED: "ENDED",
} as const;

export type WalkSessionStatus = (typeof WalkSessionStatus)[keyof typeof WalkSessionStatus];

export const WalkSessionEndReason = {
    STEP_GOAL_REACHED: "STEP_GOAL_REACHED",
    USER_EXIT: "USER_EXIT",
    BACKGROUNDED: "BACKGROUNDED",
    TIMEOUT: "TIMEOUT",
} as const;

export type WalkSessionEndReasonType = typeof WalkSessionEndReason[keyof typeof WalkSessionEndReason];