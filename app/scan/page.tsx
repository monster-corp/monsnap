'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

type Step = 'capture' | 'developing';

// 인화 연출에 최소한으로 보장할 시간 (ms)
const MIN_DEVELOP_MS = 2600;

// 서버가 성공으로 내려주는 코드 (거부 응답도 HTTP 200이므로 code로 판별해야 함)
const CODE_OK = 20000;

// 원본 사진 대신 표시하는 실루엣
// Zero-Storage 정책상 사용자가 촬영한 사진을 화면에 남기지 않음
function MonsterSilhouette({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true">
      {/* 귀 */}
      <path d="M28 38 Q26 14 36 20 Q40 26 41 34 Z" fill="currentColor" />
      <path d="M72 38 Q74 14 64 20 Q60 26 59 34 Z" fill="currentColor" />
      {/* 머리 + 몸통 */}
      <path
        d="M50 26 Q76 26 78 52 Q79 70 74 82 Q72 88 64 88 L36 88 Q28 88 26 82 Q21 70 22 52 Q24 26 50 26 Z"
        fill="currentColor"
      />
    </svg>
  );
}

export default function ScanPage() {
  const [step, setStep] = useState<Step>('capture');
  const [eggId, setEggId] = useState<string | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 같은 파일을 다시 선택해도 onChange가 발생하도록 초기화
    e.target.value = '';

    setError(null);
    setIsDone(false);
    setEggId(null);
    setStep('developing');

    const startedAt = Date.now();

    try {
      const formData = new FormData();
      formData.append('image', file);

      const res = await fetch('/api/scans', {
        method: 'POST',
        body: formData, // Content-Type은 브라우저가 자동 설정하므로 직접 넣지 않음
      });

      const body = await res.json().catch(() => null);

      // 연출이 끝나기 전에 응답이 오면 남은 시간만큼 기다림
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_DEVELOP_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_DEVELOP_MS - elapsed));
      }

      // 거부(FACE_BLOCKED 20001, SCREEN_BLOCKED 20002)도 HTTP 200으로 오므로 code로 판별
      if (!res.ok || body?.code !== CODE_OK) {
        setError(body?.message ?? '스캔에 실패했어요. 다시 시도해주세요.');
        setStep('capture');
        return;
      }

      setEggId(body.data?.eggId ?? null);
      setIsDone(true);
    } catch {
      setError('네트워크 오류가 발생했어요. 다시 시도해주세요.');
      setStep('capture');
    }
  };

  return (
    <div className={`${notoSans.className} min-h-screen flex items-center justify-center bg-[#EAF3EA] px-4 py-8`}>
      <div className="w-full max-w-sm flex flex-col items-center">

        {step === 'capture' ? (
          // ───────── ③ 촬영 ─────────
          <>
            <h1 className="text-xl font-black text-[#1B1B1B] mb-1">사물을 촬영하세요</h1>
            <p className="text-sm text-[#8A9A8E] mb-6 text-center">
              주변 사물을 카메라에 담으면<br />몬스터로 변신해요
            </p>

            <div className="w-full rounded-3xl bg-[#2A2A2A] p-4 shadow-xl mb-6">
              <div className="aspect-[3/4] rounded-2xl bg-[#1A1A1A] relative overflow-hidden mb-5">
                <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                  {Array.from({ length: 9 }).map((_, i) => (
                    <div key={i} className="border border-white/10" />
                  ))}
                </div>
                <div className="absolute top-4 left-4 w-7 h-7 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
                <div className="absolute top-4 right-4 w-7 h-7 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
                <div className="absolute bottom-4 left-4 w-7 h-7 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
                <div className="absolute bottom-4 right-4 w-7 h-7 border-b-2 border-r-2 border-white/40 rounded-br-lg" />

                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <span className="text-4xl opacity-30">📷</span>
                  <span className="text-xs text-white/50">탭해서 사물을 담아보세요</span>
                </div>
              </div>

              <div className="flex items-center justify-center">
                <button
                  onClick={() => inputRef.current?.click()}
                  aria-label="촬영하기"
                  className="w-[72px] h-[72px] rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform shadow-lg"
                >
                  <span className="w-[60px] h-[60px] rounded-full border-[3px] border-[#2A2A2A]" />
                </button>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              onChange={handleCapture}
              className="hidden"
            />

            {error && (
              <p className="text-sm text-[#C0503D] bg-[#FBEAE7] rounded-xl px-4 py-3 w-full text-center leading-relaxed">
                {error}
              </p>
            )}
          </>
        ) : (
          // ───────── ④+⑤ 인화 → 잠금 결과 (하나의 장면) ─────────
          <div className="flex flex-col items-center w-full">
            {/* 프린터 슬롯 */}
            <div className="w-64 h-[18px] rounded-[3px] bg-gradient-to-b from-[#4A4A4A] via-[#2A2A2A] to-[#1A1A1A] shadow-lg relative z-20 flex items-center justify-center">
              <div className="w-[228px] h-[5px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]" />
            </div>

            {/* 슬롯 아래로 밀려나오는 폴라로이드 */}
            <div className="w-64 relative z-10 clip-window">
              <div className="polaroid bg-white shadow-2xl px-3 pt-3 pb-14 rounded-[2px]">
                <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center">
                  {/* 촬영한 원본 사진은 서버 전송 후 화면에 표시하지 않음 (Zero-Storage 정책) */}
                  <MonsterSilhouette className="w-3/4 h-3/4 text-white/25 blur-[6px]" />

                  {/* 잠금 배지 */}
                  <div
                    className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-700 ${
                      isDone ? 'opacity-100' : 'opacity-0'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-2xl bg-black/35 backdrop-blur-sm border border-white/25 flex items-center justify-center">
                      <Lock size={20} strokeWidth={2.2} className="text-white/90" />
                    </div>
                    <span className="text-[11px] font-bold text-white/90 drop-shadow">
                      미션 완료 시 공개
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* 하단 문구 + 버튼 */}
            <div className="mt-8 w-full flex flex-col items-center min-h-[180px]">
              {!isDone ? (
                <div className="text-center">
                  <p className="text-sm font-bold text-[#1B1B1B]">인화 중...</p>
                  <p className="text-xs text-[#8A9A8E] mt-1">몬스터를 분석하고 있어요</p>
                </div>
              ) : (
                <div className="w-full flex flex-col items-center fade-up">
                  <p className="text-sm text-center text-[#4B5A50] leading-relaxed mb-6">
                    몬스터를 획득했어요!<br />걷기 미션을 완료하면 공개돼요
                  </p>
                  <button
                    onClick={() => router.push(eggId ? `/mission?eggId=${eggId}` : '/mission')}
                    className="w-full py-4 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform mb-3"
                  >
                    미션 하러 가기
                  </button>
                  <button
                    onClick={() => router.push('/collection')}
                    className="w-full py-4 rounded-full bg-white text-[#3E7A5C] font-bold text-sm border border-[#DCE8DE] active:scale-95 transition-transform"
                  >
                    도감으로 이동하기
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        .clip-window {
          clip-path: inset(0 -40px -40px -40px);
        }
        .polaroid {
          animation: print 2.4s cubic-bezier(0.16, 0.84, 0.28, 1) forwards;
        }
        @keyframes print {
          0%   { transform: translateY(-101%); }
          70%  { transform: translateY(2%); }
          85%  { transform: translateY(-1%); }
          100% { transform: translateY(0); }
        }
        .fade-up {
          animation: fadeUp 0.5s ease-out forwards;
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          .polaroid, .fade-up { animation: none; }
        }
      `}</style>
    </div>
  );
}

