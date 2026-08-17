import { NextRequest } from "next/server";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/auth";
import { ApiError, respondWithStatus } from "@/lib/api/response";
import { parseBigIntParam } from "@/lib/api/params";
import { getActiveBossById, processBossBattle } from "@/lib/bosses";

type RouteContext = { params: Promise<{ bossId: string }> };

// Zod 검증 스키마 (NaN, 음수, null/undefined 사전 차단)
const battleSubmitSchema = z.object({
  userMonsterId: z.union([z.string(), z.number()]),
  touchCount: z.number().int().min(0),
  criticalCount: z.number().int().min(0),
  elapsedMs: z.number().int().min(0),
});

// -------------------------------------------------------------------
// 1. GET: 활성화된 보스 정보 조회
// -------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return respondWithStatus("UNAUTHORIZED");
    }

    const { bossId } = await params;
    const parsedBossId = parseBigIntParam(bossId);
    if (parsedBossId === null) {
      return respondWithStatus("INVALID_REQUEST");
    }

    const bossData = await getActiveBossById(parsedBossId);
    return respondWithStatus("OK", bossData);
  } catch (err) {
    if (err instanceof ApiError) {
      return respondWithStatus(err.key, null, err.message);
    }
    console.error("[/api/bosses/[bossId] GET] unexpected error:", err);
    return respondWithStatus("INTERNAL_ERROR");
  }
}

// -------------------------------------------------------------------
// 2. POST: 전투 종료 및 결과 처리
// -------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return respondWithStatus("UNAUTHORIZED");
    }

    const { bossId } = await params;
    const parsedBossId = parseBigIntParam(bossId);
    if (parsedBossId === null) {
      return respondWithStatus("INVALID_REQUEST");
    }

    // JSON 파싱 예외 처리
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return respondWithStatus("INVALID_REQUEST");
    }

    // Zod 유효성 검증
    const parsed = battleSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return respondWithStatus("INVALID_REQUEST");
    }

    const { userMonsterId, touchCount, criticalCount, elapsedMs } = parsed.data;
    const parsedMonsterId = parseBigIntParam(String(userMonsterId));

    if (parsedMonsterId === null) {
      return respondWithStatus("INVALID_REQUEST");
    }

    const result = await processBossBattle({
      userId,
      bossId: parsedBossId,
      userMonsterId: parsedMonsterId,
      touchCount,
      criticalCount,
      elapsedMs,
    });

    return respondWithStatus("OK", result);
  } catch (err) {
    if (err instanceof ApiError) {
      return respondWithStatus(err.key, null, err.message);
    }
    console.error("[/api/bosses/[bossId] POST] unexpected error:", err);
    return respondWithStatus("INTERNAL_ERROR");
  }
}