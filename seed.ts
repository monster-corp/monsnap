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
    { name: '누덕이', rarity: 'COMMON', material: 'NORMAL', shape: 'FREEFORM', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%88%84%EB%8D%95%EC%9D%B4.png', isFallback: false },
    { name: '먼지돌이', rarity: 'COMMON', material: 'NORMAL', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%A8%BC%EC%A7%80%EB%8F%8C%EC%9D%B4.png', isFallback: false },
    { name: '소키', rarity: 'COMMON', material: 'NORMAL', shape: 'LONG', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%86%8C%ED%82%A4.png', isFallback: false },
    { name: '플레미', rarity: 'COMMON', material: 'FIRE', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%94%8C%EB%A0%88%EB%AF%B8.png', isFallback: false },
    { name: '얼음도치', rarity: 'COMMON', material: 'WATER', shape: 'TRIANGLE', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%96%BC%EC%9D%8C%EB%8F%84%EC%B9%98.png', isFallback: false },
    { name: '북러버', rarity: 'COMMON', material: 'PLANT', shape: 'LONG', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%B6%81%EB%9F%AC%EB%B2%84.png', isFallback: false },
    { name: '아르젠', rarity: 'COMMON', material: 'METAL', shape: 'FREEFORM', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%95%84%EB%A5%B4%EC%A0%A0.png', isFallback: false },
    { name: '페니', rarity: 'COMMON', material: 'METAL', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%8E%98%EB%8B%88.png', isFallback: false },
    { name: '독지기', rarity: 'COMMON', material: 'CERAMIC', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%8F%85%EC%A7%80%EA%B8%B0.png', isFallback: false },
    { name: '캡버그', rarity: 'COMMON', material: 'PLASTIC', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%BA%A1%EB%B2%84%EA%B7%B8.png', isFallback: false },
    { name: '글래시스', rarity: 'COMMON', material: 'GLASS', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EA%B8%80%EB%9E%98%EC%8B%9C%EC%8A%A4.png', isFallback: false },
    { name: '전구리', rarity: 'COMMON', material: 'ELECTRIC', shape: 'ROUND', dropWeight: 70, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%A0%84%EA%B5%AC%EB%A6%AC.png', isFallback: false },

    // RARE (총합 240)
    { name: '크래키', rarity: 'RARE', material: 'NORMAL', shape: 'TRIANGLE', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%81%AC%EB%9E%98%ED%82%A4.png', isFallback: false },
    { name: '히노보즈', rarity: 'RARE', material: 'FIRE', shape: 'ROUND', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%9E%88%EB%85%B8%EB%B3%B4%EC%A6%88.png', isFallback: false },
    { name: '스이보즈', rarity: 'RARE', material: 'WATER', shape: 'ROUND', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%8A%A4%EC%9D%B4%EB%B3%B4%EC%A6%88.png', isFallback: false },
    { name: '오리가미', rarity: 'RARE', material: 'PLANT', shape: 'TRIANGLE', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%98%A4%EB%A6%AC%EA%B0%80%EB%AF%B8.png', isFallback: false },
    { name: '아마다스', rarity: 'RARE', material: 'METAL', shape: 'ROUND', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%95%84%EB%A7%88%EB%8B%A4%EC%8A%A4.png', isFallback: false },
    { name: '비색조', rarity: 'RARE', material: 'CERAMIC', shape: 'FREEFORM', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%B9%84%EC%83%89%EC%A1%B0.png', isFallback: false },
    { name: '블록킹', rarity: 'RARE', material: 'PLASTIC', shape: 'SQUARE', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%B8%94%EB%A1%9D%ED%82%B9.png', isFallback: false },
    { name: '영경검', rarity: 'RARE', material: 'GLASS', shape: 'TRIANGLE', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%98%81%EA%B2%BD%EA%B2%80.png', isFallback: false },
    { name: '무드덕', rarity: 'RARE', material: 'ELECTRIC', shape: 'ROUND', dropWeight: 25, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%AC%B4%EB%93%9C%EB%8D%95.png', isFallback: false },

    // EPIC (총합 280)
    { name: '파라카스', rarity: 'EPIC', material: 'NORMAL', shape: 'FREEFORM', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%8C%8C%EB%9D%BC%EC%B9%B4%EC%8A%A4.png', isFallback: false },
    { name: '화령조', rarity: 'EPIC', material: 'FIRE', shape: 'FREEFORM', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%99%94%EB%A0%B9%EC%A1%B0.png', isFallback: false },
    { name: '아쿠아냥', rarity: 'EPIC', material: 'WATER', shape: 'ROUND', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%95%84%EC%BF%A0%EC%95%84%EB%83%A5.png', isFallback: false },
    { name: '아쿠아엘', rarity: 'EPIC', material: 'WATER', shape: 'TRIANGLE', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%95%84%EC%BF%A0%EC%95%84%EC%97%98.png', isFallback: false },
    { name: '클로버드', rarity: 'EPIC', material: 'PLANT', shape: 'FREEFORM', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%81%B4%EB%A1%9C%EB%B2%84%EB%93%9C.png', isFallback: false },
    { name: '메탈리퍼', rarity: 'EPIC', material: 'METAL', shape: 'TRIANGLE', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%A9%94%ED%83%88%EB%A6%AC%ED%8D%BC.png', isFallback: false },
    { name: '월영', rarity: 'EPIC', material: 'CERAMIC', shape: 'ROUND', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EC%9B%94%EC%98%81.png', isFallback: false },
    { name: '트라플라', rarity: 'EPIC', material: 'PLASTIC', shape: 'TRIANGLE', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%8A%B8%EB%9D%BC%ED%94%8C%EB%9D%BC.png', isFallback: false },
    { name: '프리즘퀸', rarity: 'EPIC', material: 'GLASS', shape: 'SQUARE', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%94%84%EB%A6%AC%EC%A6%98%ED%80%B8.png', isFallback: false },
    { name: '볼트라돈', rarity: 'EPIC', material: 'ELECTRIC', shape: 'LONG', dropWeight: 5, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%B3%BC%ED%8A%B8%EB%9D%BC%EB%8F%88.png', isFallback: false },

    // FALLBACK (관상용/피규어 버기)
    { name: '버기', rarity: 'EPIC', material: 'ELECTRIC', shape: 'ROUND', dropWeight: 0, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%EB%B2%84%EA%B8%B0.png', isFallback: true },
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
      imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/%ED%8C%8C%EB%A6%AC%EC%A7%80%EC%98%A5.png',
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