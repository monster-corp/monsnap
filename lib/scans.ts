import {prisma} from "@/lib/prisma";
import {ScanChargeEmptyError} from "@/lib/errors/scans";
import {refillCharges, toChargeState} from "@/lib/scan-charge";
import type {ScanChargeState} from "@/lib/scan-charge";
import type {VlmResponse} from "@/lib/schemas/vlm";

const BLOCK_GRACE = 2;

export type ScanSettlementResult = {
    scanId: bigint;
    isBlocked: boolean;
    chargeConsumed: boolean;
    chargeState: ScanChargeState | null;
    material: string | null;
    shape: string | null;
    confidence: number;
};

export async function createScanAndSettleCharge(
    userId: bigint,
    vlmResult: VlmResponse
): Promise<ScanSettlementResult> {
    return prisma.$transaction(async (tx) => {
        // 같은 유저의 동시 요청을 직렬화한다.
        await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;

        const {material, shape, confidence, block_reason} = vlmResult;
        const isBlocked = block_reason !== "NONE";

        const scan = await tx.scan.create({
            data: {
                userId,
                extractedAttributes: vlmResult,
                material: isBlocked ? null : material,
                shape: isBlocked ? null : shape,
                similarityScore: confidence,
                blockReason: block_reason,
            },
        });

        const recent = await tx.scan.findMany({
            where: {userId},
            orderBy: {createdAt: "desc"},
            take: BLOCK_GRACE + 1,
            select: {blockReason: true},
        });

        let consecutiveBlocks = 0;
        for (const s of recent) {
            if (s.blockReason === "NONE") break;
            consecutiveBlocks++;
        }

        const chargeOnBlock = consecutiveBlocks > BLOCK_GRACE;
        const shouldConsume = !isBlocked || chargeOnBlock;

        let chargeState: ScanChargeState | null = null;

        if (shouldConsume) {
            const {lastChargedAt} = await refillCharges(tx, userId);

            const result = await tx.user.updateMany({
                where: {id: userId, scanCharges: {gt: 0}},
                data: {scanCharges: {decrement: 1}},
            });

            if (result.count === 0) {
                throw new ScanChargeEmptyError();
            }

            const user = await tx.user.findUniqueOrThrow({
                where: {id: userId},
                select: {scanCharges: true},
            });

            chargeState = toChargeState(user.scanCharges, lastChargedAt);
        }

        return {
            scanId: scan.id,
            isBlocked,
            chargeConsumed: shouldConsume,
            chargeState,
            material: scan.material,
            shape: scan.shape,
            confidence,
        };
    });
}