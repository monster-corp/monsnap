import {getCurrentUserId} from "@/lib/auth";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getUserMonsters} from "@/lib/user-monsters";

export async function GET() {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const userMonsters = await getUserMonsters(userId);

        return respondWithStatus("OK", {
            userMonsters: userMonsters.map((um) => ({
                userMonsterId: um.id.toString(),
                catchCount: um.catchCount,
                level: um.level,
                firstCaughtAt: um.firstCaughtAt.toISOString(),
                monster: {
                    id: um.monster.id.toString(),
                    name: um.monster.name,
                    rarity: um.monster.rarity,
                    material: um.monster.material,
                    shape: um.monster.shape,
                    imageUrl: um.monster.imageUrl,
                },
            })),
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/user-monsters GET] unexpected error: ", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}