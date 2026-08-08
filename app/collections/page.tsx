'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

type Tab = 'collected' | 'undiscovered';

// 성공 응답 코드 (lib/api/response.ts)
const CODE_OK = 20000;

// GET /api/user-monsters 응답 형식
type UserMonster = {
  userMonsterId: string;
  catchCount: number;
  level: number;
  firstCaughtAt: string;
  monster: {
    id: string;
    name: string;
    rarity: string;
    material: string;
    shape: string;
    imageUrl: string;
  };
};

// 서버는 영문 코드로 주기 때문에 화면에 보여줄 한글로 변환한다 (lib/schemas/vlm.ts 기준)
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
  COMMON: 'bg-[#B0BDB4]',
  RARE: 'bg-[#7B9CC4]',
  EPIC: 'bg-[#B08BC4]',
};

// 미발견 탭은 희귀도별로 섹션을 나눈다 (회의 결정: 실루엣 + 대략적 성능만 노출)
const RARITY_SECTIONS = [
  { key: 'COMMON', label: 'COMMON' },
  { key: 'RARE', label: 'RARE' },
  { key: 'EPIC', label: 'EPIC' },
] as const;

// 아직 발견하지 않은 몬스터를 나타내는 실루엣
function MonsterSilhouette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      <path d="M28 38 Q26 14 36 20 Q40 26 41 34 Z" fill="currentColor" />
      <path d="M72 38 Q74 14 64 20 Q60 26 59 34 Z" fill="currentColor" />
      <path
        d="M50 26 Q76 26 78 52 Q79 70 74 82 Q72 88 64 88 L36 88 Q28 88 26 82 Q21 70 22 52 Q24 26 50 26 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function CollectionsPage() {
  const [tab, setTab] = useState<Tab>('collected');
  const [monsters, setMonsters] = useState<UserMonster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/user-monsters');
        const body = await res.json().catch(() => null);

        if (!res.ok || body?.code !== CODE_OK) {
          setError(body?.message ?? '도감을 불러오지 못했어요.');
          return;
        }

        setMonsters(body.data?.userMonsters ?? []);
      } catch {
        setError('네트워크 오류가 발생했어요.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  return (
    // 화면 높이를 고정하고 바깥 스크롤을 막아, 아래 도감 카드 안에서만 스크롤되게 한다
    <div className={`${notoSans.className} h-[100svh] bg-[#F2F0E8] flex flex-col overflow-hidden`}>
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-6 pb-4">
        <div className="grid grid-cols-3 items-center">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 rounded-2xl bg-[#DCE8DE] flex items-center justify-center"
          >
            <ChevronLeft size={20} className="text-[#1F4B3C]" />
          </button>
          <h1 className="text-lg font-black text-center text-[#1B1B1B]">몬스터 도감</h1>
          <div className="flex justify-end">
            {/* TODO: 전체 몬스터 수를 받을 API가 없어 분모(N / 전체)를 표시할 수 없음 */}
            <span className="px-3 py-1.5 rounded-xl bg-[#DCE8DE] text-sm font-bold text-[#1F4B3C]">
              {monsters.length}
            </span>
          </div>
        </div>
      </div>

      {/* 탭 */}
      <div className="shrink-0 px-4 flex gap-1">
        {([
          ['collected', '수집한 몬스터'],
          ['undiscovered', '미발견 몬스터'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 rounded-t-2xl text-sm font-bold transition-colors ${
              tab === key ? 'bg-[#FDFCF8] text-[#1F4B3C]' : 'bg-[#E3E0D6] text-[#8A9A8E]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 도감 본문 (노트 느낌).
          min-h-0이 없으면 내용만큼 늘어나버려서 overflow-y-auto가 동작하지 않는다 */}
      <div className="flex-1 min-h-0 bg-[#FDFCF8] mx-4 mb-4 rounded-b-2xl rounded-tr-2xl overflow-y-auto">
        <div className="px-4 py-4">
          {/* 탭이 바뀌어도 도감 페이지 헤더는 유지되도록 조건문 밖에 둔다 */}
          <p className="text-xs tracking-widest text-[#B0BDB4] font-bold mb-4">
            {tab === 'collected' ? 'PAGE 01 · COLLECTION' : 'PAGE 02 · UNDISCOVERED'}
          </p>

          {tab === 'collected' ? (
            <>
              {loading ? (
                <p className="text-center text-sm text-[#8A9A8E] py-16">불러오는 중...</p>
              ) : error ? (
                <p className="text-center text-sm text-[#C0503D] py-16">{error}</p>
              ) : monsters.length === 0 ? (
                <div className="text-center py-16">
                  <p className="text-sm text-[#8A9A8E] mb-5">아직 수집한 몬스터가 없어요</p>
                  <button
                    onClick={() => router.push('/scans')}
                    className="px-6 py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
                  >
                    사물 촬영하러 가기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {monsters.map((um, i) => (
                    <div key={um.userMonsterId} className="bg-white rounded-2xl p-2.5 shadow-sm">
                      <div className="aspect-square rounded-xl bg-[#DCE8DE] relative overflow-hidden mb-2">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={um.monster.imageUrl}
                          alt={um.monster.name}
                          className="w-full h-full object-contain"
                        />
                        <span className="absolute top-1.5 left-2 text-[10px] font-bold text-[#8A9A8E]">
                          #{String(i + 1).padStart(3, '0')}
                        </span>
                        <span
                          className={`absolute top-1.5 right-1.5 w-6 h-6 rounded-lg flex items-center justify-center text-[11px] font-black text-white ${
                            RARITY_STYLE[um.monster.rarity] ?? 'bg-[#B0BDB4]'
                          }`}
                        >
                          {RARITY_LABEL[um.monster.rarity] ?? '?'}
                        </span>
                      </div>

                      <p className="text-sm font-bold text-center text-[#1B1B1B] mb-1.5">
                        {um.monster.name}
                      </p>
                      <div className="flex gap-1 justify-center flex-wrap">
                        <span className="text-[10px] bg-[#DCE8DE] text-[#3E7A5C] rounded-full px-2 py-0.5">
                          {MATERIAL_LABEL[um.monster.material] ?? um.monster.material}
                        </span>
                        <span className="text-[10px] bg-[#DCE8DE] text-[#3E7A5C] rounded-full px-2 py-0.5">
                          {SHAPE_LABEL[um.monster.shape] ?? um.monster.shape}
                        </span>
                      </div>
                      {um.catchCount > 1 && (
                        <p className="text-[10px] text-center text-[#B0BDB4] mt-1.5">
                          {um.catchCount}번 획득
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            // 미발견 탭: 희귀도별 섹션 구조만 잡아둔 상태.
            // 전체 몬스터 목록 API가 없어 실제 카드 수는 채우지 못한다
            <div className="space-y-6">
              {RARITY_SECTIONS.map(({ key, label }) => (
                <section key={key}>
                  <div className="flex items-center gap-2 mb-3">
                    <span
                      className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-black text-white ${RARITY_STYLE[key]}`}
                    >
                      {RARITY_LABEL[key]}
                    </span>
                    <span className="text-sm font-bold text-[#1B1B1B]">{label}</span>
                    {/* TODO: 전체 몬스터 API 연동 후 "획득 / 전체" 표시 */}
                    <span className="text-xs text-[#B0BDB4]">— / —</span>
                  </div>

                  {/* TODO: API 연동 시 실제 몬스터 수만큼 실루엣 카드 렌더링 */}
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-xl bg-[#EFEDE5] flex items-center justify-center"
                      >
                        <MonsterSilhouette className="w-2/3 h-2/3 text-[#D6D3C8]" />
                      </div>
                    ))}
                  </div>
                </section>
              ))}

            </div>
          )}
        </div>
      </div>
    </div>
  );
}
