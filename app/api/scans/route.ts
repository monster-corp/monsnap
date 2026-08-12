import {NextRequest} from "next/server";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {callVlm} from "@/lib/vlm";
import {BLOCK_REASON_TO_ERROR} from "@/lib/schemas/vlm";
import {matchMonster} from "@/lib/matching";
import {assertEggSlotAvailable, createEggFromScan} from "@/lib/eggs";
import {getCurrentUserId} from "@/lib/auth";
import {isAllowedImageType} from "@/lib/image";
import {assertBlockRateOk, assertScanChargeAvailable} from "@/lib/scan-charge";
import {createScanAndSettleCharge} from "@/lib/scans";

export const maxDuration = 60;

const IMAGE_FIELD = "image";

export async function POST(request: NextRequest) {
    try {
        const userId = await getCurrentUserId();
        if (!userId) {
            return respondWithStatus("UNAUTHORIZED");
        }

        const contentType = request.headers.get("content-type");
        if (!contentType?.startsWith("multipart/form-data")) {
            return respondWithStatus("INVALID_REQUEST");
        }

        const formData = await request.formData();
        const image = formData.get(IMAGE_FIELD);
        if (!(image instanceof File) || image.size === 0) {
            return respondWithStatus("IMAGE_REQUIRED");
        }

        if (!isAllowedImageType(image.type)) {
            return respondWithStatus("INVALID_IMAGE");
        }

        await assertBlockRateOk(userId);
        await assertScanChargeAvailable(userId);
        await assertEggSlotAvailable(userId);

        const vlmResult = await callVlm(image);

        const settlement = await createScanAndSettleCharge(userId, vlmResult);

        const blockErrorKey = BLOCK_REASON_TO_ERROR[vlmResult.block_reason];
        if (blockErrorKey) {
            return respondWithStatus(blockErrorKey, {
                scanId: settlement.scanId.toString(),
                chargeConsumed: settlement.chargeConsumed,
                scanCharge: settlement.chargeState,
            });
        }

        const monster = await matchMonster({
            material: settlement.material!,
            shape: settlement.shape!,
            confidence: settlement.confidence,
        });

        const egg = await createEggFromScan(userId, settlement.scanId, monster);

        return respondWithStatus("OK", {
            eggId: egg.id.toString(),
            status: egg.status,
            requiredSteps: egg.requiredSteps,
            scanCharge: settlement.chargeState,
        });
    } catch (err) {
        if (err instanceof ApiError) {
            return respondWithStatus(err.key, null, err.message);
        }

        console.error("[/api/scans] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}