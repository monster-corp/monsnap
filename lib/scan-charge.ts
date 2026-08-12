import {prisma} from "@/lib/prisma";
import {ScanBlockRateExceededError, ScanChargeEmptyError} from "@/lib/errors/scans";
import type {Prisma} from "@/app/generated/prisma/client";

export const CHARGE_INTERVAL_MS = 3 * 60 * 60 * 1000;
export const MAX_CHARGES = 5;
const HOURLY_BLOCK_LIMIT = 15;

export type ScanChargeState = {
    charges: number;
    maxCharges: number;
    nextChargeAt: string | null;
};

type Tx = Prisma.TransactionClient;

export async function refillCharges(tx: Tx, userId: bigint) {
    const user = await tx.user.findUniqueOrThrow({
        where: {id: userId},
        select: {scanCharges: true, lastChargedAt: true},
    });

    const now = new Date();

    if (user.scanCharges >= MAX_CHARGES) {
        if (user.lastChargedAt.getTime() < now.getTime()) {
            await tx.user.update({
                where: {id: userId},
                data: {lastChargedAt: now},
            });
        }
        return {charges: MAX_CHARGES, lastChargedAt: now};
    }

    const earned = Math.floor(
        (now.getTime() - user.lastChargedAt.getTime()) / CHARGE_INTERVAL_MS
    );
    if (earned <= 0) {
        return {charges: user.scanCharges, lastChargedAt: user.lastChargedAt};
    }

    const charges = Math.min(MAX_CHARGES, user.scanCharges + earned);
    const lastChargedAt =
        charges >= MAX_CHARGES
            ? now
            : new Date(user.lastChargedAt.getTime() + earned * CHARGE_INTERVAL_MS);

    await tx.user.update({
        where: {id: userId},
        data: {scanCharges: charges, lastChargedAt},
    });

    return {charges, lastChargedAt};
}

export function toChargeState(charges: number, lastChargedAt: Date): ScanChargeState {
    return {
        charges,
        maxCharges: MAX_CHARGES,
        nextChargeAt:
            charges >= MAX_CHARGES
                ? null
                : new Date(lastChargedAt.getTime() + CHARGE_INTERVAL_MS).toISOString(),
    };
}

export async function getScanChargeState(userId: bigint): Promise<ScanChargeState> {
    const {charges, lastChargedAt} = await prisma.$transaction((tx) =>
        refillCharges(tx, userId)
    );
    return toChargeState(charges, lastChargedAt);
}

export async function assertScanChargeAvailable(userId: bigint): Promise<void> {
    const state = await getScanChargeState(userId);
    if (state.charges <= 0) {
        throw new ScanChargeEmptyError();
    }
}

export async function assertBlockRateOk(userId: bigint): Promise<void> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const blocked = await prisma.scan.count({
        where: {
            userId,
            blockReason: {not: "NONE"},
            createdAt: {gte: oneHourAgo},
        },
    });

    if (blocked >= HOURLY_BLOCK_LIMIT) {
        throw new ScanBlockRateExceededError();
    }
}