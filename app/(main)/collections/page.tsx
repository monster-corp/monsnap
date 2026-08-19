'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';
import { ApiError, ERROR } from "@/lib/api/response";

const notoSans = Noto_Sans_KR({
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  preload: false,
});

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

// 미수집 몬스터는 이름과 희귀도만 내려오고, 이미지·속성·스탯은 수집 후에만 온다
interface DexEntry {
  monsterId: string;
  dexId: number;
  name: string;
  rarity: string;
  caught: boolean;
  material?: string;
  shape?: string;
  imageUrl?: string;
  baseStats?: BaseStats;
  isFallback?: boolean;
}

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

const RARITY_LABEL: Record<string, string> = {
  COMMON: 'C',
  RARE: 'R',
  EPIC: 'E',
};

const RARITY_STYLE: Record<string, string> = {
  COMMON: 'bg-[#7B8B82]',
  RARE: 'bg-[#5B82B3]',
  EPIC: 'bg-[#9D68B3]',
};

export default function CollectionsPage() {
  const [monsters, setMonsters] = useState<DexEntry[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [caughtCount, setCaughtCount] = useState(0);
  const [selected, setSelected] = useState<DexEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 이미지 로드에 실패한 항목은 placeholder로 대체한다
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const router = useRouter();

  const loadDex = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch('/api/monsters');
      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== ERROR.OK.code) {
        throw new ApiError("INTERNAL_ERROR");
      }

      const list = body.data?.monsters;

      if (!Array.isArray(list)) {
        throw new ApiError("INVALID_REQUEST");
      }

      // 정렬은 서버가 처리한다 (lib/monsters.ts: EPIC → RARE → COMMON, 등급 내 dexId 순)
      setMonsters(list);
      setTotalCount(body.data?.totalCount ?? 0);
      setCaughtCount(body.data?.caughtCount ?? 0);
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(`[/api/monsters] ApiError (${error.key} / ${error.code}):`, error.message);
        setError(error.message);
      } else if (error instanceof Error) {
        console.error("[/api/monsters] unexpected error:", error.message);
        setError(error.message);
      } else {
        console.error("[/api/monsters] unknown error:", error);
        setError(ERROR.INTERNAL_ERROR.message);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDex();
  }, [loadDex]);

  const handleImageError = (monsterId: string) => {
    setFailedImages((prev) => new Set(prev).add(monsterId));
  };

  return (
    <div
      className={`${notoSans.className} h-full bg-[#F2F0E8] flex flex-col overflow-hidden select-none`}
    >
      <div className="shrink-0 px-4 pt-6 pb-4">
        <div className="grid grid-cols-3 items-center">
          <button
            type="button"
            onClick={() => router.push('/')}
            aria-label="메인으로 이동"
            className="w-10 h-10 rounded-2xl bg-[#DCE8DE] flex items-center justify-center active:scale-90 transition-transform cursor-pointer"
          >
            <ChevronLeft size={20} className="text-[#1F4B3C]" />
          </button>

          <h1 className="text-lg font-black text-center text-[#1B1B1B]">
            몬스터 도감
          </h1>

          <div className="flex justify-end">
            <span className="px-3 py-1.5 rounded-xl bg-[#DCE8DE] text-sm font-bold text-[#1F4B3C]">
              {loading ? '- / -' : `${caughtCount} / ${totalCount}`}
            </span>
          </div>
        </div>
      </div>

      {/* min-h-0이 없으면 내용만큼 늘어나 overflow-y-auto가 동작하지 않는다 */}
      <div className="flex-1 min-h-0 bg-[#FDFCF8] mx-4 mb-4 rounded-2xl overflow-y-auto shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs tracking-widest text-[#B0BDB4] font-bold">
              MONSTER DEX
            </p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="w-6 h-6 border-2 border-[#1F4B3C] border-t-transparent rounded-full animate-spin" />

              <p className="text-center text-xs text-[#8A9A8E] font-medium">
                도감을 기록하는 중...
              </p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-center text-sm text-[#C0503D] font-medium">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadDex()}
                className="px-4 py-2 bg-[#DCE8DE] text-[#1F4B3C] rounded-xl text-xs font-bold active:scale-95 transition-transform cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {monsters.map((m) => {
                const showImage =
                  m.imageUrl && !failedImages.has(m.monsterId);

                return (
                  <button
                    key={m.monsterId}
                    type="button"
                    onClick={() => setSelected(m)}
                    className={`rounded-2xl overflow-hidden shadow-sm text-left transition-transform active:scale-95 flex flex-col cursor-pointer ${
                      m.caught
                        ? 'bg-white border border-[#EBE8DF]'
                        : 'bg-[#EFEDE5]'
                    }`}
                  >
                    <div className="aspect-square relative overflow-hidden bg-[#DCE8DE] flex items-center justify-center">
                      {showImage ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={m.imageUrl}
                          alt={m.name}
                          className="w-full h-full object-cover scale-[1.25]"
                          onError={() => handleImageError(m.monsterId)}
                        />
                      ) : (
                        <div className="w-full h-full bg-[#E5E2D8] flex items-center justify-center text-[#C9C5B8] font-black text-2xl">
                          ?
                        </div>
                      )}

                      <span className="absolute top-1.5 left-2 text-[9px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded-md backdrop-blur-xs">
                        #{String(m.dexId).padStart(3, '0')}
                      </span>

                      <span
                        className={`absolute top-1.5 right-1.5 w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white shadow-xs ${
                          RARITY_STYLE[m.rarity] ?? 'bg-[#B0BDB4]'
                        }`}
                      >
                        {RARITY_LABEL[m.rarity] ?? '?'}
                      </span>
                    </div>

                    <div className="p-2 bg-white/90">
                      <p
                        className={`text-[11px] font-bold text-center truncate ${
                          m.caught
                            ? 'text-[#1B1B1B]'
                            : 'text-[#A8A396]'
                        }`}
                      >
                        {m.name}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 상세 모달. 도감은 개체값이 아닌 종족값을 보여준다 */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-black rounded-[36px] w-full max-w-xs h-[520px] overflow-hidden relative card-in shadow-2xl flex flex-col justify-between p-5 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 z-0 overflow-hidden bg-[#181C19]">
              {selected.imageUrl &&
              !failedImages.has(selected.monsterId) ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selected.imageUrl}
                  alt={selected.name}
                  className="w-full h-full object-cover object-center scale-[1.25]"
                  onError={() => handleImageError(selected.monsterId)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[#C9C5B8] font-black text-4xl">
                  ?
                </div>
              )}

              <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/90 pointer-events-none" />
            </div>

            <div className="relative z-20 w-full flex justify-end">
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="닫기"
                className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-lg font-bold text-white active:scale-90 transition-transform cursor-pointer"
              >
                ×
              </button>
            </div>

            <div className="flex-1 min-h-0 pointer-events-none" />

            <div className="relative z-10 w-full flex flex-col gap-2.5">
              <div className="px-1">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-extrabold tracking-wider text-white bg-black/60 px-2 py-0.5 rounded-md backdrop-blur-md">
                      #{String(selected.dexId).padStart(3, '0')}
                    </span>

                    <span
                      className={`text-[10px] font-black text-white px-2 py-0.5 rounded-md shadow-md uppercase ${
                        RARITY_STYLE[selected.rarity] ?? 'bg-[#B0BDB4]'
                      }`}
                    >
                      {selected.rarity}
                    </span>
                  </div>

                  {selected.caught && (
                    <div className="flex gap-1">
                      {selected.material && (
                        <span className="text-[10px] bg-black/60 backdrop-blur-md text-white/90 border border-white/15 rounded-full px-2.5 py-0.5 font-bold">
                          {MATERIAL_LABEL[selected.material] ??
                            selected.material}
                        </span>
                      )}

                      {selected.shape && (
                        <span className="text-[10px] bg-black/60 backdrop-blur-md text-white/90 border border-white/15 rounded-full px-2.5 py-0.5 font-bold">
                          {SHAPE_LABEL[selected.shape] ?? selected.shape}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <h2 className="font-black text-white text-2xl drop-shadow-md tracking-tight">
                  {selected.name}
                </h2>
              </div>

              {selected.caught ? (
                selected.baseStats && (
                  <div className="w-full bg-[#0D0F0E]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 shadow-2xl">
                    <p className="text-[10px] font-extrabold tracking-wider text-white/60 mb-2">
                      기본 종족값
                    </p>

                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {(
                        [
                          ['HP', selected.baseStats.hp],
                          ['공격', selected.baseStats.attack],
                          ['방어', selected.baseStats.defense],
                          ['속도', selected.baseStats.speed],
                        ] as const
                      ).map(([label, value]) => (
                        <div
                          key={label}
                          className="flex items-center justify-between"
                        >
                          <span className="text-xs text-white/60 font-medium">
                            {label}
                          </span>

                          <span className="text-xs font-black text-white">
                            {value}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="w-full bg-[#0D0F0E]/85 backdrop-blur-md border border-white/10 rounded-2xl p-3.5 text-center">
                  <p className="text-xs text-white/70 font-medium leading-relaxed">
                    아직 발견하지 못한 몬스터예요.
                    <br />
                    주변의 사물을 스캔해서 찾아보세요!
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .card-in {
          animation: cardIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }

        @keyframes cardIn {
          from {
            opacity: 0;
            transform: scale(0.92) translateY(12px);
          }

          to {
            opacity: 1;
            transform: scale(1) translateY(0);
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