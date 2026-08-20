import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getCurrentUserId} from "@/lib/auth";
import {getScanChargeState} from "@/lib/scan-charge";

export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const state = await getScanChargeState(userId);
        return respondWithStatus("OK", state);
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/scans/charge GET] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}