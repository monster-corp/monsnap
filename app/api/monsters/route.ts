import {getCurrentUserId} from "@/lib/auth";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getMonsterDex, toCaughtDexEntry, toUncaughtDexEntry} from "@/lib/monsters";

export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const dex = await getMonsterDex(userId);

        const monsters = dex.map((m) =>
            m.userMonsters.length > 0 ? toCaughtDexEntry(m) : toUncaughtDexEntry(m)
        );

        return respondWithStatus("OK", {
            totalCount: monsters.length,
            caughtCount: monsters.filter((m) => m.caught).length,
            monsters,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/monsters GET] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}