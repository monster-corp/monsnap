// 이번 PR(스캔/매칭 로직) 로컬 검증 전용 스크립트입니다.
// 정식 몬스터 45종 시드(seed.ts, 담당자 별도 작업 예정)와는 무관하며,
// 정식 시드가 준비되면 이 파일은 삭제해도 됩니다.
import {prisma} from "@/lib/prisma";

async function main() {
    const user = await prisma.user.upsert({
        where: {id: BigInt(1)},
        update: {},
        create: {
            id: BigInt(1),
            nickname: "테스트유저",
        },
    });

    // 매칭 성공 경로 검증용 — METAL + ROUND 조합
    const matched = await prisma.monster.upsert({
        where: {id: BigInt(1)},
        update: {},
        create: {
            id: BigInt(1),
            name: "테스트 몬스터",
            rarity: "COMMON",
            material: "METAL",
            shape: "ROUND",
            dropWeight: 80,
            baseHp: 100,
            baseAttack: 10,
            baseDefense: 10,
            baseSpeed: 10,
            imageUrl: "https://placehold.co/400x400",
            isFallback: false,
        },
    });

    // confidence 낮을 때 / 매칭 실패 시 폴백 경로 검증용
    const fallback = await prisma.monster.upsert({
        where: {id: BigInt(2)},
        update: {},
        create: {
            id: BigInt(2),
            name: "폴백 몬스터",
            rarity: "COMMON",
            material: "NORMAL",
            shape: "FREEFORM",
            dropWeight: 1,
            baseHp: 100,
            baseAttack: 10,
            baseDefense: 10,
            baseSpeed: 10,
            imageUrl: "https://placehold.co/400x400",
            isFallback: true,
        },
    });

    // eggs.required_steps를 채우기 위해 matchMonster/createEggFromScan 흐름에 필요
    await prisma.rarityStepRequirement.upsert({
        where: {rarity: "COMMON"},
        update: {},
        create: {rarity: "COMMON", requiredSteps: 500},
    });

    console.log("dev-seed 완료:", {
        user: user.id.toString(),
        matchedMonster: `${matched.id.toString()} (${matched.material}/${matched.shape})`,
        fallbackMonster: fallback.id.toString(),
    });
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());