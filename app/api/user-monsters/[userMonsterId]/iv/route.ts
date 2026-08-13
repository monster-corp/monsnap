import {NextRequest} from "next/server";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getCurrentUserId} from "@/lib/auth";
import {parseBigIntParam} from "@/lib/api/params";
import {resolvePendingIv} from "@/lib/user-monsters";
import type {IvDecision} from "@/lib/user-monsters";

type RouteContext = {params: Promise<{userMonsterId: string}>};

const VALID_DECISIONS: IvDecision[] = ["accept", "reject"];

export async function POST(request: NextRequest, {params}: RouteContext) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const {userMonsterId} = await params;
        const parsedId = parseBigIntParam(userMonsterId);
        if (parsedId === null) {
            return respondWithStatus("INVALID_REQUEST");
        }

        const body = await request.json().catch(() => null);
        const decision = body?.decision;
        if (!VALID_DECISIONS.includes(decision)) {
            return respondWithStatus("INVALID_REQUEST");
        }

        const result = await resolvePendingIv(userId, parsedId, decision);

        return respondWithStatus("OK", {
            userMonsterId: result.userMonster.id.toString(),
            accepted: result.accepted,
            currentStats: result.currentStats,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/user-monsters/[id]/iv POST] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}