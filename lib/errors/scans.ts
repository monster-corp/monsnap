import {ApiError} from "@/lib/api/response";

export class ScanChargeEmptyError extends ApiError {
    constructor() {
        super("SCAN_CHARGE_EMPTY");
    }
}

export class ScanBlockRateExceededError extends ApiError {
    constructor() {
        super("SCAN_BLOCK_RATE_EXCEEDED");
    }
}