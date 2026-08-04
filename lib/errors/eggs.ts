import { ApiError } from "@/lib/api/response";

export class EggSlotFullError extends ApiError {
    constructor() {
        super("EGG_SLOT_FULL");
    }
}