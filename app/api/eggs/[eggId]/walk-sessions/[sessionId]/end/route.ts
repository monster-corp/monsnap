import {NextRequest} from "next/server";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getCurrentUserId} from "@/lib/auth";
import {endWalkSession} from "@/lib/walk-sessions";
import {parseBigIntParam} from "@/lib/api/params";
import {WalkSessionEndReason} from "@/lib/status";

type RouteContext = { params: Promise<{ eggId: string; sessionId: string }> };

export async function POST(_request: NextRequest, {params}: RouteContext) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const {eggId, sessionId} = await params;
        const parsedEggId = parseBigIntParam(eggId);
        const parsedSessionId = parseBigIntParam(sessionId);
        if (parsedEggId === null || parsedSessionId === null) {
            return respondWithStatus("INVALID_REQUEST");
        }

        const session = await endWalkSession(
            userId,
            parsedEggId,
            parsedSessionId,
            WalkSessionEndReason.USER_EXIT
        );

        return respondWithStatus("OK", {
            sessionId: session.id.toString(),
            status: session.status,
            stepsCaptured: session.stepsCaptured,
            endedAt: session.endedAt?.toISOString() ?? null,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/eggs/[eggId]/walk-sessions/[sessionId]/end POST] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}