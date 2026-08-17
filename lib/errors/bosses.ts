import { ApiError } from "@/lib/api/response";

export class BossNotFoundError extends ApiError {
    constructor() {
        super("BOSS_NOT_FOUND");
    }
}

export class UserMonsterNotFoundError extends ApiError {
    constructor() {
        super("USER_MONSTER_NOT_FOUND");
    }
}

export class BattleParamRequiredError extends ApiError {
    constructor() {
        super("BATTLE_PARAM_REQUIRED");
    }
}

export class InvalidBattleResultError extends ApiError {
    constructor() {
        super("INVALID_BATTLE_RESULT");
    }
}