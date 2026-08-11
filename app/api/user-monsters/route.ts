import {NextRequest} from "next/server";
import {getCurrentUserId} from "@/lib/auth";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {getUserMonsters, parseSortFields, parseSortOrders} from "@/lib/user-monsters";

export async function GET(request: NextRequest) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const {searchParams} = new URL(request.url);
        const sortFields = parseSortFields(searchParams.get("sort"));
        const sortOrders = parseSortOrders(searchParams.get("order"), sortFields.length);

        const userMonsters = await getUserMonsters(userId, sortFields, sortOrders);

        return respondWithStatus("OK", {
            sort: sortFields,
            order: sortOrders,
            userMonsters: userMonsters.map((um) => ({
                userMonsterId: um.id.toString(),
                monsterId: um.monsterId.toString(),
                name: um.monster.name,
                rarity: um.monster.rarity,
                material: um.monster.material,
                shape: um.monster.shape,
                imageUrl: um.monster.imageUrl,
                level: um.level,
                catchCount: um.catchCount,
                firstCaughtAt: um.firstCaughtAt.toISOString(),
                baseStats: {
                    hp: um.monster.baseHp,
                    attack: um.monster.baseAttack,
                    defense: um.monster.baseDefense,
                    speed: um.monster.baseSpeed,
                },
            })),
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/user-monsters GET] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}