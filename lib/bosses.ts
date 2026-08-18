import { prisma } from "@/lib/prisma";
import { calculateFinalStats } from "@/lib/stats";
import {
  BossNotFoundError,
  InvalidBattleResultError,
} from "@/lib/errors/bosses";
import { UserMonsterNotFoundError } from "@/lib/errors/user-monsters";

// 매직 넘버 상수화
const DEFAULT_TIME_LIMIT_MS = 30000;
const TIME_LIMIT_BUFFER_MS = 500;

const MULTIPLIERS = {
  WEAK: 1.5,
  STRONG: 0.5,
  NORMAL: 1.0,
};

export interface ProcessBattleInput {
  userId: bigint;
  bossId: bigint;
  userMonsterId: bigint;
  touchCount: number;
  criticalCount: number;
  elapsedMs: number;
}

// 활성화된 보스 단건 조회
export async function getActiveBossById(bossId: bigint) {
  const boss = await prisma.boss.findFirst({
    where: { id: bossId, isActive: true },
  });

  if (!boss) {
    throw new BossNotFoundError();
  }

  return {
    id: boss.id.toString(),
    name: boss.name,
    hp: boss.hp,
    timeLimitMs: boss.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS,
    weakAttribute: boss.weakAttribute,
    strongAttribute: boss.strongAttribute,
    imageUrl: boss.imageUrl,
    cutoutImageUrl: boss.cutoutImageUrl ?? null,
    bgImageUrl: boss.bgImageUrl ?? null,
  };
}

// 보스 전투 결과 검증 및 기록 처리
export async function processBossBattle(input: ProcessBattleInput) {
  const { userId, bossId, userMonsterId, touchCount, criticalCount, elapsedMs } = input;

  // 보스 및 유저 몬스터 조회
  const [boss, userMonster] = await Promise.all([
    prisma.boss.findFirst({
      where: { id: bossId, isActive: true },
    }),
    prisma.userMonster.findFirst({
      where: { id: userMonsterId, userId },
      include: { monster: true },
    }),
  ]);

  if (!boss) {
    throw new BossNotFoundError();
  }
  if (!userMonster) {
    throw new UserMonsterNotFoundError();
  }

  // 어뷰징 및 데이터 검증
  const TIME_LIMIT_MS = boss.timeLimitMs ?? DEFAULT_TIME_LIMIT_MS;
  const maxAllowedTime = TIME_LIMIT_MS + TIME_LIMIT_BUFFER_MS;

  // 크리티컬 횟수 초과 검증
  if (criticalCount > touchCount) {
    throw new InvalidBattleResultError();
  }

  // 제한시간 초과 검증 (상단 정의된 maxAllowedTime 재사용)
  if (elapsedMs > maxAllowedTime) {
    throw new InvalidBattleResultError();
  }

  // 경과 시간(elapsedMs) 기준 동적 터치 상한 계산
  const effectiveElapsedMs = Math.min(elapsedMs, TIME_LIMIT_MS);
  const maxAllowedTouches = Math.ceil((effectiveElapsedMs / 1000) * 15) + 3;

  if (touchCount > maxAllowedTouches) {
    throw new InvalidBattleResultError();
  }

  // 스탯 및 속성 상성 데미지 계산
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

  const normalTouches = touchCount - criticalCount;
  const baseDamagePerHit = finalStats.attack * damageMultiplier;
  const totalDamage = Math.round(
    normalTouches * baseDamagePerHit + criticalCount * (baseDamagePerHit * 1.5)
  );

  const bossHpRemaining = Math.max(0, boss.hp - totalDamage);
  const isCleared = bossHpRemaining === 0 && elapsedMs <= maxAllowedTime;
  const startedAt = new Date(Date.now() - elapsedMs);

  // 전투 기록 저장
  const battleLog = await prisma.battleLog.create({
    data: {
      userId,
      bossId: boss.id,
      userMonsterId: userMonster.id,
      battleType: "BOSS_TIMED",
      damageMultiplier,
      touchCount,
      criticalCount,
      damageDealt: totalDamage,
      bossHpRemaining,
      elapsedMs,
      isCleared,
      startedAt,
    },
  });

  return {
    battleLogId: battleLog.id.toString(),
    isCleared,
    damageDealt: totalDamage,
    bossHpRemaining,
    damageMultiplier,
  };
}