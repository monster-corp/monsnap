'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

type Step = 'capture' | 'developing';

// 응답이 2.4초짜리 인화 애니메이션보다 빨리 오면 사진이 나오는 도중에 결과가 표시되므로,
// 애니메이션이 끝날 때까지는 기다린다. 이 시간을 넘긴 뒤로는 실제 응답 시간에 그대로 맞춰진다
const MIN_DEVELOP_MS = 2600;

// 얼굴/화면 거부(20001, 20002)도 HTTP 200으로 오기 때문에
// res.ok가 아니라 code 값으로 성공 여부를 판단해야 한다 (lib/api/response.ts)
const CODE_OK = 20000;
const CODE_EGG_SLOT_FULL = 40900; // 알 보관함 한도 초과 (lib/eggs.ts의 MAX_ACTIVE_EGGS = 3)

// 응답이 오지 않을 때 무한 대기를 막는 안전장치.
// 서버 VLM 타임아웃(lib/vlm.ts의 VLM_TIMEOUT_MS = 15초)에 네트워크 여유를 더한 값
const REQUEST_TIMEOUT_MS = 20000;

// 서버(lib/image.ts)는 MIME Type만 검사하고 해상도 제한이 없어 임의로 정한 값이라,
// VLM 판정 품질을 보고 조정이 필요할 수 있다
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.85;

// 촬영 화면과 결과 화면의 높이를 동일하게 맞춰, 단계가 바뀔 때 레이아웃이 튀지 않게 한다
const SCREEN_FRAME = 'w-full max-w-sm flex flex-col h-[calc(100svh-2rem)] max-h-[760px]';

// 아직 공개되지 않은 몬스터를 나타내는 실루엣.
// 촬영한 이미지를 그대로 띄우면 "사진을 보관한다"는 오해를 줄 수 있어 대체 이미지를 쓴다
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

/**
 * 촬영(또는 선택)한 이미지를 서버로 보내기 전에 축소한다.
 *
 * - 폰으로 찍은 사진은 수 MB에 달해 전송과 분석이 느려지고, VLM 타임아웃(15초)에 걸릴 위험이 있다
 * - 파일 타입이 비어 오는 경우(lib/vlm.ts 참고)에도 서버의 MIME Type 검사를 통과하도록,
 *   축소 여부와 관계없이 타입을 보정한다
 * - 축소에 실패하더라도 전송 자체는 원본으로 진행한다
 *
 * 이미지는 속성 판정에만 쓰이고 서버에 저장되지 않는다 (Zero-Storage)
 */
async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));

    // 크기가 충분히 작으면 다시 그릴 필요가 없다.
    // 다만 파일 타입이 비어 있는 경우가 있어, 그때는 내용은 그대로 두고 타입만 보정한다
    if (scale >= 1) {
      bitmap.close();
      const hasValidType =
        file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp';
      if (hasValidType) return file;
      return new File([file], file.name, { type: 'image/jpeg' });
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) return file;

    return new File([blob], 'scan.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

export default function ScanPage() {
  const [step, setStep] = useState<Step>('capture');
  const [eggId, setEggId] = useState<string | null>(null);
  const [requiredSteps, setRequiredSteps] = useState<number | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSlotFull, setIsSlotFull] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 브라우저는 파일 값이 바뀔 때만 onChange를 발생시킨다.
    // 비워두지 않으면 같은 사진을 다시 골랐을 때 아무 반응이 없다
    e.target.value = '';

    setError(null);
    setIsSlotFull(false);
    setIsDone(false);
    setEggId(null);
    setRequiredSteps(null);
    setStep('developing');

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const uploadFile = await resizeImage(file);

      const formData = new FormData();
      formData.append('image', uploadFile); // 서버가 기대하는 필드명 (app/api/scans/route.ts)

      const res = await fetch('/api/scans', {
        method: 'POST',
        body: formData, // FormData는 Content-Type을 브라우저가 자동으로 넣는다
        signal: controller.signal,
      });

      // 서버가 다운되면 JSON이 아닌 응답이 올 수 있어, 파싱 실패 시 null로 두고
      // 아래에서 대비용 문구를 쓰게 한다
      const body = await res.json().catch(() => null);

      // 응답이 최소 연출 시간보다 빨리 오면 남은 시간만큼 기다린다
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_DEVELOP_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_DEVELOP_MS - elapsed));
      }

      // 거부 응답도 HTTP 200이므로 code가 정확히 OK일 때만 통과시킨다
      if (!res.ok || body?.code !== CODE_OK) {
        // 보관함 초과는 사용자가 할 수 있는 조치가 있어(부화시키기) 따로 구분한다
        setIsSlotFull(body?.code === CODE_EGG_SLOT_FULL);

        // 안내 문구는 서버가 내려준 message를 우선 사용하고,
        // 뒤의 문구는 응답 자체를 읽지 못한 경우에만 쓰이는 대비용이다
        setError(body?.message ?? '스캔에 실패했어요. 다시 시도해주세요.');
        setStep('capture');
        return;
      }

      // 응답 형식이 달라지더라도 화면이 깨지지 않도록 값이 없으면 null로 둔다
      setEggId(body.data?.eggId ?? null);
      setRequiredSteps(body.data?.requiredSteps ?? null);
      setIsDone(true);
    } catch (err) {
      // 시간 초과로 직접 끊은 경우와 그 외 네트워크 오류를 구분해 안내한다
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setError(
        aborted
          ? '분석이 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.'
          : '네트워크 오류가 발생했어요. 다시 시도해주세요.'
      );
      setStep('capture');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  return (
    <div className={`${notoSans.className} min-h-screen flex items-center justify-center bg-[#EAF3EA] p-4`}>
      {step === 'capture' ? (
        // ───────── 3. 촬영 ─────────
        <div className={`${SCREEN_FRAME} py-4`}>
          <div className="flex flex-col items-center shrink-0 mb-4">
            <h1 className="text-xl font-black text-[#1B1B1B] mb-1">사물을 촬영하세요</h1>
            <p className="text-sm text-center text-[#8A9A8E] leading-relaxed">
              주변 사물을 카메라에 담으면<br />몬스터로 변신해요
            </p>
          </div>

          {/* flex-1로 남는 공간만 차지하게 한다.
              min-h-0이 없으면 자식 크기만큼 늘어나 화면을 넘겨버린다 */}
          <div className="flex-1 min-h-0 w-full rounded-3xl bg-[#2A2A2A] p-4 shadow-xl flex flex-col">
            <div className="flex-1 min-h-0 rounded-2xl bg-[#1A1A1A] relative overflow-hidden mb-4">
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

            <div className="flex items-center justify-center shrink-0">
              <button
                onClick={() => inputRef.current?.click()}
                aria-label="촬영하기"
                className="w-[64px] h-[64px] rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform shadow-lg"
              >
                <span className="w-[54px] h-[54px] rounded-full border-[3px] border-[#2A2A2A]" />
              </button>
            </div>
          </div>

          {/* capture 속성 덕분에 폰에서는 카메라가 바로 열린다 (PC에서는 파일 선택창) */}
          {/* accept 값은 서버 허용 목록(lib/image.ts의 ALLOWED_IMAGE_TYPES)과 맞춤 */}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            capture="environment"
            onChange={handleCapture}
            className="hidden"
          />

          {error && (
            <div className="mt-4 shrink-0">
              <p className="text-sm text-[#C0503D] bg-[#FBEAE7] rounded-xl px-4 py-3 w-full text-center leading-relaxed">
                {error}
              </p>
              {/* 보관함은 부화해야 비므로, 가득 찼을 때는 미션 화면으로 안내한다 */}
              {isSlotFull && (
                <button
                  onClick={() => router.push('/mission')}
                  className="mt-3 w-full py-3.5 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
                >
                  미션 하러 가기
                </button>
              )}
            </div>
          )}
        </div>
      ) : (
        // ───────── 4+5. 인화 → 잠금 결과 ─────────
        // 같은 폴라로이드를 유지한 채 문구와 버튼만 바뀌게 해 하나의 장면처럼 이어지게 한다
        <div className={`${SCREEN_FRAME} py-4 items-center`}>
          <div className="flex-1 min-h-0 flex flex-col items-center justify-center w-full">
            {/* 프린터 출구 */}
            <div className="w-60 h-[18px] rounded-[3px] bg-gradient-to-b from-[#4A4A4A] via-[#2A2A2A] to-[#1A1A1A] shadow-lg relative z-20 flex items-center justify-center shrink-0">
              <div className="w-[212px] h-[5px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]" />
            </div>

            <div className="w-60 relative z-10 clip-window shrink-0">
              <div className="polaroid bg-white shadow-2xl px-3 pt-3 pb-12 rounded-[2px]">
                <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center">
                  <MonsterSilhouette className="w-3/4 h-3/4 text-white/25 blur-[6px]" />

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

            <div className="mt-6 text-center shrink-0">
              {!isDone ? (
                <>
                  <p className="text-sm font-bold text-[#1B1B1B]">인화 중...</p>
                  <p className="text-xs text-[#8A9A8E] mt-1">몬스터를 분석하고 있어요</p>
                </>
              ) : (
                <div className="fade-up">
                  <p className="text-sm font-bold text-[#1B1B1B] mb-1">몬스터를 획득했어요!</p>
                  {/* 필요한 걸음 수는 희귀도마다 다르므로 서버가 준 값을 그대로 보여준다 */}
                  <p className="text-xs text-[#8A9A8E]">
                    {requiredSteps !== null
                      ? `${requiredSteps.toLocaleString()}보를 걸으면 공개돼요`
                      : '걷기 미션을 완료하면 공개돼요'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {isDone && (
            <div className="w-full shrink-0 fade-up">
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
      )}

      <style jsx>{`
        /* 폴라로이드가 프린터 출구 위로 삐져나오지 않도록 잘라낸다 */
        .clip-window {
          clip-path: inset(0 -40px -40px -40px);
        }
        .polaroid {
          animation: print 2.4s cubic-bezier(0.16, 0.84, 0.28, 1) forwards;
        }
        /* 70%에서 살짝 지나쳤다가 되돌아오게 해 종이가 밀려나오는 관성을 표현 */
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
        /* 화면 움직임에 민감한 사용자를 위해 애니메이션을 끈다 */
        @media (prefers-reduced-motion: reduce) {
          .polaroid, .fade-up { animation: none; }
        }
      `}</style>
    </div>
  );
}