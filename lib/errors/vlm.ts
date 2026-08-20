import {ApiError} from "@/lib/api/response";

export class VlmCallError extends ApiError {
    constructor(cause?: unknown) {
        super("VLM_FAILED");
        this.cause = cause;
    }
}

export class VlmTimeoutError extends ApiError {
    constructor() {
        super("VLM_TIMEOUT");
    }
}

export class VlmResponseInvalidError extends ApiError {
    constructor(cause?: unknown) {
        super("VLM_RESPONSE_INVALID");
        this.cause = cause;
    }
}