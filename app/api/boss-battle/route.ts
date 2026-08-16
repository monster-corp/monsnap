import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateFinalStats } from '@/lib/stats';
import { getCurrentUserId } from '@/lib/auth'; // 💡 팀 프로젝트 내 getCurrentUserId 경로에 맞춰 import

// -------------------------------------------------------------------
// 1. GET: 보스전 시작 시 데이터 조회
// URL: GET /api/boss-battle?bossId=1&userMonsterId=10
// -------------------------------------------------------------------
export async function GET(req: Request) {
  try {
    // 💡 1. 프론트 파라미터 대신 서버 세션에서 userId 가져오기
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { code: 40100, message: '인증되지 않은 사용자입니다.', data: null },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const bossId = searchParams.get('bossId');
    const userMonsterIdParam = searchParams.get('userMonsterId');

    // 💡 2. bossId만 필수 체크 (userId는 상단에서 검증 완료)
    if (!bossId) {
      return NextResponse.json(
        { code: 40000, message: 'bossId가 필요합니다.', data: null },
        { status: 400 }
      );
    }

    // 💡 3. userMonsterId가 유효한 숫자 형태인지 확인 후 처리 (숫자가 아니거나 없으면 기본 몬스터 선택)
    const isValidMonsterId = userMonsterIdParam && !isNaN(Number(userMonsterIdParam));

    const [boss, userMonster] = await Promise.all([
      prisma.boss.findUnique({ where: { id: BigInt(bossId) } }),
      isValidMonsterId
        ? prisma.userMonster.findFirst({
            where: { id: BigInt(userMonsterIdParam), userId: BigInt(userId) },
            include: { monster: true },
          })
        : prisma.userMonster.findFirst({
            where: { userId: BigInt(userId) },
            include: { monster: true },
            orderBy: { id: 'asc' }, // 첫 번째 보유 몬스터 가져오기
          }),
    ]);

    if (!boss || !userMonster) {
      return NextResponse.json(
        { code: 40400, message: '보스 또는 몬스터 정보를 찾을 수 없습니다.', data: null },
        { status: 404 }
      );
    }

    // 개체값 반영 최종 스탯 계산
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

    return NextResponse.json(
      {
        code: 20000,
        message: '보스전 정보 조회가 완료되었습니다.',
        data: {
          boss: {
            id: boss.id.toString(),
            name: boss.name,
            hp: boss.hp,
            weakAttribute: boss.weakAttribute,
            strongAttribute: boss.strongAttribute,
            cutoutImageUrl: boss.cutoutImageUrl ?? null,
          },
          monster: {
            id: userMonster.id.toString(),
            name: userMonster.monster.name,
            baseAttack: finalStats.attack,
            material: userMonster.monster.material,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('GET Boss Battle Error:', error);
    return NextResponse.json(
      { code: 50000, message: '서버 내부 오류가 발생했습니다.', data: null },
      { status: 500 }
    );
  }
}

// -------------------------------------------------------------------
// 2. POST: 보스전 종료 시 전투 결과 저장
// URL: POST /api/boss-battle
// -------------------------------------------------------------------
export async function POST(req: Request) {
  try {
    // 💡 1. 서버 세션에서 userId 가져오기
    const userId = await getCurrentUserId();
    if (!userId) {
      return NextResponse.json(
        { code: 40100, message: '인증되지 않은 사용자입니다.', data: null },
        { status: 401 }
      );
    }

    const body = await req.json();
    const {
      bossId,
      userMonsterId,
      damageDealt,
      damageMultiplier,
      isCritical,
      bossHpRemaining,
    } = body;

    // 💡 2. Body에서 userId 검증 제거 (bossId와 userMonsterId만 검증)
    if (!bossId || !userMonsterId) {
      return NextResponse.json(
        { code: 40000, message: '필수 데이터가 누락되었습니다.', data: null },
        { status: 400 }
      );
    }

    const remainingHp = Math.max(0, bossHpRemaining ?? 0);
    const isCleared = remainingHp === 0;

    // 전투 로그 DB 기록
    const log = await prisma.battleLog.create({
      data: {
        userId: BigInt(userId),
        bossId: BigInt(bossId),
        userMonsterId: BigInt(userMonsterId),
        damageMultiplier: damageMultiplier ?? 1.0,
        damageDealt: damageDealt ?? 0,
        isCritical: isCritical ?? false,
        bossHpRemaining: remainingHp,
      },
    });

    return NextResponse.json(
      {
        code: 20000,
        message: '보스전 결과 기록이 완료되었습니다.',
        data: {
          logId: log.id.toString(),
          isCleared,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('POST Boss Battle Error:', error);
    return NextResponse.json(
      { code: 50000, message: '서버 내부 오류가 발생했습니다.', data: null },
      { status: 500 }
    );
  }
}