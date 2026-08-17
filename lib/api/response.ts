import {NextResponse} from "next/server";

export const ERROR = {
    // 200
    OK: {code: 20000, message: "OK"},
    FACE_BLOCKED: {code: 20001, message: "얼굴이 감지되어 촬영이 차단되었습니다"},
    SCREEN_BLOCKED: {code: 20002, message: "화면이나 사진 재촬영은 허용되지 않습니다"},

    // 400
    IMAGE_REQUIRED: {code: 40000, message: "이미지가 필요합니다"},
    INVALID_NICKNAME: {code: 40001, message: "닉네임은 2~12자의 한글/영문/숫자만 가능합니다"},
    INVALID_REQUEST: {code: 40002, message: "요청 형식이 올바르지 않습니다"},
    INVALID_IMAGE: {code: 40003, message: "지원하지 않는 이미지 형식입니다 (jpeg/png/webp만 가능)"},
    BATTLE_PARAM_REQUIRED: {code: 40004, message: "전투 결과 기록에 필요한 필수 데이터가 누락되었습니다"},
    INVALID_BATTLE_RESULT: {code: 40005, message: "전투 결과 검증에 실패했습니다"},

    // 401
    UNAUTHORIZED: {code: 40100, message: "세션이 유효하지 않습니다"},

    // 404
    EGG_NOT_FOUND: {code: 40400, message: "해당 알을 찾을 수 없습니다"},
    WALK_SESSION_NOT_FOUND: {code: 40401, message: "해당 워크 세션을 찾을 수 없습니다"},
    USER_MONSTER_NOT_FOUND: {code: 40402, message: "보유하지 않은 몬스터입니다"},
    BOSS_NOT_FOUND: {code: 40403, message: "해당 보스를 찾을 수 없습니다"},

    // 409
    EGG_SLOT_FULL: {code: 40900, message: "알 보관함이 가득 찼습니다"},
    SESSION_ALREADY_ACTIVE: {code: 40901, message: "이미 진행 중인 워크 세션이 있습니다"},
    SESSION_NOT_ACTIVE: {code: 40902, message: "진행 중인 워크 세션이 아닙니다"},
    STEP_COUNT_REGRESSED: {code: 40903, message: "이전보다 작은 누적 걸음 수는 전송할 수 없습니다"},
    EGG_NOT_WALKABLE: {code: 40904, message: "걷기가 가능한 상태의 알이 아닙니다"},
    EGG_NOT_HATCHABLE: {code: 40905, message: "인화(부화)할 수 없는 상태의 알입니다"},
    NO_PENDING_IV: {code: 40906, message: "확인 대기 중인 개체값이 없습니다"},

    // 422
    INVALID_STEP_COUNT: {code: 42200, message: "걸음 수 형식이 올바르지 않습니다"},

    // 429
    SCAN_CHARGE_EMPTY: {code: 42900, message: "스캔 충전량이 부족합니다"},
    SCAN_BLOCK_RATE_EXCEEDED: {code: 42901, message: "차단된 스캔 시도가 너무 많습니다. 잠시 후 다시 시도해주세요"},

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