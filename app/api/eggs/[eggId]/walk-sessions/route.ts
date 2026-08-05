import {NextRequest} from "next/server";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getCurrentUserId} from "@/lib/auth";
import {createWalkSession} from "@/lib/walk-sessions";
import {parseBigIntParam} from "@/lib/api/params";

type RouteContext = { params: Promise<{ eggId: string }> };

export async function POST(_request: NextRequest, {params}: RouteContext) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const {eggId} = await params;
        const parsedEggId = parseBigIntParam(eggId);
        if (parsedEggId === null) {
            return respondWithStatus("INVALID_REQUEST");
        }

        const session = await createWalkSession(userId, parsedEggId);

        return respondWithStatus("OK", {
            sessionId: session.id.toString(),
            eggId: session.eggId.toString(),
            status: session.status,
            startedAt: session.startedAt.toISOString(),
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/eggs/[eggId]/walk-sessions POST] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}