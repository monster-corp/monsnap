import { prisma } from "@/lib/prisma";

// 1. 재질별 보정치 (Material Modifiers)
const MATERIAL_STATS: Record<string, { hp: number; atk: number; def: number; spd: number }> = {
  NORMAL:   { hp: 0.00,  atk: 0.00,  def: 0.00,  spd: 0.00 },
  FIRE:     { hp: -0.15, atk: 0.20,  def: -0.20, spd: 0.15 },
  WATER:    { hp: 0.20,  atk: -0.15, def: 0.10,  spd: -0.15 },
  PLANT:    { hp: 0.20,  atk: -0.20, def: 0.10,  spd: -0.10 },
  METAL:    { hp: 0.00,  atk: 0.10,  def: 0.15,  spd: -0.25 },
  CERAMIC:  { hp: -0.15, atk: -0.15, def: 0.25,  spd: 0.05 },
  PLASTIC:  { hp: -0.10, atk: 0.05,  def: -0.15, spd: 0.20 },
  GLASS:    { hp: -0.20, atk: 0.25,  def: -0.20, spd: 0.15 },
  ELECTRIC: { hp: -0.20, atk: 0.15,  def: -0.20, spd: 0.25 },
};

// 2. 형태별 보정치 (Shape Modifiers)
const SHAPE_STATS: Record<string, { hp: number; atk: number; def: number; spd: number }> = {
  FREEFORM: { hp: 0.00,  atk: 0.00,  def: 0.00,  spd: 0.00 },
  ROUND:    { hp: 0.15,  atk: -0.15, def: 0.00,  spd: 0.00 },
  TRIANGLE: { hp: 0.00,  atk: 0.15,  def: -0.15, spd: 0.00 },
  SQUARE:   { hp: 0.00,  atk: 0.00,  def: 0.15,  spd: -0.15 },
  LONG:     { hp: -0.15, atk: 0.00,  def: 0.00,  spd: 0.15 },
};

// 3. 희귀도별 총합 (COMMON: 200 / RARE: 240 / EPIC: 280)
const TOTAL_STATS: Record<string, number> = {
  COMMON: 200,
  RARE: 240,
  EPIC: 280,
  // 폴백 전용 총합 스탯 (쓰레기/관상용 피규어 스탯)
  FALLBACK_COMMON: 40,
  FALLBACK_RARE: 60,
  FALLBACK_EPIC: 80,
};

// 4. 일반/폴백 통합 스탯 계산 함수
function calculateMonsterStats(rarity: string, material: string, shape: string, isFallback: boolean = false) {
  // 폴백 몬스터일 경우 쓰레기 스탯 총합 키 선택
  const targetRarityKey = isFallback ? `FALLBACK_${rarity}` : rarity;
  const total = TOTAL_STATS[targetRarityKey] || (isFallback ? 50 : 200);

  const matMod = MATERIAL_STATS[material] || { hp: 0, atk: 0, def: 0, spd: 0 };
  const shpMod = SHAPE_STATS[shape] || { hp: 0, atk: 0, def: 0, spd: 0 };

  const keys: Array<'hp' | 'atk' | 'def' | 'spd'> = ['hp', 'atk', 'def', 'spd'];
  const flooredStats: Record<string, number> = {};

  keys.forEach((key) => {
    const combinedMod = matMod[key] + shpMod[key];
    const exactValue = total * (0.25 + combinedMod / 2);
    // 피규어용 스탯이므로 최소 스탯은 1 보장
    flooredStats[key] = Math.max(1, Math.floor(exactValue));
  });

  return {
    baseHp: flooredStats.hp,
    baseAttack: flooredStats.atk,
    baseDefense: flooredStats.def,
    baseSpeed: flooredStats.spd,
  };
}

async function main() {
  console.log('🌱 Seed 데이터 초기화 및 삽입 시작...');

  // 1. 관계 역순 데이터 삭제 (외래키 제약조건 오류 방지)
  console.log('🧹 기존 DB 데이터 삭제 중...');
  await prisma.battleLog.deleteMany();
  await prisma.eggWalkSession.deleteMany();
  await prisma.userMonster.deleteMany();
  await prisma.egg.deleteMany();
  await prisma.scan.deleteMany();
  await prisma.monster.deleteMany();
  await prisma.boss.deleteMany();
  await prisma.rarityStepRequirement.deleteMany();
  await prisma.user.deleteMany();

  // 2. 걸음 수 요구사항 생성
  const rarityStepRequirements = [
    { rarity: 'COMMON', requiredSteps: 1000 },
    { rarity: 'RARE', requiredSteps: 5000 },
    { rarity: 'EPIC', requiredSteps: 10000 },
  ];

  for (const req of rarityStepRequirements) {
    await prisma.rarityStepRequirement.create({
      data: req as any,
    });
  }
  console.log('✅ RarityStepRequirement 생성 완료');

  // 3. Raw 몬스터 목록 데이터
  const rawMonsters = [
    // COMMON (총합 200)
    { name: '누덕이', rarity: 'COMMON', material: 'NORMAL', shape: 'FREEFORM', dropWeight: 100, imageUrl: '/images/monsters/nudeoki.png', isFallback: false },
    { name: '먼지돌이', rarity: 'COMMON', material: 'NORMAL', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/dust.png', isFallback: false },
    { name: '양말뱀', rarity: 'COMMON', material: 'NORMAL', shape: 'LONG', dropWeight: 100, imageUrl: '/images/monsters/sock_snake.png', isFallback: false },
    { name: '도깨비불', rarity: 'COMMON', material: 'FIRE', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/fire_ghost.png', isFallback: false },
    { name: '얼음도치', rarity: 'COMMON', material: 'WATER', shape: 'TRIANGLE', dropWeight: 100, imageUrl: '/images/monsters/ice_hedgehog.png', isFallback: false },
    { name: '책벌레', rarity: 'COMMON', material: 'PLANT', shape: 'LONG', dropWeight: 100, imageUrl: '/images/monsters/bookworm.png', isFallback: false },
    { name: '수은 슬라임', rarity: 'COMMON', material: 'METAL', shape: 'FREEFORM', dropWeight: 100, imageUrl: '/images/monsters/mercury_slime.png', isFallback: false },
    { name: '동전', rarity: 'COMMON', material: 'METAL', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/coin.png', isFallback: false },
    { name: '장독대', rarity: 'COMMON', material: 'CERAMIC', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/pot_of_poison.png', isFallback: false },
    { name: '뚜껑 무당벌레', rarity: 'COMMON', material: 'PLASTIC', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/plastic_ladybug.png', isFallback: false },
    { name: '유리구슬', rarity: 'COMMON', material: 'GLASS', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/glass_marble.png', isFallback: false },
    { name: '꼬마전구', rarity: 'COMMON', material: 'ELECTRIC', shape: 'ROUND', dropWeight: 100, imageUrl: '/images/monsters/lightbulb.png', isFallback: false },

    // RARE (총합 240)
    { name: '히노보즈', rarity: 'RARE', material: 'FIRE', shape: 'ROUND', dropWeight: 50, imageUrl: '/images/monsters/hinobozu.png', isFallback: false },
    { name: '스이보즈', rarity: 'RARE', material: 'WATER', shape: 'ROUND', dropWeight: 50, imageUrl: '/images/monsters/suibozu.png', isFallback: false },
    { name: '종이무사', rarity: 'RARE', material: 'PLANT', shape: 'TRIANGLE', dropWeight: 50, imageUrl: '/images/monsters/paper_warrior.png', isFallback: false },
    { name: '새피리', rarity: 'RARE', material: 'CERAMIC', shape: 'FREEFORM', dropWeight: 50, imageUrl: '/images/monsters/bird_whistle.png', isFallback: false },

    // EPIC (총합 280)
    { name: '아쿠아냥', rarity: 'EPIC', material: 'WATER', shape: 'ROUND', dropWeight: 20, imageUrl: '/images/monsters/aquanyan.png', isFallback: false },
    { name: '클리오네', rarity: 'EPIC', material: 'WATER', shape: 'TRIANGLE', dropWeight: 20, imageUrl: '/images/monsters/clione.png', isFallback: false },
    { name: '클로버', rarity: 'EPIC', material: 'PLANT', shape: 'FREEFORM', dropWeight: 20, imageUrl: '/images/monsters/clover.png', isFallback: false },
    { name: '달항아리', rarity: 'EPIC', material: 'CERAMIC', shape: 'ROUND', dropWeight: 20, imageUrl: '/images/monsters/moon_spirit.png', isFallback: false },
    { name: '삼각자', rarity: 'EPIC', material: 'PLASTIC', shape: 'TRIANGLE', dropWeight: 20, imageUrl: '/images/monsters/triangle_ruler.png', isFallback: false },
    { name: '유리공주', rarity: 'EPIC', material: 'GLASS', shape: 'SQUARE', dropWeight: 20, imageUrl: '/images/monsters/glass_princess.png', isFallback: false },
    { name: '전기 뱀장어', rarity: 'EPIC', material: 'ELECTRIC', shape: 'LONG', dropWeight: 20, imageUrl: '/images/monsters/electric_fish.png', isFallback: false },

    // FALLBACK (관상용/피규어 버기)
    { name: '버기', rarity: 'EPIC', material: 'ELECTRIC', shape: 'ROUND', dropWeight: 0, imageUrl: '/images/monsters/buggy.png', isFallback: true },
  ];

  // 4. 스탯 자동 연산 후 DB 생성
  for (const monster of rawMonsters) {
    // 🔧 isFallback 여부 전달 추가 (버기가 쓰레기 스탯으로 계산됨)
    const computedStats = calculateMonsterStats(monster.rarity, monster.material, monster.shape, monster.isFallback);

    await prisma.monster.create({
      data: {
        ...monster,
        ...computedStats,
      } as any,
    });
  }
  console.log(`✅ 몬스터 ${rawMonsters.length}종 연산 및 저장 완료`);

  // 5. 보스 데이터 생성 (파리지옥: 풀 타입 상성 적용)
  await prisma.boss.create({
    data: {
      name: '파리지옥',
      imageUrl: '/images/bosses/flytrap.png',
      hp: 2000,
      weakAttribute: 'FIRE',
      strongAttribute: 'WATER',
      isActive: true,
    } as any,
  });
  console.log('✅ 보스(파리지옥 - 풀 타입 상성) 데이터 생성 완료');

  console.log('🎉 모든 Seed 데이터 초기화 및 재생성이 완벽하게 완료되었습니다!');
}

main()
  .catch((e) => {
    console.error('❌ Seed 실행 중 오류 발생:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });