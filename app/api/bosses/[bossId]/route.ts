import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/auth";
import { calculateFinalStats } from "@/lib/stats";
import { ApiError, respondWithStatus } from "@/lib/api/response";
import { parseBigIntParam } from "@/lib/api/params";

type RouteContext = { params: Promise<{ bossId: string }> };

const MULTIPLIERS = {
  WEAK: 1.5,
  STRONG: 0.5,
  NORMAL: 1.0,
};

// -------------------------------------------------------------------
// 1. GET: 보스 정보 조회
// -------------------------------------------------------------------
export async function GET(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return respondWithStatus("UNAUTHORIZED");
    }

    const { bossId } = await params;
    const parsedBossId = parseBigIntParam(bossId);
    if (parsedBossId === null) {
      return respondWithStatus("BOSS_ID_REQUIRED");
    }

    const boss = await prisma.boss.findUnique({
      where: { id: parsedBossId },
    });

    if (!boss) {
      return respondWithStatus("BOSS_NOT_FOUND");
    }

    return respondWithStatus("OK", {
      id: boss.id.toString(),
      name: boss.name,
      hp: boss.hp,
      weakAttribute: boss.weakAttribute,
      strongAttribute: boss.strongAttribute,
      cutoutImageUrl: boss.cutoutImageUrl ?? null,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return respondWithStatus(err.key, null, err.message);
    }

    console.error("[/api/bosses/[bossId] GET] unexpected error:", err);
    return respondWithStatus("INTERNAL_ERROR");
  }
}

// -------------------------------------------------------------------
// 2. POST: 전투 종료 및 결과 처리 (단발성 기록)
// -------------------------------------------------------------------
export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const userId = await getCurrentUserId();
    if (!userId) {
      return respondWithStatus("UNAUTHORIZED");
    }

    const { bossId } = await params;
    const parsedBossId = parseBigIntParam(bossId);
    if (parsedBossId === null) {
      return respondWithStatus("BOSS_ID_REQUIRED");
    }

    const body = await req.json();
    const { userMonsterId, touchCount, criticalCount, elapsedMs } = body;

    const parsedMonsterId =
      userMonsterId !== undefined && userMonsterId !== null
        ? parseBigIntParam(String(userMonsterId))
        : null;

    if (parsedMonsterId === null) {
      return respondWithStatus("INVALID_REQUEST");
    }

    // 보스(isActive) 및 유저 몬스터 소유권 확인
    const [boss, userMonster] = await Promise.all([
      prisma.boss.findFirst({
        where: { id: parsedBossId, isActive: true },
      }),
      prisma.userMonster.findFirst({
        where: { id: parsedMonsterId, userId: BigInt(userId) },
        include: { monster: true },
      }),
    ]);

    if (!boss) {
      return respondWithStatus("BOSS_NOT_FOUND");
    }

    if (!userMonster) {
      return respondWithStatus("USER_MONSTER_NOT_FOUND");
    }

    // 어뷰징 검증
    const touches = Number(touchCount ?? 0);
    const criticals = Number(criticalCount ?? 0);
    const elapsed = Number(elapsedMs ?? 0);
    const TIME_LIMIT_MS = 30000;

    if (criticals > touches) {
      return respondWithStatus("INVALID_REQUEST");
    }

    if (elapsed > TIME_LIMIT_MS + 500) {
      return respondWithStatus("INVALID_REQUEST");
    }

    const maxAllowedTouches = Math.ceil((TIME_LIMIT_MS / 1000) * 15);
    if (touches > maxAllowedTouches) {
      return respondWithStatus("INVALID_REQUEST");
    }

    // 스탯 및 속성 상성 배율 계산
    const finalStats = calculateFinalStats(
      {
        baseHp: userMonster.monster.baseHp,
        baseAttack: userMonster.monster.baseAttack,
        baseDefense: userMonster.monster.baseDefense,
        baseSpeed: userMonster.monster.baseSpeed,
      },
      {
        ivHp: userMonster.ivHp,
        ivAttack: userMonster.ivAttack,
        ivDefense: userMonster.ivDefense,
        ivSpeed: userMonster.ivSpeed,
      }
    );

    let damageMultiplier = MULTIPLIERS.NORMAL;
    const monsterMaterial = userMonster.monster.material;

    if (boss.weakAttribute && monsterMaterial === boss.weakAttribute) {
      damageMultiplier = MULTIPLIERS.WEAK;
    } else if (boss.strongAttribute && monsterMaterial === boss.strongAttribute) {
      damageMultiplier = MULTIPLIERS.STRONG;
    }

    // 데미지 서버 재계산 및 승리 판정
    const normalTouches = touches - criticals;
    const baseDamagePerHit = finalStats.attack * damageMultiplier;
    const totalDamage = Math.round(
      normalTouches * baseDamagePerHit + criticals * (baseDamagePerHit * 1.5)
    );

    const bossHpRemaining = Math.max(0, boss.hp - totalDamage);
    const isCleared = bossHpRemaining === 0 && elapsed <= TIME_LIMIT_MS;

    // 시작 시간 역산 및 battle_logs 저장
    const startedAt = new Date(Date.now() - elapsed);

    const battleLog = await prisma.battleLog.create({
      data: {
        userId: BigInt(userId),
        bossId: boss.id,
        userMonsterId: userMonster.id,
        damageDealt: totalDamage,
        damageMultiplier,
        isCritical: criticals > 0,
        bossHpRemaining,
        startedAt,
      },
    });

    return respondWithStatus("OK", {
      battleLogId: battleLog.id.toString(),
      isCleared,
      damageDealt: totalDamage,
      bossHpRemaining,
      damageMultiplier,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      return respondWithStatus(err.key, null, err.message);
    }

    console.error("[/api/bosses/[bossId] POST] unexpected error:", err);
    return respondWithStatus("INTERNAL_ERROR");
  }
}