import {NextRequest} from "next/server";
import {z} from "zod";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getCurrentUserId} from "@/lib/auth";
import {applyStepsToWalkSession} from "@/lib/walk-sessions";
import {parseBigIntParam} from "@/lib/api/params";

type RouteContext = { params: Promise<{ eggId: string; sessionId: string }> };

const patchSchema = z.object({
    stepsCaptured: z.number().int().min(0),
});

export async function PATCH(request: NextRequest, {params}: RouteContext) {
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

        let body: unknown;
        try {
            body = await request.json();
        } catch {
            return respondWithStatus("INVALID_REQUEST");
        }

        const parsed = patchSchema.safeParse(body);
        if (!parsed.success) {
            return respondWithStatus("INVALID_STEP_COUNT");
        }

        const result = await applyStepsToWalkSession(
            userId,
            parsedEggId,
            parsedSessionId,
            parsed.data.stepsCaptured
        );

        return respondWithStatus("OK", {
            sessionId: result.session.id.toString(),
            stepsCaptured: result.session.stepsCaptured,
            stepsDelta: result.stepsDelta,
            egg: {
                id: result.egg.id.toString(),
                currentSteps: result.egg.currentSteps,
                requiredSteps: result.egg.requiredSteps,
                status: result.egg.status,
                readyAt: result.egg.readyAt?.toISOString() ?? null,
            },
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/eggs/[eggId]/walk-sessions/[sessionId] PATCH] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}