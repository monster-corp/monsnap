import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getCurrentUserId} from "@/lib/auth";
import {getUserMissions} from "@/lib/missions";

export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const missions = await getUserMissions(userId);

        return respondWithStatus("OK", {
            totalCount: missions.length,
            completedCount: missions.filter((m) => m.completed).length,
            missions,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/missions GET] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}