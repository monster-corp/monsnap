import {NextResponse} from "next/server";

export const ERROR = {
    // 200
    OK: {code: 20000, message: "OK"},
    FACE_BLOCKED: {code: 20001, message: "얼굴이 감지되어 촬영이 차단되었습니다"},
    SCREEN_BLOCKED: {code: 20002, message: "화면이나 사진 재촬영은 허용되지 않습니다"},

    // 400
    IMAGE_REQUIRED: {code: 40000, message: "이미지가 필요합니다"},

    // 401
    UNAUTHORIZED: {code: 40100, message: "세션이 유효하지 않습니다"},

    // 409
    EGG_SLOT_FULL: {code: 40900, message: "알 보관함이 가득 찼습니다"},

    // 500
    INTERNAL_ERROR: {code: 50000, message: "일시적인 오류가 발생했습니다"},

    // 502
    VLM_FAILED: {code: 50200, message: "이미지 분석에 실패했습니다"},
    VLM_RESPONSE_INVALID: {code: 50201, message: "분석 결과 형식이 올바르지 않습니다"},

    // 504
    VLM_TIMEOUT: {code: 50400, message: "분석 시간이 초과됐습니다"},
} as const;

export type ErrorKey = keyof typeof ERROR;

export function statusFromCode(code: number): number {
    return Math.floor(code / 100);
}

export function respondWithStatus<T>(
    key: ErrorKey,
    data: T | null = null,
    overrideMessage?: string
) {
    const {code, message} = ERROR[key];
    return NextResponse.json(
        {code, message: overrideMessage ?? message, data},
        {status: statusFromCode(code)}
    );
}

export class ApiError extends Error {
    public readonly key: ErrorKey;
    public readonly code: number;

    constructor(key: ErrorKey, overrideMessage?: string) {
        const entry = ERROR[key];
        super(overrideMessage ?? entry.message);
        this.key = key;
        this.code = entry.code;
        this.name = "ApiError";
    }
}