'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

// TODO: "게임 내 기본 화면"이 확정되면 이 경로만 수정하면 됩니다
const HOME_PATH = '/scan';

const NICKNAME_REGEX = /^[가-힣a-zA-Z0-9]*$/;
const isValidNickname = (name: string) => name.length >= 2 && name.length <= 12 && NICKNAME_REGEX.test(name);

// 두 화면이 동일한 규격을 공유
const SCREEN_FRAME = 'w-full max-w-sm flex flex-col h-[calc(100svh-2rem)] max-h-[760px]';

// TODO: 임시 실루엣. 권지윤님의 몬스터 에셋 완성되면 실제 이미지로 교체 예정
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

export default function OnboardingClient() {
  const [step, setStep] = useState<'intro' | 'nickname'>('intro');
  const [nickname, setNickname] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const router = useRouter();

  const handleNicknameChange = (raw: string) => {
    if (isComposing) {
      setNickname(raw.slice(0, 12));
      return;
    }
    const filtered = raw.replace(/[^가-힣a-zA-Z0-9]/g, '').slice(0, 12);
    setNickname(filtered);
  };

  const handleSubmit = async () => {
    if (!isValidNickname(nickname) || submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });

      if (!res.ok) {
        // 서버가 내려주는 안내 문구를 그대로 사용
        const body = await res.json().catch(() => null);
        setSubmitError(body?.message ?? '닉네임 등록에 실패했어요. 다시 시도해주세요.');
        setSubmitting(false);
        return;
      }

      // anon_token 쿠키는 서버가 직접 심어주므로 프론트에서 처리할 것 없음
      router.push(HOME_PATH);
      router.refresh(); // 서버 컴포넌트가 새 쿠키를 인식하도록 갱신
    } catch {
      setSubmitError('네트워크 오류가 발생했어요. 다시 시도해주세요.');
      setSubmitting(false);
    }
  };

  return (
    <div className={`${notoSans.className} min-h-screen flex items-center justify-center bg-[#EAF3EA] p-4`}>
      {step === 'intro' ? (
        // ───────── 1. 인트로 ─────────
        <div className={`${SCREEN_FRAME} py-8`}>
          <div className="flex flex-col items-center shrink-0">
            <h1 className="text-3xl font-black text-[#1B1B1B] mb-3">MonSnap</h1>
            <p className="text-sm text-center text-[#4B5A50] leading-relaxed">
              주변 사물을 찍고 걷기 미션을 수행하여<br />몬스터를 수집하세요!
            </p>
          </div>

          {/* 카드: 위 설명과 아래 안내문구 사이 공간의 정중앙 */}
          <div className="flex-1 flex items-center justify-center">
            <div className="flex items-end justify-center gap-2">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={
                    i === 1
                      ? 'bg-white rounded-xl shadow-md p-2 w-24 z-10'
                      : 'bg-white/60 rounded-xl p-2 w-20 opacity-60 mb-2'
                  }
                >
                  <div className="aspect-square rounded-lg bg-[#DCE8DE] flex items-center justify-center relative mb-1 overflow-hidden">
                    <MonsterSilhouette className="w-3/4 h-3/4 text-[#B8CDBE]" />
                    <span className="absolute text-2xl font-black text-[#8FAF98]/70">?</span>
                  </div>
                  {i === 1 && (
                    <>
                      <p className="text-[11px] font-bold text-center text-[#3E5E4C] mb-1">??? 몬스터</p>
                      <div className="flex gap-1 justify-center">
                        <span className="text-[9px] bg-[#DCE8DE] text-[#3E7A5C] rounded-full px-1.5 py-0.5">재질</span>
                        <span className="text-[9px] bg-[#FCEEB0] text-[#8A6D1A] rounded-full px-1.5 py-0.5">등급</span>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 하단 안내문구 (위치 고정) */}
          <p className="text-xs text-[#8A9A8E] text-center shrink-0">
            미션을 완료하고 몬스터를 공개해보세요!
          </p>

          {/* 하단 버튼: 닉네임 화면의 "다음으로"와 동일한 위치 */}
          <div className="mt-auto pt-8 shrink-0">
            <button
              onClick={() => setStep('nickname')}
              className="w-full py-4 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
            >
              시작하기
            </button>
          </div>
        </div>
      ) : (
        // ───────── 2. 닉네임 입력 ─────────
        <div className={`${SCREEN_FRAME} bg-white rounded-[32px] px-6 py-8`}>
          {/* 상단 */}
          <div className="grid grid-cols-3 items-center shrink-0 mb-8">
            <button onClick={() => setStep('intro')} className="w-9 h-9 rounded-full bg-[#F2F5F2] flex items-center justify-center">
              <ChevronLeft size={18} className="text-[#1B1B1B]" />
            </button>
            <p className="font-bold text-[#1B1B1B] text-center">프로필 설정</p>
            <div />
          </div>

          {/* 본문 */}
          <div className="bg-[#F7FAF7] rounded-2xl p-5 shrink-0">
            <p className="font-bold text-[#1B1B1B] mb-1">닉네임 입력</p>
            <p className="text-xs text-[#8A9A8E] mb-4">MonSnap에서 사용할 닉네임을 입력해 주세요</p>
            <input
              value={nickname}
              onChange={(e) => handleNicknameChange(e.target.value)}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={(e) => {
                setIsComposing(false);
                handleNicknameChange((e.target as HTMLInputElement).value);
              }}
              placeholder="닉네임을 입력하세요 (2~12자)"
              disabled={submitting}
              className="w-full bg-white border-2 border-[#E0E5E1] rounded-xl px-4 py-3 text-sm text-[#1B1B1B] placeholder:text-[#B0BDB4] outline-none transition-colors duration-150 focus:border-[#3E7A5C] focus:bg-[#F0F7F1] disabled:opacity-60 mb-1"
            />
            <p className="text-right text-[10px] text-[#B0BDB4] mb-4">{nickname.length}/12</p>
            <ul className="space-y-1">
              {['한글, 영문, 숫자 사용 가능', '2자 이상 12자 이내', '특수문자 및 공백 불가'].map((rule) => (
                <li key={rule} className="text-[11px] text-[#8A9A8E] flex items-center gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-[#B0BDB4]" /> {rule}
                </li>
              ))}
            </ul>
          </div>

          {/* 하단 버튼: 인트로의 "시작하기"와 동일한 위치 */}
          <div className="mt-auto pt-8 shrink-0">
            {submitError && (
              <p className="text-xs text-[#C0503D] text-center mb-3">{submitError}</p>
            )}

            <button
              onClick={handleSubmit}
              disabled={!isValidNickname(nickname) || submitting}
              className="w-full py-4 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform disabled:bg-[#CFE3D3] disabled:active:scale-100"
            >
              {submitting ? '등록 중...' : '다음으로'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}