import { ApiError } from "@/lib/api/response";

export class BossNotFoundError extends ApiError {
    constructor() {
        super("BOSS_NOT_FOUND");
    }
}

export class InvalidBattleResultError extends ApiError {
    constructor() {
        super("INVALID_BATTLE_RESULT");
    }
}