import {NextRequest} from "next/server";
import {ApiError, respondWithStatus} from "@/lib/api/response";
import {callVlm} from "@/lib/vlm";
import {BLOCK_REASON_TO_ERROR} from "@/lib/schemas/vlm";
import {prisma} from "@/lib/prisma";
import {matchMonster} from "@/lib/matching";
import {createEggFromScan} from "@/lib/eggs";
import {getCurrentUserId} from "@/lib/auth";
import {isAllowedImageType} from "@/lib/image";

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
                blockReason: block_reason ?? null,
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

        console.error("[/api/scans] unexpected error:", err);
        return respondWithStatus("INTERNAL_ERROR");
    }
}