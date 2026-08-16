import {prisma} from "@/lib/prisma";
import {getScanChargeState} from "@/lib/scan-charge";
import type {ScanChargeState} from "@/lib/scan-charge";

export type UserProfile = {
    userId: string;
    nickname: string;
    createdAt: string;
    scanCharge: ScanChargeState;
};

export async function getUserProfile(userId: bigint): Promise<UserProfile | null> {
    const user = await prisma.user.findUnique({
        where: {id: userId},
        select: {id: true, nickname: true, createdAt: true},
    });

    if (!user) {
        return null;
    }

    // scanCharges 컬럼을 직접 읽지 않는다. 그 값은 마지막 계산 시점의 스냅샷이라
    // 경과 시간만큼의 충전이 반영되어 있지 않다. getScanChargeState가 역산과
    // DB 갱신을 함께 처리하므로 재사용한다.
    const scanCharge = await getScanChargeState(userId);

    return {
        userId: user.id.toString(),
        nickname: user.nickname,
        createdAt: user.createdAt.toISOString(),
        scanCharge,
    };
}