import {NextRequest} from "next/server";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {callVlm} from "@/lib/vlm";
import {BLOCK_REASON_TO_ERROR} from "@/lib/schemas/vlm";
import {prisma} from "@/lib/prisma";
import {matchMonster} from "@/lib/matching";
import {createEggFromScan} from "@/lib/eggs";

export const maxDuration = 60;

/*
    TODO(#3): 인증 방식(쿠키/헤더) 확정되면 lib/auth.ts의 getUserIdFromSession으로 교체. 지금은 단일 테스트 유저로 고정.
*/
const TEMP_USER_ID = BigInt(1);

export async function POST(request: NextRequest) {
    try {
        const userId = TEMP_USER_ID;

        const formData = await request.formData();
        const image = formData.get("image");
        if (!(image instanceof File)) {
            return respondWithStatus("IMAGE_REQUIRED");
        }

        const vlmResult = await callVlm(image);

        const {material, shape, confidence, block_reason} = vlmResult;
        const isBlocked = block_reason !== "NONE";

        const scan = await prisma.scan.create({
            data: {
                userId,
                extractedAttributes: vlmResult,
                material: isBlocked ? null : material,
                shape: isBlocked ? null : shape,
                similarityScore: confidence,
                blockReason: block_reason,
            },
        });

        const blockErrorKey = BLOCK_REASON_TO_ERROR[block_reason];
        if (blockErrorKey) {
            return respondWithStatus(blockErrorKey, {scanId: scan.id.toString()});
        }

        const monster = await matchMonster({material, shape, confidence});
        const egg = await createEggFromScan(userId, scan.id, monster);

        return respondWithStatus("OK", {
            eggId: egg.id.toString(),
            status: egg.status,
            requiredSteps: egg.requiredSteps,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/scan] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}