import {getCurrentUserId} from "@/lib/auth";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getUserEggs} from "@/lib/eggs";

export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const eggs = await getUserEggs(userId);

        return respondWithStatus("OK", {
            eggs: eggs.map((egg) => ({
                eggId: egg.id.toString(),
                status: egg.status,
                currentSteps: egg.currentSteps,
                requiredSteps: egg.requiredSteps,
                activeWalkSessionId: egg.eggWalkSessions[0]?.id.toString() ?? null,
            })),
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/eggs GET] unexpected error", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}