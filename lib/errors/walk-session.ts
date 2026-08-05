import {ApiError} from "@/lib/api/response";

export class EggNotFoundError extends ApiError {
    constructor() {
        super("EGG_NOT_FOUND");
    }
}

export class EggNotWalkableError extends ApiError {
    constructor() {
        super("EGG_NOT_WALKABLE");
    }
}

export class WalkSessionNotFoundError extends ApiError {
    constructor() {
        super("WALK_SESSION_NOT_FOUND");
    }
}

export class SessionAlreadyActiveError extends ApiError {
    constructor() {
        super("SESSION_ALREADY_ACTIVE");
    }
}

export class SessionNotActiveError extends ApiError {
    constructor() {
        super("SESSION_NOT_ACTIVE");
    }
}

export class InvalidStepCountError extends ApiError {
    constructor() {
        super("INVALID_STEP_COUNT");
    }
}

export class StepCountRegressedError extends ApiError {
    constructor() {
        super("STEP_COUNT_REGRESSED");
    }
}