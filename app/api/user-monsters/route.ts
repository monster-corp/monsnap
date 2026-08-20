import {NextRequest} from "next/server";
import {getCurrentUserId} from "@/lib/auth";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {extractPendingIv, getUserMonsters, parseSortFields, parseSortOrders} from "@/lib/user-monsters";
import {calculateFinalStats} from "@/lib/stats";

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
            userMonsters: userMonsters.map((um) => {
                const pendingIv = extractPendingIv(um);

                return {
                    userMonsterId: um.id.toString(),
                    monsterId: um.monsterId.toString(),
                    dexId: um.monster.dexId,
                    name: um.monster.name,
                    rarity: um.monster.rarity,
                    material: um.monster.material,
                    shape: um.monster.shape,
                    imageUrl: um.monster.imageUrl,
                    cutoutImageUrl: um.monster.cutoutImageUrl ?? null,
                    level: um.level,
                    catchCount: um.catchCount,
                    firstCaughtAt: um.firstCaughtAt.toISOString(),
                    baseStats: {
                        hp: um.monster.baseHp,
                        attack: um.monster.baseAttack,
                        defense: um.monster.baseDefense,
                        speed: um.monster.baseSpeed,
                    },
                    // 개체값이 반영된 실제 능력치
                    currentStats: calculateFinalStats(um.monster, um),
                    // 대기 중인 개체값 제안. 없으면 null
                    pendingIv,
                    pendingStats: pendingIv
                        ? calculateFinalStats(um.monster, pendingIv)
                        : null,
                };
            }),
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/user-monsters GET] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}