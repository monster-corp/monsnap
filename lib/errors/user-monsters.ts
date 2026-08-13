import {ApiError} from "@/lib/api/response";

export class UserMonsterNotFoundError extends ApiError {
    constructor() {
        super("USER_MONSTER_NOT_FOUND");
    }
}

export class NoPendingIvError extends ApiError {
    constructor() {
        super("NO_PENDING_IV");
    }
}