import {NextRequest} from "next/server";
import {getCurrentUserId} from "@/lib/auth";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {parseBigIntParam} from "@/lib/api/params";
import {hatchEgg} from "@/lib/eggs";

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

        const result = await hatchEgg(userId, parsedEggId);

        return respondWithStatus("OK", {
            egg: {
                id: result.egg.id.toString(),
                status: result.egg.status,
                hatchedAt: result.egg.hatchedAt?.toISOString() ?? null,
            },
            monster: {
                id: result.monster.id.toString(),
                dexId: result.monster.dexId,
                name: result.monster.name,
                rarity: result.monster.rarity,
                material: result.monster.material,
                shape: result.monster.shape,
                imageUrl: result.monster.imageUrl,
            },
            userMonster: {
                id: result.userMonster.id.toString(),
                monsterId: result.userMonster.monsterId.toString(),
                catchCount: result.userMonster.catchCount,
                level: result.userMonster.level,
            },
            isNewMonster: result.isNewMonster,
            currentStats: result.currentStats,
            rolledIv: result.rolledIv,
            rolledStats: result.rolledStats,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/eggs/[eggId]/hatch POST] unexpected error: ", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}