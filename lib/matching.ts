import {prisma} from "@/lib/prisma";
import type {Monster} from "@/app/generated/prisma/client";

export const CONFIDENCE_THRESHOLD = 70.00;

interface MatchInput {
    material: string;
    shape: string;
    confidence: number;
}

export async function matchMonster({material, shape, confidence}: MatchInput): Promise<Monster> {
    if (confidence < CONFIDENCE_THRESHOLD) {
        return getFallbackMonster();
    }

    const candidates = await prisma.$queryRaw<Monster[]>`
        SELECT *
        FROM monsters
        WHERE material = ${material}
          AND shape = ${shape}
        ORDER BY -ln(random()) / drop_weight
        LIMIT 1;
    `

    if (candidates.length === 0) {
        return getFallbackMonster();
    }

    return candidates[0];
}

async function getFallbackMonster(): Promise<Monster> {
    const fallbacks = await prisma.$queryRaw<Monster[]>`
        SELECT *
        FROM monsters
        WHERE is_fallback = true
        ORDER BY -ln(random()) / drop_weight
        LIMIT 1;
    `

    if (fallbacks.length === 0) {
        throw new Error("폴백 몬스터가 시딩되지 않음. 시드 스크립트 또는 DB 확인")
    }

    return fallbacks[0];
}