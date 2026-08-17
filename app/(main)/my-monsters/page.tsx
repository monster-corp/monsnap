'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Sparkles } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  preload: false,
});

const CODE_OK = 20000;

// 서버가 지원하는 정렬 기준 (lib/user-monsters.ts의 SORT_FIELDS)
const SORT_OPTIONS = [
  { key: 'dexId', order: 'asc', label: '번호순' },
  { key: 'level', order: 'desc', label: '레벨순' },
  { key: 'firstCaughtAt', order: 'desc', label: '최신순' },
] as const;

type SortKey = (typeof SORT_OPTIONS)[number]['key'];

type Stats = {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
};

type FinalStats = Stats & {
  totalIv: number;
};

type PendingIv = {
  ivHp: number;
  ivAttack: number;
  ivDefense: number;
  ivSpeed: number;
};

type UserMonster = {
  userMonsterId: string;
  monsterId: string;
  dexId: number;
  name: string;
  rarity: string;
  material: string;
  shape: string;
  imageUrl: string;
  level: number;
  catchCount: number;
  firstCaughtAt: string;
  baseStats: Stats;
  currentStats: FinalStats;
  pendingIv: PendingIv | null;
  pendingStats: FinalStats | null;
};

const MATERIAL_LABEL: Record<string, string> = {
  NORMAL: '일반',
  FIRE: '불',
  WATER: '물',
  GRASS: '식물',
  METAL: '금속',
  CERAMIC: '도자기',
  GLASS: '유리',
  PLASTIC: '플라스틱',
  ELECTRIC: '전기',
};

const SHAPE_LABEL: Record<string, string> = {
  FREEFORM: '자유형',
  ROUND: '둥글',
  TRIANGLE: '세모',
  SQUARE: '네모',
  LONG: '길쭉',
};

const RARITY_STYLE: Record<string, string> = {
  COMMON: 'bg-[#7B8B82]',
  RARE: 'bg-[#5B82B3]',
  EPIC: 'bg-[#9D68B3]',
};

const STAT_LABELS: Array<[keyof Stats, string]> = [
  ['hp', '체력'],
  ['attack', '공격'],
  ['defense', '방어'],
  ['speed', '속도'],
];

// 이미지를 불러오지 못했을 때 자리를 채우는 실루엣
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

export default function MyMonstersPage() {
  const [monsters, setMonsters] = useState<UserMonster[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    null
  );
  const [sortKey, setSortKey] = useState<SortKey>('dexId');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedImages, setFailedImages] = useState<Set<string>>(
    () => new Set()
  );

  const router = useRouter();

  const selected =
    monsters.find(
      (monster) => monster.userMonsterId === selectedId
    ) ?? null;

  // 정렬은 서버가 처리한다 (lib/user-monsters.ts)
  const loadMonsters = useCallback(async () => {
    const option =
      SORT_OPTIONS.find((item) => item.key === sortKey) ??
      SORT_OPTIONS[0];

    setLoading(true);

    try {
      const res = await fetch(
        `/api/user-monsters?sort=${option.key}&order=${option.order}`
      );

      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== CODE_OK) {
        setError(
          body?.message ??
            '보유 몬스터를 불러오지 못했어요.'
        );
        return;
      }

      const list = body.data?.userMonsters;

      if (!Array.isArray(list)) {
        console.error(
          '[내 몬스터] 예상하지 못한 응답 구조:',
          body
        );
        setError('보유 몬스터를 불러오지 못했어요.');
        return;
      }

      setMonsters(list);
      setError(null);
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setLoading(false);
    }
  }, [sortKey]);

  useEffect(() => {
    void loadMonsters();
  }, [loadMonsters]);

  /**
   * 같은 몬스터를 다시 잡으면 새 개체값이 제안된다.
   * accept면 제안값으로 교체하고, reject면 기존 값을 유지한다.
   */
  const handleIvDecision = async (
    userMonsterId: string,
    decision: 'accept' | 'reject'
  ) => {
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/user-monsters/${userMonsterId}/iv`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ decision }),
        }
      );

      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== CODE_OK) {
        setError(
          body?.message ?? '개체값 처리에 실패했어요.'
        );
        return;
      }

      await loadMonsters();
    } catch {
      setError('네트워크 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  const handleImageError = (userMonsterId: string) => {
    setFailedImages((prev) => {
      const next = new Set(prev);
      next.add(userMonsterId);
      return next;
    });
  };

  const pendingCount = monsters.filter(
    (monster) => monster.pendingStats?.totalIv != null
  ).length;

  return (
    <div
      className={`${notoSans.className} h-full w-full bg-[#F2F0E8] flex flex-col overflow-hidden`}
    >
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-6 pb-4">
        <div className="grid grid-cols-3 items-center">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="뒤로 가기"
            className="w-10 h-10 rounded-2xl bg-[#DCE8DE] flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
          >
            <ChevronLeft
              size={20}
              className="text-[#1F4B3C]"
            />
          </button>

          <h1 className="text-lg font-black text-center text-[#1B1B1B]">
            내 몬스터
          </h1>

          <div className="flex justify-end">
            <span className="px-3 py-1.5 rounded-xl bg-[#DCE8DE] text-sm font-bold text-[#1F4B3C]">
              {loading ? '-' : `${monsters.length}마리`}
            </span>
          </div>
        </div>
      </div>

      {/*
        본문은 layout이 제공한 남은 높이 안에서만 차지한다.
        pb-4로 BottomNav 위에 실제 하단 여백을 확보한다.
      */}
      <div className="flex-1 min-h-0 px-4 pb-4">
        <div className="h-full min-h-0 bg-[#FDFCF8] rounded-2xl overflow-y-auto shadow-sm">
          <div className="px-4 py-4">
            {/* 정렬 */}
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs tracking-widest text-[#B0BDB4] font-bold">
                MY MONSTERS
              </p>

              <div className="flex items-center gap-1 bg-[#F2F0E8] p-1 rounded-xl">
                {SORT_OPTIONS.map((option) => (
                  <button
                    type="button"
                    key={option.key}
                    onClick={() =>
                      setSortKey(option.key)
                    }
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                      sortKey === option.key
                        ? 'bg-[#1F4B3C] text-white'
                        : 'text-[#8A9A8E]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 개체값 제안이 있으면 상단에 알린다 */}
            {!loading && pendingCount > 0 && (
              <div className="flex items-center gap-2 bg-[#FFF6E5] border border-[#F0DFBC] rounded-xl px-3 py-2.5 mb-4">
                <Sparkles
                  size={14}
                  className="text-[#C08A2E] shrink-0"
                />

                <p className="text-[11px] font-bold text-[#8A6520] leading-relaxed">
                  {pendingCount}마리에게 새로운 개체값이
                  제안됐어요
                </p>
              </div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-2">
                <div className="w-6 h-6 border-2 border-[#1F4B3C] border-t-transparent rounded-full animate-spin" />

                <p className="text-xs text-[#8A9A8E]">
                  불러오는 중...
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3">
                <p className="text-sm text-[#C0503D] text-center">
                  {error}
                </p>

                <button
                  type="button"
                  onClick={() => void loadMonsters()}
                  className="px-4 py-2 bg-[#DCE8DE] text-[#1F4B3C] rounded-xl text-xs font-bold active:scale-95 transition-transform cursor-pointer"
                >
                  다시 시도
                </button>
              </div>
            ) : monsters.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
                <div>
                  <p className="text-sm font-bold text-[#4B5A50] mb-1">
                    아직 수집한 몬스터가 없어요
                  </p>

                  <p className="text-xs text-[#8A9A8E]">
                    주변 사물을 촬영해 첫 몬스터를
                    만나보세요
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    router.push('/scans')
                  }
                  className="px-6 py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform cursor-pointer"
                >
                  사물 촬영하러 가기
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {monsters.map((monster) => {
                  const imageFailed =
                    failedImages.has(
                      monster.userMonsterId
                    );

                  return (
                    <button
                      type="button"
                      key={monster.userMonsterId}
                      onClick={() =>
                        setSelectedId(
                          monster.userMonsterId
                        )
                      }
                      className="rounded-2xl overflow-hidden shadow-sm text-left transition-transform active:scale-95 bg-white border border-[#EBE8DF] relative cursor-pointer"
                    >
                      <div className="aspect-square relative overflow-hidden bg-[#DCE8DE] flex items-center justify-center">
                        {imageFailed ? (
                          <MonsterSilhouette className="w-16 h-16 text-[#A9B9AD]" />
                        ) : (
                          <>
                            {/*
                              TODO:
                              몬스터 이미지에 폴라로이드 테두리가 포함되어 있어
                              확대해 잘라내고 있다.
                              테두리 없는 이미지로 교체되면
                              object-contain으로 바꾸고 scale 제거
                            */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={
                                monster.imageUrl
                              }
                              alt={monster.name}
                              onError={() =>
                                handleImageError(
                                  monster.userMonsterId
                                )
                              }
                              className="w-full h-full object-cover scale-[1.18]"
                            />
                          </>
                        )}

                        <span className="absolute bottom-1 right-1 text-[9px] font-black text-white bg-black/60 px-1.5 py-0.5 rounded-md">
                          Lv.{monster.level}
                        </span>

                        {monster.pendingStats
                          ?.totalIv != null && (
                          <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#C84B31] flex items-center justify-center">
                            <Sparkles
                              size={9}
                              className="text-white"
                            />
                          </span>
                        )}

                        {monster.catchCount > 1 && (
                          <span className="absolute top-1 left-1 text-[9px] font-bold text-white bg-black/50 px-1.5 py-0.5 rounded-md">
                            ×{monster.catchCount}
                          </span>
                        )}
                      </div>

                      <div className="p-2">
                        <p className="text-[11px] font-bold text-center truncate text-[#1B1B1B]">
                          {monster.name}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 상세 모달 */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelectedId(null)}
        >
          <div
            className="bg-[#0D0F0E] rounded-3xl w-full max-w-xs max-h-[85svh] overflow-y-auto relative card-in shadow-2xl border border-white/10"
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            {/* 이미지 영역 */}
            <div className="relative aspect-square overflow-hidden bg-[#181C19] flex items-center justify-center">
              {failedImages.has(
                selected.userMonsterId
              ) ? (
                <MonsterSilhouette className="w-32 h-32 text-white/20" />
              ) : (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={selected.imageUrl}
                    alt={selected.name}
                    onError={() =>
                      handleImageError(
                        selected.userMonsterId
                      )
                    }
                    className="w-full h-full object-cover scale-[1.18]"
                  />
                </>
              )}

              <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-[#0D0F0E]" />

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                aria-label="닫기"
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-lg font-bold text-white leading-none active:scale-90 transition-transform cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="px-5 pb-5 -mt-8 relative">
              {/* 이름 · 등급 */}
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-extrabold text-white bg-black/60 px-2 py-0.5 rounded-md">
                  Lv.{selected.level}
                </span>

                <span
                  className={`text-[10px] font-black text-white px-2 py-0.5 rounded-md ${
                    RARITY_STYLE[
                      selected.rarity
                    ] ?? 'bg-[#B0BDB4]'
                  }`}
                >
                  {selected.rarity}
                </span>

                <span className="text-[10px] font-bold text-white/50">
                  #
                  {String(selected.dexId).padStart(
                    3,
                    '0'
                  )}
                </span>
              </div>

              <h2 className="font-black text-white text-2xl tracking-tight mb-2">
                {selected.name}
              </h2>

              <div className="flex gap-1.5 mb-4">
                <span className="text-[10px] bg-white/10 text-white/80 border border-white/15 rounded-full px-2.5 py-0.5 font-bold">
                  {MATERIAL_LABEL[
                    selected.material
                  ] ?? selected.material}
                </span>

                <span className="text-[10px] bg-white/10 text-white/80 border border-white/15 rounded-full px-2.5 py-0.5 font-bold">
                  {SHAPE_LABEL[selected.shape] ??
                    selected.shape}
                </span>

                {selected.catchCount > 1 && (
                  <span className="text-[10px] bg-white/10 text-white/60 border border-white/15 rounded-full px-2.5 py-0.5 font-bold">
                    {selected.catchCount}번 획득
                  </span>
                )}
              </div>

              {/* 서버에서 계산된 실제 최종 능력치 */}
              <div className="bg-white/[0.06] border border-white/10 rounded-2xl p-3.5 mb-3">
                <div className="mb-2.5">
                  <p className="text-[10px] font-extrabold tracking-wider text-white/60">
                    능력치
                  </p>
                </div>

                <div className="space-y-1.5">
                  {STAT_LABELS.map(
                    ([key, label]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between"
                      >
                        <span className="text-xs text-white/60">
                          {label}
                        </span>

                        <span className="text-sm font-black text-white">
                          {
                            selected.currentStats[
                              key
                            ]
                          }
                        </span>
                      </div>
                    )
                  )}
                </div>
              </div>

              {/* 중복 획득으로 새 개체값이 제안된 경우 */}
              {selected.pendingStats?.totalIv !=
                null && (
                <div className="bg-[#1A1508] border border-[#4A3D18] rounded-2xl p-3.5">
                  <div className="flex items-center gap-1.5 mb-2.5">
                    <Sparkles
                      size={13}
                      className="text-[#E8B84B]"
                    />

                    <p className="text-[11px] font-bold text-[#E8B84B]">
                      새로운 개체값 제안
                    </p>
                  </div>

                  <p className="text-[10px] text-white/40 mb-1 leading-relaxed">
                    현재 능력치와 새로운 개체값 적용
                    후 능력치를 비교해보세요.
                  </p>

                  <p className="text-[10px] text-[#E8B84B]/80 mb-3 leading-relaxed">
                    교체하면 일부 능력치가 낮아질 수
                    있어요.
                  </p>

                  <div className="space-y-1.5 mb-3">
                    {STAT_LABELS.map(
                      ([key, label]) => {
                        const current =
                          selected.currentStats[
                            key
                          ];

                        const proposed =
                          selected.pendingStats![
                            key
                          ];

                        return (
                          <div
                            key={key}
                            className="flex items-center justify-between"
                          >
                            <span className="text-xs text-white/60">
                              {label}
                            </span>

                            <div className="flex items-baseline gap-2">
                              <span className="text-xs text-white/40">
                                {current}
                              </span>

                              <span className="text-xs text-white/30">
                                →
                              </span>

                              <span className="text-sm font-black text-white">
                                {proposed}
                              </span>
                            </div>
                          </div>
                        );
                      }
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleIvDecision(
                          selected.userMonsterId,
                          'reject'
                        )
                      }
                      className="flex-1 py-2.5 rounded-xl bg-white/10 text-white/70 font-bold text-xs border border-white/15 active:scale-95 transition-transform disabled:opacity-50 cursor-pointer disabled:cursor-default"
                    >
                      그대로 두기
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        handleIvDecision(
                          selected.userMonsterId,
                          'accept'
                        )
                      }
                      className="flex-1 py-2.5 rounded-xl bg-[#E8B84B] text-[#1A1508] font-black text-xs active:scale-95 transition-transform disabled:opacity-50 cursor-pointer disabled:cursor-default"
                    >
                      {busy
                        ? '처리 중...'
                        : '교체하기'}
                    </button>
                  </div>
                </div>
              )}

              {error && (
                <p className="mt-3 text-[11px] text-[#FF6B6B] text-center">
                  {error}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .card-in {
          animation: cardIn 0.25s
            cubic-bezier(0.16, 1, 0.3, 1)
            forwards;
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: scale(0.92)
              translateY(12px);
          }

          to {
            opacity: 1;
            transform: scale(1)
              translateY(0);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .card-in {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}