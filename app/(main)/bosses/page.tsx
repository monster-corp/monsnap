'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { Menu, Swords, Trophy, X } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  preload: false,
});

const CODE_OK = 20000;

const CRITICAL_RATE = 0.2;
const CRITICAL_MULTIPLIER = 1.5;

/**
 * 현재 MVP는 보스 1종 기준.
 * 추후 활성 보스 조회 API가 별도로 생기면 제거/변경 가능.
 */
const BOSS_ID = '3';

interface Stats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

interface FinalStats extends Stats {
  totalIv: number;
}

interface UserMonster {
  userMonsterId: string;
  monsterId: string;
  dexId: number;
  name: string;
  rarity: string;
  material: string;
  shape: string;
  imageUrl: string;

  cutoutImageUrl: string | null;

  level: number;
  catchCount: number;
  firstCaughtAt: string;
  baseStats: Stats;
  currentStats: FinalStats;
}

interface BossApiData {
  id: string;
  name: string;
  hp: number;
  timeLimitMs: number;
  weakAttribute: string | null;
  strongAttribute: string | null;
  imageUrl: string;
  cutoutImageUrl: string | null;
  bgImageUrl: string | null;
}

interface BossState extends BossApiData {
  maxHp: number;
  currentHp: number;
}

interface DamageEffect {
  id: number;
  damage: number;
  x: number;
  y: number;
  isCritical: boolean;
}

interface BattleSubmitPayload {
  userMonsterId: string;
  touchCount: number;
  criticalCount: number;
  elapsedMs: number;
}

interface BattleResult {
  battleLogId: string;
  isCleared: boolean;
  damageDealt: number;
  bossHpRemaining: number;
  damageMultiplier: number;
}

type ResultState =
  | 'none'
  | 'submitting'
  | 'victory'
  | 'failure'
  | 'error';

const MATERIAL_LABEL: Record<string, string> = {
  NORMAL: '일반',
  FIRE: '불',
  WATER: '물',
  GRASS: '풀',
  METAL: '금속',
  CERAMIC: '도자기',
  PLASTIC: '플라스틱',
  GLASS: '유리',
  ELECTRIC: '전기',
};

function MonsterSilhouette({
  className = '',
}: {
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
    >
      <path
        d="M28 38 Q26 14 36 20 Q40 26 41 34 Z"
        fill="currentColor"
      />

      <path
        d="M72 38 Q74 14 64 20 Q60 26 59 34 Z"
        fill="currentColor"
      />

      <path
        d="M50 26 Q76 26 78 52 Q79 70 74 82 Q72 88 64 88 L36 88 Q28 88 26 82 Q21 70 22 52 Q24 26 50 26 Z"
        fill="currentColor"
      />
    </svg>
  );
}

function ResultRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-white/45">
        {label}
      </span>

      <span className="font-black text-white">
        {value}
      </span>
    </div>
  );
}

export default function BossPage() {
  // ==============================================================
  // 기본 데이터
  // ==============================================================

  const [myMonsters, setMyMonsters] = useState<UserMonster[]>(
    []
  );

  const [boss, setBoss] = useState<BossState | null>(null);

  const [selectedMonster, setSelectedMonster] =
    useState<UserMonster | null>(null);

  const [isLoading, setIsLoading] = useState(true);

  const [loadError, setLoadError] = useState<string | null>(
    null
  );

  // ==============================================================
  // 몬스터 선택
  // ==============================================================

  const [isSelectModalOpen, setIsSelectModalOpen] =
    useState(false);

  const [failedMonsterImages, setFailedMonsterImages] =
    useState<Set<string>>(() => new Set());

  const [bossImageFailed, setBossImageFailed] =
    useState(false);

  // ==============================================================
  // 전투 상태
  // ==============================================================

  const [isBattleStarted, setIsBattleStarted] =
    useState(false);

  const [isBattleEnded, setIsBattleEnded] =
    useState(false);

  const [showBattleFlash, setShowBattleFlash] =
    useState(false);

  const [isHit, setIsHit] = useState(false);

  const [isCriticalHit, setIsCriticalHit] =
    useState(false);

  const [damageList, setDamageList] = useState<
    DamageEffect[]
  >([]);

  const [touchCount, setTouchCount] = useState(0);

  const [criticalCount, setCriticalCount] =
    useState(0);

  const [remainingMs, setRemainingMs] = useState(0);

  const [elapsedMs, setElapsedMs] = useState(0);

  /**
   * 전투 전: BottomNav 표시
   * 첫 타격 후: 기본적으로 숨김
   * 메뉴 보기 버튼으로 다시 표시 가능
   */
  const [showNavigation, setShowNavigation] =
    useState(true);

  // ==============================================================
  // 서버 결과
  // ==============================================================

  const [resultState, setResultState] =
    useState<ResultState>('none');

  const [battleResult, setBattleResult] =
    useState<BattleResult | null>(null);

  const [resultError, setResultError] = useState<
    string | null
  >(null);

  // ==============================================================
  // refs
  // ==============================================================

  const battleStartAtRef = useRef<number | null>(null);

  const battleEndedRef = useRef(false);

  const submittingRef = useRef(false);

  const touchCountRef = useRef(0);

  const criticalCountRef = useRef(0);

  /**
   * 서버는 모든 공격 데미지를 합친 후
   * 마지막에 Math.round() 처리한다.
   *
   * 프론트도 동일하게 하기 위해
   * raw 누적 데미지를 보관한다.
   */
  const totalRawDamageRef = useRef(0);

  const lastSubmitPayloadRef =
    useRef<BattleSubmitPayload | null>(null);

  // ==============================================================
  // 스탯 helper
  // ==============================================================

  const getMonsterHp = (
    monster: UserMonster | null
  ): number => {
    if (!monster) return 0;

    return (
      monster.currentStats?.hp ??
      monster.baseStats?.hp ??
      0
    );
  };

  const getMonsterAttack = (
    monster: UserMonster | null
  ): number => {
    if (!monster) return 0;

    return (
      monster.currentStats?.attack ??
      monster.baseStats?.attack ??
      0
    );
  };

  /**
   * 서버 lib/bosses.ts와 동일
   *
   * 약점 일치   → ×1.5
   * 반감 일치   → ×0.5
   * 일반        → ×1.0
   */
  const getDamageMultiplier = useCallback(
    (monster: UserMonster | null): number => {
      if (!monster || !boss) {
        return 1;
      }

      if (
        boss.weakAttribute &&
        monster.material === boss.weakAttribute
      ) {
        return 1.5;
      }

      if (
        boss.strongAttribute &&
        monster.material === boss.strongAttribute
      ) {
        return 0.5;
      }

      return 1;
    },
    [boss]
  );

  // ==============================================================
  // 초기 데이터 로딩
  // ==============================================================

  const loadBattleData = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);

    try {
      const [bossRes, monstersRes] = await Promise.all([
        fetch(`/api/bosses/${BOSS_ID}`),
        fetch(
          '/api/user-monsters?sort=dexId&order=asc'
        ),
      ]);

      const bossBody = await bossRes
        .json()
        .catch(() => null);

      const monstersBody = await monstersRes
        .json()
        .catch(() => null);

      // ----------------------------------------------------------
      // 보스 데이터
      // ----------------------------------------------------------

      if (
        bossRes.ok &&
        bossBody?.code === CODE_OK &&
        bossBody?.data
      ) {
        const data = bossBody.data as BossApiData;

        const loadedBoss: BossState = {
          ...data,
          maxHp: data.hp,
          currentHp: data.hp,
        };

        setBoss(loadedBoss);

        setRemainingMs(data.timeLimitMs);
      } else {
        throw new Error(
          bossBody?.message ??
            '보스 정보를 불러오지 못했어요.'
        );
      }

      // ----------------------------------------------------------
      // 유저 몬스터 데이터
      // ----------------------------------------------------------

      if (
        !monstersRes.ok ||
        monstersBody?.code !== CODE_OK
      ) {
        throw new Error(
          monstersBody?.message ??
            '보유 몬스터를 불러오지 못했어요.'
        );
      }

      const list =
        monstersBody.data?.userMonsters;

      if (!Array.isArray(list)) {
        throw new Error(
          '보유 몬스터 응답 형식이 올바르지 않습니다.'
        );
      }

      setMyMonsters(list);
    } catch (error) {
      console.error(
        '[보스전] 초기 데이터 조회 실패:',
        error
      );

      setLoadError(
        error instanceof Error
          ? error.message
          : '전투 정보를 불러오지 못했어요.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBattleData();
  }, [loadBattleData]);

  // ==============================================================
  // ATK 최고 몬스터 기본 선택
  // ==============================================================

  const sortedMonsters = useMemo(() => {
    return [...myMonsters].sort(
      (a, b) =>
        getMonsterAttack(b) -
        getMonsterAttack(a)
    );
  }, [myMonsters]);

  useEffect(() => {
    if (
      sortedMonsters.length > 0 &&
      !selectedMonster
    ) {
      setSelectedMonster(sortedMonsters[0]);
    }
  }, [sortedMonsters, selectedMonster]);

  // ==============================================================
  // 전투 결과 서버 전송
  // ==============================================================

  const submitBattleResult = useCallback(
    async (payload: BattleSubmitPayload) => {
      if (!boss || submittingRef.current) {
        return;
      }

      submittingRef.current = true;

      battleEndedRef.current = true;

      setIsBattleEnded(true);

      setResultState('submitting');

      setResultError(null);

      lastSubmitPayloadRef.current = payload;

      try {
        const res = await fetch(
          `/api/bosses/${boss.id}`,
          {
            method: 'POST',

            headers: {
              'Content-Type':
                'application/json',
            },

            body: JSON.stringify(payload),
          }
        );

        const body = await res
          .json()
          .catch(() => null);

        if (
          !res.ok ||
          body?.code !== CODE_OK ||
          !body?.data
        ) {
          throw new Error(
            body?.message ??
              '전투 결과를 확인하지 못했어요.'
          );
        }

        const result =
          body.data as BattleResult;

        setBattleResult(result);

        setResultState(
          result.isCleared
            ? 'victory'
            : 'failure'
        );

        setShowNavigation(true);
      } catch (error) {
        console.error(
          '[보스전] 결과 저장 실패:',
          error
        );

        setResultError(
          error instanceof Error
            ? error.message
            : '전투 결과 저장에 실패했어요.'
        );

        setResultState('error');

        setShowNavigation(true);
      } finally {
        submittingRef.current = false;
      }
    },
    [
      boss,
      getDamageMultiplier,
      selectedMonster,
    ]
  );

  // ==============================================================
  // 전투 타이머
  // ==============================================================

  useEffect(() => {
    if (
      !boss ||
      !isBattleStarted ||
      isBattleEnded ||
      battleStartAtRef.current === null
    ) {
      return;
    }

    const updateTimer = () => {
      const startedAt =
        battleStartAtRef.current;

      if (startedAt === null) {
        return;
      }

      const rawElapsed =
        Date.now() - startedAt;

      const visibleElapsed = Math.min(
        rawElapsed,
        boss.timeLimitMs
      );

      const nextRemaining = Math.max(
        0,
        boss.timeLimitMs - rawElapsed
      );

      setElapsedMs(visibleElapsed);

      setRemainingMs(nextRemaining);

      /**
       * 제한시간 종료
       */
      if (
        rawElapsed >= boss.timeLimitMs &&
        !battleEndedRef.current
      ) {
        battleEndedRef.current = true;

        setElapsedMs(
          boss.timeLimitMs
        );

        setRemainingMs(0);

        if (!selectedMonster) {
          return;
        }

        void submitBattleResult({
          userMonsterId:
            selectedMonster.userMonsterId,

          touchCount:
            touchCountRef.current,

          criticalCount:
            criticalCountRef.current,

          elapsedMs:
            boss.timeLimitMs,
        });
      }
    };

    updateTimer();

    const timerId = window.setInterval(
      updateTimer,
      50
    );

    return () => {
      window.clearInterval(timerId);
    };
  }, [
    boss,
    isBattleStarted,
    isBattleEnded,
    selectedMonster,
    submitBattleResult,
  ]);

  // ==============================================================
  // 보스 타격
  // ==============================================================

  const handleBossClick = (
    event: React.MouseEvent<HTMLDivElement>
  ) => {
    if (
      !boss ||
      !selectedMonster ||
      boss.currentHp <= 0 ||
      battleEndedRef.current
    ) {
      return;
    }

    let startedAt =
      battleStartAtRef.current;

    /**
     * 첫 터치 = 전투 시작
     */
    if (
      !isBattleStarted ||
      startedAt === null
    ) {
      startedAt = Date.now();

      battleStartAtRef.current =
        startedAt;

      setElapsedMs(0);

      setRemainingMs(
        boss.timeLimitMs
      );

      setIsBattleStarted(true);

      setIsBattleEnded(false);

      /**
       * 전투 몰입 모드
       *
       * 첫 터치와 동시에
       * - 몬스터 교체 잠금
       * - BottomNav 숨김
       */
      setShowNavigation(false);

      setShowBattleFlash(true);

      window.setTimeout(() => {
        setShowBattleFlash(false);
      }, 180);
    }

    // ----------------------------------------------------------
    // 터치 횟수
    // ----------------------------------------------------------

    const nextTouchCount =
      touchCountRef.current + 1;

    touchCountRef.current =
      nextTouchCount;

    setTouchCount(nextTouchCount);

    // ----------------------------------------------------------
    // 치명타 판정
    // ----------------------------------------------------------

    const isCritical =
      Math.random() <
      CRITICAL_RATE;

    const nextCriticalCount =
      criticalCountRef.current +
      (isCritical ? 1 : 0);

    criticalCountRef.current =
      nextCriticalCount;

    setCriticalCount(
      nextCriticalCount
    );

    // ----------------------------------------------------------
    // 서버와 동일한 데미지 계산
    // ----------------------------------------------------------

    const attack =
      getMonsterAttack(
        selectedMonster
      );

    const damageMultiplier =
      getDamageMultiplier(
        selectedMonster
      );

    const rawHitDamage =
      attack *
      damageMultiplier *
      (isCritical
        ? CRITICAL_MULTIPLIER
        : 1);

    const nextRawTotal =
      totalRawDamageRef.current +
      rawHitDamage;

    totalRawDamageRef.current =
      nextRawTotal;

    /**
     * 서버와 동일:
     * 전체 raw 데미지 합산 후 Math.round()
     */
    const totalDamage =
      Math.round(nextRawTotal);

    const nextHp = Math.max(
      0,
      boss.maxHp -
        totalDamage
    );

    setBoss((prev) =>
      prev
        ? {
            ...prev,
            currentHp: nextHp,
          }
        : prev
    );

    // ----------------------------------------------------------
    // 피격 연출
    // ----------------------------------------------------------

    setIsHit(true);

    setIsCriticalHit(
      isCritical
    );

    window.setTimeout(() => {
      setIsHit(false);

      setIsCriticalHit(false);
    }, isCritical ? 260 : 180);

    const rect =
      event.currentTarget.getBoundingClientRect();

    const x =
      event.clientX -
      rect.left;

    const y =
      event.clientY -
      rect.top;

    const newDamage: DamageEffect = {
      id:
        Date.now() +
        Math.random(),

      damage: Math.round(
        rawHitDamage
      ),

      x,

      y,

      isCritical,
    };

    setDamageList((prev) => [
      ...prev,
      newDamage,
    ]);

    window.setTimeout(() => {
      setDamageList((prev) =>
        prev.filter(
          (damage) =>
            damage.id !==
            newDamage.id
        )
      );
    }, 800);

    // ----------------------------------------------------------
    // HP 0 → 종료
    // ----------------------------------------------------------

    if (
      nextHp === 0 &&
      !battleEndedRef.current
    ) {
      battleEndedRef.current =
        true;

      const finalElapsed =
        Math.min(
          Date.now() -
            startedAt,
          boss.timeLimitMs
        );

      setElapsedMs(
        finalElapsed
      );

      setRemainingMs(
        Math.max(
          0,
          boss.timeLimitMs -
            finalElapsed
        )
      );

      /**
       * 보스 쓰러지는 애니메이션을
       * 아주 잠깐 보여준 뒤 결과 전송.
       */
      window.setTimeout(() => {
        void submitBattleResult({
          userMonsterId:
            selectedMonster.userMonsterId,

          touchCount:
            nextTouchCount,

          criticalCount:
            nextCriticalCount,

          elapsedMs:
            finalElapsed,
        });
      }, 280);
    }
  };

  // ==============================================================
  // 몬스터 선택
  // ==============================================================

  const handleOpenSelectModal = () => {
    if (
      isBattleStarted ||
      myMonsters.length === 0
    ) {
      return;
    }

    setIsSelectModalOpen(true);
  };

  const handleMonsterImageError = (
    userMonsterId: string
  ) => {
    setFailedMonsterImages(
      (prev) => {
        const next =
          new Set(prev);

        next.add(
          userMonsterId
        );

        return next;
      }
    );
  };

  // ==============================================================
  // 전투 초기화
  // ==============================================================

  const resetBattle = () => {
    setBoss((prev) =>
      prev
        ? {
            ...prev,
            currentHp:
              prev.maxHp,
          }
        : prev
    );

    setIsBattleStarted(false);

    setIsBattleEnded(false);

    setTouchCount(0);

    setCriticalCount(0);

    touchCountRef.current = 0;

    criticalCountRef.current = 0;

    totalRawDamageRef.current = 0;

    battleStartAtRef.current = null;

    battleEndedRef.current = false;

    submittingRef.current = false;

    setElapsedMs(0);

    setRemainingMs(
      boss?.timeLimitMs ??
        30000
    );

    setDamageList([]);

    setResultState('none');

    setBattleResult(null);

    setResultError(null);

    lastSubmitPayloadRef.current =
      null;

    setShowNavigation(true);

    setBossImageFailed(false);
  };

  // ==============================================================
  // 결과 API 재전송
  // ==============================================================

  const retryBattleResult = () => {
    const payload =
      lastSubmitPayloadRef.current;

    if (!payload) {
      return;
    }

    void submitBattleResult(
      payload
    );
  };

  // ==============================================================
  // derived
  // ==============================================================

  const hpPercentage = boss
    ? Math.max(
        0,
        (boss.currentHp /
          boss.maxHp) *
          100
      )
    : 0;

  const selectedMultiplier = boss ? getDamageMultiplier(selectedMonster) : 1;

  // DB/API 이미지를 우선 사용하고, 값이 없을 때는 기존 로컬 이미지를 사용합니다.
  const bossBackgroundUrl =
    boss?.bgImageUrl || '/images/boss-bg.jpg';

  const bossCutoutUrl =
    boss?.cutoutImageUrl ||
    boss?.imageUrl ||
    '/images/boss.png';

  /**
   * 실제 전투 중이고
   * 메뉴도 숨긴 상태일 때만
   * BottomNav를 숨긴다.
   */
  const focusMode =
    isBattleStarted &&
    !isBattleEnded &&
    !showNavigation;

  /**
   * layout.tsx에 BottomNav 표시/숨김 상태를 전달한다.
   * 전투 시작 후 집중 모드에서는 숨기고, 메뉴 보기/전투 종료/페이지 이탈 시 복구한다.
   */
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent('monsnap:bottom-nav-visibility', {
        detail: { hidden: focusMode },
      })
    );

    return () => {
      window.dispatchEvent(
        new CustomEvent('monsnap:bottom-nav-visibility', {
          detail: { hidden: false },
        })
      );
    };
  }, [focusMode]);

  // ==============================================================
  // 로딩
  // ==============================================================

  if (isLoading) {
    return (
      <div
        className={`${notoSans.className} h-full w-full bg-black flex items-center justify-center`}
      >
        <div className="flex flex-col items-center gap-3 text-white">
          <div className="w-7 h-7 border-2 border-white border-t-transparent rounded-full animate-spin" />

          <p className="text-sm font-bold">
            전투 준비 중...
          </p>
        </div>
      </div>
    );
  }

  // ==============================================================
  // 로딩 실패
  // ==============================================================

  if (
    loadError ||
    !boss
  ) {
    return (
      <div
        className={`${notoSans.className} h-full w-full bg-[#101410] flex flex-col items-center justify-center px-6`}
      >
        <p className="text-sm font-bold text-white text-center mb-2">
          보스전 정보를 불러오지
          못했어요.
        </p>

        <p className="text-xs text-white/50 text-center mb-5">
          {loadError}
        </p>

        <button
          type="button"
          onClick={() =>
            void loadBattleData()
          }
          className="px-5 py-2.5 rounded-xl bg-[#1F4B3C] text-white text-sm font-bold active:scale-95 transition-transform"
        >
          다시 시도
        </button>
      </div>
    );
  }

  // ==============================================================
  // 화면
  // ==============================================================

  return (
    <div
      className={`${notoSans.className} relative h-full w-full overflow-hidden bg-black flex flex-col select-none`}
    >
      {/* ======================================================== */}
      {/* 전투 중 메뉴 토글 */}
      {/* ======================================================== */}

      {isBattleStarted &&
        !isBattleEnded && (
          <button
            type="button"
            onClick={() =>
              setShowNavigation(
                (prev) => !prev
              )
            }
            className="absolute z-[45] top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/55 backdrop-blur-md border border-white/15 px-3 py-2 text-[11px] font-bold text-white shadow-lg active:scale-95 transition-transform"
          >
            <Menu size={14} />

            {showNavigation
              ? '전투 집중'
              : '메뉴 보기'}
          </button>
        )}

      {/* ======================================================== */}
      {/* 보스전 배경 */}
      {/* ======================================================== */}

      <div
        className="absolute inset-0 bg-cover bg-center pointer-events-none scale-[1.02]"
        style={{
          // 원격 배경이 깨져도 기존 로컬 배경이 뒤에서 표시됩니다.
          backgroundImage: boss.bgImageUrl
            ? `url("${bossBackgroundUrl}"), url("/images/boss-bg.jpg")`
            : `url("/images/boss-bg.jpg")`,
        }}
      />

      <div className="absolute inset-0 bg-black/20 pointer-events-none" />

      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/45 pointer-events-none" />

      {/* ======================================================== */}
      {/* 전투 시작 섬광 */}
      {/* ======================================================== */}

      {showBattleFlash && (
        <div className="absolute inset-0 bg-white/15 z-40 pointer-events-none animate-battle-flash" />
      )}

      {/* ======================================================== */}
      {/* 상단 보스 정보 */}
      {/* ======================================================== */}

      <header className="relative z-10 shrink-0 px-4 pt-4">
        {isBattleStarted ? (
          <div className="w-full max-w-sm mx-auto flex flex-col items-center animate-hp-enter">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 text-[10px] font-black bg-red-600 text-white rounded-md shadow-[0_0_12px_rgba(220,38,38,0.65)]">
                BOSS
              </span>

              <h1 className="text-xl font-black text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                {boss.name}
              </h1>
            </div>

            {/* HP */}
            <div className="relative w-full bg-black/70 backdrop-blur-md border border-white/15 rounded-full h-5 p-[3px] shadow-xl overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 rounded-full transition-[width] duration-200 ease-out"
                style={{
                  width: `${hpPercentage}%`,
                }}
              />

              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-white drop-shadow-md pointer-events-none">
                {boss.currentHp} /{' '}
                {boss.maxHp}
              </span>
            </div>

            {/* 남은 시간 */}
            <div className="mt-2 px-3 py-1 rounded-full bg-black/55 backdrop-blur-md border border-white/10 text-xs font-black text-white tabular-nums shadow-lg">
              남은 시간{' '}
              {Math.ceil(
                remainingMs / 1000
              )}
              초
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 text-[10px] font-black bg-red-600 text-white rounded-md shadow-[0_0_12px_rgba(220,38,38,0.65)]">
                BOSS
              </span>

              <h1 className="text-2xl font-black text-white drop-shadow-[0_2px_5px_rgba(0,0,0,0.95)]">
                {boss.name}
              </h1>
            </div>

            {/*
              요청사항:
              기존 검은 캡슐/탭 제거.
              문구만 표시.
            */}
            <p className="text-sm font-bold text-amber-300 text-center tracking-tight drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] animate-guide-pulse">
              {selectedMonster
                ? '보스를 터치하여 전투를 시작하세요!'
                : '출전할 몬스터가 필요합니다.'}
            </p>
          </div>
        )}
      </header>

      {/* ======================================================== */}
      {/* 보스 캐릭터 */}
      {/* ======================================================== */}

      <section className="relative z-10 flex-1 min-h-0 flex items-center justify-center px-4">
        <div
          onClick={handleBossClick}
          className={`relative ${
            selectedMonster &&
            !isBattleEnded
              ? 'cursor-pointer touch-manipulation'
              : 'cursor-default'
          } ${
            boss.currentHp === 0
              ? 'animate-boss-defeat'
              : isHit
                ? isCriticalHit
                  ? 'animate-boss-critical-hit'
                  : 'animate-boss-hit'
                : 'animate-boss-idle'
          }`}
        >
          {bossImageFailed ? (
            <MonsterSilhouette className="w-56 h-56 sm:w-64 sm:h-64 text-white/25 drop-shadow-2xl" />
          ) : (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={
                  bossCutoutUrl
                }
                alt={boss.name}
                draggable={false}
                onError={(event) => {
                  const image = event.currentTarget;
                  const fallbackStep = image.dataset.fallbackStep;

                  // 1차: 누끼 이미지 실패 시 일반 보스 이미지
                  if (
                    fallbackStep !== 'imageUrl' &&
                    boss.imageUrl &&
                    image.src !== boss.imageUrl
                  ) {
                    image.dataset.fallbackStep = 'imageUrl';
                    image.src = boss.imageUrl;
                    return;
                  }

                  // 2차: 원격 이미지 실패 시 기존 로컬 이미지
                  if (fallbackStep !== 'local') {
                    image.dataset.fallbackStep = 'local';
                    image.src = '/images/boss.png';
                    return;
                  }

                  // 로컬 이미지까지 실패한 경우에만 실루엣 표시
                  setBossImageFailed(true);
                }}
                className={`w-60 h-60 sm:w-72 sm:h-72 object-contain pointer-events-none transition-[filter] duration-150 ${
                  isCriticalHit
                    ? 'brightness-150 drop-shadow-[0_0_35px_rgba(248,113,113,0.95)]'
                    : isHit
                      ? 'brightness-125 drop-shadow-[0_0_24px_rgba(239,68,68,0.75)]'
                      : 'drop-shadow-[0_18px_24px_rgba(0,0,0,0.65)]'
                }`}
              />
            </>
          )}

          {/* 데미지 표시 */}
          {damageList.map(
            (item) => (
              <div
                key={item.id}
                className={`absolute pointer-events-none font-black drop-shadow-[0_3px_5px_rgba(0,0,0,0.95)] animate-damage-float ${
                  item.isCritical
                    ? 'text-3xl sm:text-4xl text-red-300'
                    : 'text-2xl sm:text-3xl text-yellow-200'
                }`}
                style={{
                  left: `${item.x}px`,
                  top: `${item.y - 18}px`,
                }}
              >
                {item.isCritical && (
                  <span className="block text-[10px] sm:text-xs text-center text-red-200 tracking-widest mb-0.5">
                    CRITICAL
                  </span>
                )}

                -{item.damage}
              </div>
            )
          )}
        </div>
      </section>

      {/* ======================================================== */}
      {/* 출전 몬스터 카드 */}
      {/* ======================================================== */}

      <footer className="relative z-10 shrink-0 px-4 pb-4">
        <div className="w-full max-w-sm mx-auto">
          {selectedMonster ? (
            <div
              onClick={
                isBattleStarted
                  ? undefined
                  : handleOpenSelectModal
              }
              className={`bg-[#101722]/92 backdrop-blur-md rounded-2xl px-4 py-3 shadow-2xl border flex items-center justify-between transition-all ${
                isBattleStarted
                  ? 'border-white/10 cursor-default'
                  : 'border-white/15 cursor-pointer active:scale-[0.98]'
              }`}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                {/* 몬스터 이미지 */}
                <div className="w-16 h-16 rounded-xl bg-black/35 border border-white/10 flex items-center justify-center overflow-hidden shrink-0">
                  {failedMonsterImages.has(
                    selectedMonster.userMonsterId
                  ) ? (
                    <MonsterSilhouette className="w-11 h-11 text-white/20" />
                  ) : (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={
                          selectedMonster.cutoutImageUrl ||
                          selectedMonster.imageUrl
                        }
                        alt={
                          selectedMonster.name
                        }
                        onError={() =>
                          handleMonsterImageError(
                            selectedMonster.userMonsterId
                          )
                        }
                        className={`w-full h-full ${
                          selectedMonster.cutoutImageUrl
                            ? 'object-contain p-1'
                            : 'object-cover scale-[1.18]'
                        }`}
                      />
                    </>
                  )}
                </div>

                {/* 몬스터 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[11px] font-bold text-white/45">
                      HP
                    </span>

                    <span className="text-lg font-black text-amber-300">
                      {getMonsterHp(
                        selectedMonster
                      )}
                    </span>

                    <span className="text-[11px] font-bold text-white/45">
                      ATK{' '}
                      {getMonsterAttack(
                        selectedMonster
                      )}
                    </span>
                  </div>

                  <p className="text-sm font-bold text-white truncate">
                    {selectedMonster.name}
                  </p>

                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="text-[10px] text-white/45">
                      {MATERIAL_LABEL[
                        selectedMonster.material
                      ] ??
                        selectedMonster.material}
                    </span>

                    {selectedMultiplier ===
                      1.5 && (
                      <span className="text-[10px] font-black text-red-300">
                        효과적 ×1.5
                      </span>
                    )}

                    {selectedMultiplier ===
                      0.5 && (
                      <span className="text-[10px] font-black text-blue-300">
                        반감 ×0.5
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 교체 / 전투 중 */}
              {isBattleStarted ? (
                <span className="shrink-0 ml-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-[11px] font-bold text-white/35">
                  전투 중
                </span>
              ) : (
                <span className="shrink-0 ml-2 px-3 py-2 rounded-xl bg-emerald-950/80 border border-emerald-600/60 text-[11px] font-bold text-emerald-300">
                  교체 ▲
                </span>
              )}
            </div>
          ) : (
            <Link
              href="/scans"
              className="w-full bg-black/60 backdrop-blur-md rounded-2xl p-4 border border-dashed border-white/20 flex flex-col items-center text-center"
            >
              <p className="text-sm font-bold text-white">
                보유 중인 몬스터가
                없습니다
              </p>

              <p className="text-xs text-emerald-300 mt-1">
                스캔에서 첫 몬스터를
                만나보세요.
              </p>
            </Link>
          )}
        </div>
      </footer>

      {/* ======================================================== */}
      {/* 몬스터 선택 모달 */}
      {/* ======================================================== */}

      {isSelectModalOpen &&
        !isBattleStarted &&
        myMonsters.length > 0 && (
          <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/65 backdrop-blur-sm animate-fade-in p-4 pb-4">
            <div
              className="flex-1"
              onClick={() =>
                setIsSelectModalOpen(
                  false
                )
              }
            />

            <div className="w-full max-w-sm mx-auto bg-[#111713]/95 backdrop-blur-xl rounded-3xl p-5 shadow-2xl animate-slide-up border border-white/10 max-h-[72svh] flex flex-col">
              <div className="w-10 h-1 bg-white/15 rounded-full mx-auto mb-4 shrink-0" />

              <div className="flex items-start justify-between mb-4 shrink-0">
                <div>
                  <h3 className="text-lg font-black text-white">
                    출전 몬스터 선택
                  </h3>

                  <p className="text-xs text-white/40 mt-1">
                    전투에 참여할
                    몬스터를 고르세요.
                  </p>
                </div>

                <button
                  type="button"
                  aria-label="닫기"
                  onClick={() =>
                    setIsSelectModalOpen(
                      false
                    )
                  }
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/60 active:scale-90 transition-transform"
                >
                  <X size={17} />
                </button>
              </div>

              <div className="overflow-y-auto grid grid-cols-3 gap-2.5 p-1">
                {sortedMonsters.map(
                  (monster) => {
                    const isSelected =
                      monster.userMonsterId ===
                      selectedMonster?.userMonsterId;

                    const multiplier =
                      getDamageMultiplier(
                        monster
                      );

                    const imageFailed =
                      failedMonsterImages.has(
                        monster.userMonsterId
                      );

                    return (
                      <button
                        type="button"
                        key={
                          monster.userMonsterId
                        }
                        onClick={() => {
                          setSelectedMonster(
                            monster
                          );

                          setIsSelectModalOpen(
                            false
                          );
                        }}
                        className={`relative flex flex-col items-center p-2.5 rounded-2xl border transition-all active:scale-95 ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-950/60 ring-1 ring-emerald-500/35'
                            : 'border-white/10 bg-black/25'
                        }`}
                      >
                        {isSelected && (
                          <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-400 rounded-full" />
                        )}

                        <div className="w-14 h-14 mb-2 bg-black/30 rounded-xl flex items-center justify-center overflow-hidden">
                          {imageFailed ? (
                            <MonsterSilhouette className="w-10 h-10 text-white/20" />
                          ) : (
                            <>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  monster.cutoutImageUrl ||
                                  monster.imageUrl
                                }
                                alt={
                                  monster.name
                                }
                                onError={() =>
                                  handleMonsterImageError(
                                    monster.userMonsterId
                                  )
                                }
                                className={`w-full h-full ${
                                  monster.cutoutImageUrl
                                    ? 'object-contain p-1'
                                    : 'object-cover scale-[1.18]'
                                }`}
                              />
                            </>
                          )}
                        </div>

                        <p className="w-full text-xs font-bold text-white truncate text-center">
                          {monster.name}
                        </p>

                        <p className="mt-1 text-[10px] font-black text-amber-300">
                          ATK{' '}
                          {getMonsterAttack(
                            monster
                          )}
                        </p>

                        {multiplier ===
                          1.5 && (
                          <span className="mt-1 text-[9px] font-black text-red-300">
                            ×1.5
                          </span>
                        )}

                        {multiplier ===
                          0.5 && (
                          <span className="mt-1 text-[9px] font-black text-blue-300">
                            ×0.5
                          </span>
                        )}
                      </button>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

      {/* ======================================================== */}
      {/* 결과 서버 확인 중 */}
      {/* ======================================================== */}

      {resultState ===
        'submitting' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur-sm p-6">
          <div className="flex flex-col items-center gap-3 text-white">
            <div className="w-8 h-8 border-[3px] border-white border-t-transparent rounded-full animate-spin" />

            <p className="text-sm font-black">
              전투 결과 확인 중...
            </p>

            <p className="text-xs text-white/45 text-center">
              서버에서 전투 결과를
              검증하고 있어요.
            </p>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 승리 */}
      {/* ======================================================== */}

      {resultState ===
        'victory' &&
        battleResult && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-5 animate-fade-in">
            <div className="w-full max-w-xs bg-[#0E120F] border border-amber-400/35 rounded-3xl p-5 text-center shadow-2xl">
              <div className="mx-auto w-12 h-12 rounded-full bg-amber-400/10 flex items-center justify-center mb-3">
                <Trophy
                  size={26}
                  className="text-amber-300"
                />
              </div>

              <h2 className="text-2xl font-black text-amber-300">
                처치 성공!
              </h2>

              <p className="text-sm text-white/60 mt-1 mb-5">
                {boss.name}을
                쓰러뜨렸습니다.
              </p>

              <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 space-y-2.5 mb-4">
                <ResultRow
                  label="총 피해량"
                  value={`${battleResult.damageDealt}`}
                />

                <ResultRow
                  label="공격 횟수"
                  value={`${touchCount}회`}
                />

                <ResultRow
                  label="치명타"
                  value={`${criticalCount}회`}
                />

                <ResultRow
                  label="전투 시간"
                  value={`${(
                    elapsedMs / 1000
                  ).toFixed(1)}초`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={
                    resetBattle
                  }
                  className="py-3 rounded-xl bg-amber-400 text-[#151006] text-xs font-black active:scale-95 transition-transform"
                >
                  다시 도전
                </button>

                <Link
                  href="/my-monsters"
                  className="py-3 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-bold flex items-center justify-center active:scale-95 transition-transform"
                >
                  내 몬스터
                </Link>
              </div>
            </div>
          </div>
        )}

      {/* ======================================================== */}
      {/* 실패 */}
      {/* ======================================================== */}

      {resultState ===
        'failure' &&
        battleResult && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-5 animate-fade-in">
            <div className="w-full max-w-xs bg-[#0E120F] border border-red-500/30 rounded-3xl p-5 text-center shadow-2xl">
              <div className="mx-auto w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-3">
                <Swords
                  size={24}
                  className="text-red-300"
                />
              </div>

              <h2 className="text-xl font-black text-red-300">
                전투 실패
              </h2>

              <p className="text-sm text-white/55 mt-1 mb-5">
                제한 시간 안에 보스를
                쓰러뜨리지 못했습니다.
              </p>

              <div className="bg-white/[0.05] border border-white/10 rounded-2xl p-4 space-y-2.5 mb-4">
                <ResultRow
                  label="총 피해량"
                  value={`${battleResult.damageDealt}`}
                />

                <ResultRow
                  label="남은 보스 HP"
                  value={`${battleResult.bossHpRemaining}`}
                />

                <ResultRow
                  label="공격 횟수"
                  value={`${touchCount}회`}
                />

                <ResultRow
                  label="치명타"
                  value={`${criticalCount}회`}
                />

                <ResultRow
                  label="전투 시간"
                  value={`${(
                    elapsedMs / 1000
                  ).toFixed(1)}초`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={
                    resetBattle
                  }
                  className="py-3 rounded-xl bg-red-600 text-white text-xs font-black active:scale-95 transition-transform"
                >
                  다시 도전
                </button>

                <button
                  type="button"
                  onClick={() => {
                    resetBattle();

                    setTimeout(() => {
                      setIsSelectModalOpen(
                        true
                      );
                    }, 0);
                  }}
                  className="py-3 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-bold active:scale-95 transition-transform"
                >
                  몬스터 교체
                </button>
              </div>
            </div>
          </div>
        )}

      {/* ======================================================== */}
      {/* 결과 확인 오류 */}
      {/* ======================================================== */}

      {resultState ===
        'error' && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 backdrop-blur-md p-5 animate-fade-in">
          <div className="w-full max-w-xs bg-[#0E120F] border border-white/15 rounded-3xl p-5 text-center shadow-2xl">
            <h2 className="text-lg font-black text-white">
              결과를 확인하지
              못했어요
            </h2>

            <p className="text-xs text-white/50 mt-2 mb-5 leading-relaxed">
              {resultError ??
                '네트워크 상태를 확인해주세요.'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={
                  retryBattleResult
                }
                className="py-3 rounded-xl bg-[#1F4B3C] text-white text-xs font-black active:scale-95 transition-transform"
              >
                다시 확인
              </button>

              <button
                type="button"
                onClick={
                  resetBattle
                }
                className="py-3 rounded-xl bg-white/10 border border-white/10 text-white text-xs font-bold active:scale-95 transition-transform"
              >
                전투 준비로
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 애니메이션 */}
      {/* ======================================================== */}

      <style jsx>{`
        @keyframes bossIdle {
          0%,
          100% {
            transform: translateY(0)
              scale(1);
          }

          50% {
            transform: translateY(-6px)
              scale(1.012);
          }
        }

        @keyframes bossHit {
          0% {
            transform: translateX(0)
              scale(1);
          }

          35% {
            transform: translateX(-7px)
              scale(0.985);
          }

          70% {
            transform: translateX(4px)
              scale(1.005);
          }

          100% {
            transform: translateX(0)
              scale(1);
          }
        }

        @keyframes bossCriticalHit {
          0% {
            transform: translateX(0)
              scale(1);
          }

          25% {
            transform: translateX(-12px)
              rotate(-1.5deg)
              scale(0.96);
          }

          55% {
            transform: translateX(8px)
              rotate(1deg)
              scale(1.035);
          }

          100% {
            transform: translateX(0)
              rotate(0)
              scale(1);
          }
        }

        @keyframes bossDefeat {
          0% {
            transform: translateY(0)
              scale(1);
            opacity: 1;
          }

          70% {
            transform: translateY(10px)
              scale(0.95);
            opacity: 0.75;
          }

          100% {
            transform: translateY(28px)
              scale(0.88);
            opacity: 0.35;
          }
        }

        @keyframes damageFloat {
          0% {
            opacity: 0;
            transform: translateY(4px)
              scale(0.85);
          }

          20% {
            opacity: 1;
            transform: translateY(-6px)
              scale(1.12);
          }

          100% {
            opacity: 0;
            transform: translateY(-48px)
              scale(0.9);
          }
        }

        @keyframes hpEnter {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes guidePulse {
          0%,
          100% {
            opacity: 0.82;
          }

          50% {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(24px);
          }

          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
          }

          to {
            opacity: 1;
          }
        }

        @keyframes battleFlash {
          from {
            opacity: 1;
          }

          to {
            opacity: 0;
          }
        }

        .animate-boss-idle {
          animation: bossIdle 3.4s
            ease-in-out infinite;
        }

        .animate-boss-hit {
          animation: bossHit 0.18s
            ease-out;
        }

        .animate-boss-critical-hit {
          animation: bossCriticalHit
            0.26s ease-out;
        }

        .animate-boss-defeat {
          animation: bossDefeat 0.65s
            ease-out forwards;
        }

        .animate-damage-float {
          animation: damageFloat 0.8s
            ease-out forwards;
        }

        .animate-hp-enter {
          animation: hpEnter 0.3s
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            )
            forwards;
        }

        .animate-guide-pulse {
          animation: guidePulse 2.2s
            ease-in-out infinite;
        }

        .animate-slide-up {
          animation: slideUp 0.28s
            cubic-bezier(
              0.16,
              1,
              0.3,
              1
            )
            forwards;
        }

        .animate-fade-in {
          animation: fadeIn 0.2s
            ease-out forwards;
        }

        .animate-battle-flash {
          animation: battleFlash 0.18s
            ease-out forwards;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-boss-idle,
          .animate-boss-hit,
          .animate-boss-critical-hit,
          .animate-boss-defeat,
          .animate-damage-float,
          .animate-hp-enter,
          .animate-guide-pulse,
          .animate-slide-up,
          .animate-fade-in,
          .animate-battle-flash {
            animation: none !important;
          }
        }
      `}</style>


    </div>
  );
}
