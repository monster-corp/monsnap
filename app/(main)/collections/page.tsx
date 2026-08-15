'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

const CODE_OK = 20000;
const SHOW_UNCAUGHT_NAME = true;

interface BaseStats {
  hp: number;
  attack: number;
  defense: number;
  speed: number;
}

interface DexEntry {
  monsterId: string;
  dexId: number;
  name: string;
  rarity: string;
  material?: string;
  shape?: string;
  imageUrl?: string;
  caught: boolean;
  baseStats?: BaseStats;
  isFallback?: boolean;
}

const MATERIAL_LABEL: Record<string, string> = {
  NORMAL: '일반', FIRE: '불', WATER: '물', GRASS: '식물', METAL: '금속',
  CERAMIC: '도자기', GLASS: '유리', PLASTIC: '플라스틱', ELECTRIC: '전기',
};

const SHAPE_LABEL: Record<string, string> = {
  FREEFORM: '자유형', ROUND: '둥글', TRIANGLE: '세모', SQUARE: '네모', LONG: '길쭉',
};

const RARITY_LABEL: Record<string, string> = {
  COMMON: 'C', RARE: 'R', EPIC: 'E',
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
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/monsters', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
        });

        const body = await res.json().catch(() => null);

        if (!res.ok || body?.code !== CODE_OK) {
          setError(body?.message ?? '도감을 불러오지 못했어요.');
          return;
        }

        // 백엔드 API 응답 데이터 원본 및 순서 그대로 적용
        setMonsters(body.data?.monsters ?? []);
        setTotalCount(body.data?.totalCount ?? 0);
        setCaughtCount(body.data?.caughtCount ?? 0);
      } catch (err) {
        console.error('도감 로딩 중 에러:', err);
        setError('네트워크 오류가 발생했습니다.');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  return (
    <div className={`${notoSans.className} h-[100svh] bg-[#F2F0E8] flex flex-col overflow-hidden select-none`}>
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-6 pb-4">
        <div className="grid grid-cols-3 items-center">
          <button
            onClick={() => router.push('/')}
            aria-label="메인으로 이동"
            className="w-10 h-10 rounded-2xl bg-[#DCE8DE] flex items-center justify-center active:scale-90 transition-transform"
          >
            <ChevronLeft size={20} className="text-[#1F4B3C]" />
          </button>
          <h1 className="text-lg font-black text-center text-[#1B1B1B]">몬스터 도감</h1>
          <div className="flex justify-end">
            <span className="px-3 py-1.5 rounded-xl bg-[#DCE8DE] text-sm font-bold text-[#1F4B3C]">
              {loading ? '- / -' : `${caughtCount} / ${totalCount}`}
            </span>
          </div>
        </div>
      </div>

      {/* 도감 본문 영역 */}
      <div className="flex-1 min-h-0 bg-[#FDFCF8] mx-4 mb-4 rounded-2xl overflow-y-auto shadow-sm">
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs tracking-widest text-[#B0BDB4] font-bold">MONSTER DEX</p>
          </div>

          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-2">
              <div className="w-6 h-6 border-2 border-[#1F4B3C] border-t-transparent rounded-full animate-spin" />
              <p className="text-center text-xs text-[#8A9A8E] font-medium">도감을 기록하는 중...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <p className="text-center text-sm text-[#C0503D] font-medium">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 bg-[#DCE8DE] text-[#1F4B3C] rounded-xl text-xs font-bold active:scale-95 transition-transform"
              >
                다시 시도
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2.5">
              {monsters.map((m) => (
                <button
                  key={m.monsterId}
                  onClick={() => setSelected(m)}
                  className={`rounded-2xl overflow-hidden shadow-sm text-left transition-transform active:scale-95 flex flex-col ${
                    m.caught ? 'bg-white border border-[#EBE8DF]' : 'bg-[#EFEDE5]'
                  }`}
                >
                  <div className="aspect-square relative overflow-hidden bg-[#DCE8DE] flex items-center justify-center">
                    {m.imageUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={m.imageUrl}
                        alt={m.name}
                        className={`w-full h-full object-cover scale-[1.25] transition-all ${
                          m.caught ? '' : 'brightness-0 opacity-25'
                        }`}
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png';
                        }}
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
                        m.caught ? 'text-[#1B1B1B]' : 'text-[#A8A396]'
                      }`}
                    >
                      {m.caught || SHOW_UNCAUGHT_NAME ? m.name : '???'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 모달 영역 */}
      {selected && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setSelected(null)}
        >
          <div
            className="bg-black rounded-[36px] w-full max-w-xs h-[520px] overflow-hidden relative card-in shadow-2xl flex flex-col justify-between p-5 border border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute inset-0 z-0 overflow-hidden bg-[#181C19]">
              {selected.imageUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={selected.imageUrl}
                  alt={selected.name}
                  className={`w-full h-full object-cover object-center scale-[1.25] ${
                    selected.caught ? '' : 'brightness-0 opacity-25'
                  }`}
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png';
                  }}
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
                onClick={() => setSelected(null)}
                aria-label="닫기"
                className="w-8 h-8 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-lg font-bold text-white active:scale-90 transition-transform"
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
                          {MATERIAL_LABEL[selected.material] ?? selected.material}
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
                  {selected.caught || SHOW_UNCAUGHT_NAME ? selected.name : '???'}
                </h2>
              </div>

              {/* 기본 종족값 카드 */}
              {selected.caught ? (
                selected.baseStats && (
                  <div className="w-full bg-[#0D0F0E]/85 backdrop-blur-xl border border-white/10 rounded-2xl p-3.5 shadow-2xl">
                    <p className="text-[10px] font-extrabold tracking-wider text-white/60 mb-2">
                      기본 종족값
                    </p>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
                      {([
                        ['HP', selected.baseStats.hp],
                        ['공격', selected.baseStats.attack],
                        ['방어', selected.baseStats.defense],
                        ['속도', selected.baseStats.speed],
                      ] as const).map(([label, value]) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-xs text-white/60 font-medium">{label}</span>
                          <span className="text-xs font-black text-white">{value}</span>
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
        .card-in { animation: cardIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        @keyframes cardIn {
          from { opacity: 0; transform: scale(0.92) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}