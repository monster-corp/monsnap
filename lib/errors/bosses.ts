import { ApiError } from "@/lib/api/response";

export class BossNotFoundError extends ApiError {
    constructor() {
        super("BOSS_NOT_FOUND");
    }
}

export class BattleParamRequiredError extends ApiError {
    constructor() {
        super("BATTLE_PARAM_REQUIRED");
    }
}