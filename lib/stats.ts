export interface BaseStats {
  baseHp: number;
  baseAttack: number;
  baseDefense: number;
  baseSpeed: number;
}

export interface IVStats {
  ivHp: number;      // -10 ~ +10 (%)
  ivAttack: number;  // -10 ~ +10 (%)
  ivDefense: number; // -10 ~ +10 (%)
  ivSpeed: number;   // -10 ~ +10 (%)
}

export interface FinalStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
  totalIv: number;
}

/**
 * 알 부화 시 각 스탯별로 -10% ~ +10% 사이의 정수 개체값(IV)을 랜덤 생성합니다.
 */
export function generateRandomIVs(): IVStats {
  const getRandomIv = () => Math.floor(Math.random() * 21) - 10; // -10 ~ +10
  return {
    ivHp: getRandomIv(),
    ivAttack: getRandomIv(),
    ivDefense: getRandomIv(),
    ivSpeed: getRandomIv(),
  };
}

/**
 * 기본 종족값(BaseStats)에 비율 기반 개체값(-10% ~ +10%)을 적용하여 최종 스탯을 산출합니다.
 * 수식: Math.max(1, Math.floor( Base * (1 + IV / 100) ))
 */
export function calculateFinalStats(baseStats: BaseStats, ivs: IVStats): FinalStats {
  const applyRatioIv = (base: number, ivPercentage: number) => {
    const exact = base * (1 + ivPercentage / 100);
    return Math.max(1, Math.floor(exact)); // 최소 스탯 1 보장
  };

  const totalIv = ivs.ivHp + ivs.ivAttack + ivs.ivDefense + ivs.ivSpeed;

  return {
    hp: applyRatioIv(baseStats.baseHp, ivs.ivHp),
    attack: applyRatioIv(baseStats.baseAttack, ivs.ivAttack),
    defense: applyRatioIv(baseStats.baseDefense, ivs.ivDefense),
    speed: applyRatioIv(baseStats.baseSpeed, ivs.ivSpeed),
    totalIv,
  };
}