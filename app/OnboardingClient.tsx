'use client';

import {
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import {
  Check,
  ChevronLeft,
  X,
} from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({
  weight: ['400', '700', '900'],
  display: 'swap',
  preload: false,
});

const SCANS_PATH = '/scans';
const CODE_OK = 20000;
const AUTO_SLIDE_MS = 3000;

const SCREEN_FRAME =
  'w-full max-w-sm flex flex-col h-[calc(100svh-2rem)] max-h-[760px]';

const NICKNAME_REGEX =
  /^[가-힣a-zA-Z0-9]+$/;

type IntroMonster = {
  id: number;
  name: string;
  material: string;
  shape: string;
};

type NicknameRuleProps = {
  valid: boolean;
  children: ReactNode;
};

const INTRO_MONSTERS: IntroMonster[] = [
  {
    id: 1,
    name: '몬스터',
    material: '금속',
    shape: '둥글',
  },
  {
    id: 2,
    name: '몬스터',
    material: '유리',
    shape: '길쭉',
  },
  {
    id: 3,
    name: '몬스터',
    material: '플라스틱',
    shape: '네모',
  },
];

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

function NicknameRule({
  valid,
  children,
}: NicknameRuleProps) {
  return (
    <li
      className={`text-[11px] flex items-center gap-1.5 transition-colors duration-200 ${
        valid
          ? 'text-[#3E7A5C]'
          : 'text-[#C0503D]'
      }`}
    >
      <span
        className={`w-4 h-4 rounded-full flex items-center justify-center shrink-0 transition-colors duration-200 ${
          valid
            ? 'bg-[#E1F0E4]'
            : 'bg-[#FBEAE7]'
        }`}
      >
        {valid ? (
          <Check
            size={10}
            strokeWidth={3}
          />
        ) : (
          <X
            size={10}
            strokeWidth={3}
          />
        )}
      </span>

      <span>{children}</span>
    </li>
  );
}

export default function OnboardingClient() {
  const router = useRouter();

  const [step, setStep] =
    useState<'intro' | 'nickname'>(
      'intro'
    );

  const [
    activeCardIndex,
    setActiveCardIndex,
  ] = useState(1);

  const [
    isCarouselHovered,
    setIsCarouselHovered,
  ] = useState(false);

  const [nickname, setNickname] =
    useState('');

  const [
    isComposing,
    setIsComposing,
  ] = useState(false);

  const [
    submitting,
    setSubmitting,
  ] = useState(false);

  const [
    submitError,
    setSubmitError,
  ] = useState<string | null>(null);

  useEffect(() => {
    if (
      step !== 'intro' ||
      isCarouselHovered
    ) {
      return;
    }

    const timer =
      window.setTimeout(() => {
        setActiveCardIndex(
          (prev) =>
            (prev + 1) %
            INTRO_MONSTERS.length
        );
      }, AUTO_SLIDE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    activeCardIndex,
    step,
    isCarouselHovered,
  ]);

  const getCardPosition = (
    index: number
  ) => {
    if (
      index === activeCardIndex
    ) {
      return 0;
    }

    const nextIndex =
      (activeCardIndex + 1) %
      INTRO_MONSTERS.length;

    if (index === nextIndex) {
      return 1;
    }

    return -1;
  };

  // 화면 검증은 사용자가 실제 입력한 값을 기준으로 처리합니다.
  // 서버 전송 시에는 백엔드와 동일하게 앞뒤 공백을 제거합니다.
  const normalizedNickname = nickname.trim();

  const hasAllowedCharacters =
    nickname.length > 0 &&
    NICKNAME_REGEX.test(nickname);

  const hasValidLength =
    nickname.length >= 2 &&
    nickname.length <= 12;

  const hasNoInvalidCharacters =
    nickname.length > 0 &&
    !/[^가-힣a-zA-Z0-9]/.test(nickname);

  const nicknameValid =
    hasAllowedCharacters &&
    hasValidLength &&
    hasNoInvalidCharacters;

  const canSubmit =
    nicknameValid &&
    !submitting &&
    !isComposing;

  const handleSubmit =
    async () => {
      if (!canSubmit) {
        return;
      }

      setSubmitting(true);
      setSubmitError(null);

      try {
        const res = await fetch(
          '/api/users',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            body: JSON.stringify({
              nickname:
                normalizedNickname,
            }),
          }
        );

        const body = await res
          .json()
          .catch(() => null);

        if (
          !res.ok ||
          body?.code !== CODE_OK
        ) {
          setSubmitError(
            body?.message ??
              '닉네임 등록에 실패했어요. 다시 시도해주세요.'
          );

          setSubmitting(false);
          return;
        }

        router.push(SCANS_PATH);
        router.refresh();
      } catch {
        setSubmitError(
          '네트워크 오류가 발생했어요. 다시 시도해주세요.'
        );

        setSubmitting(false);
      }
    };

  return (
    <div
      className={`${notoSans.className} min-h-screen flex items-center justify-center bg-[#EAF3EA] p-4`}
    >
      {step === 'intro' ? (
        <div
          className={`${SCREEN_FRAME} py-8`}
        >
          <div className="flex flex-col items-center shrink-0">
            <h1 className="text-3xl font-black text-[#1B1B1B] mb-3">
              MonSnap
            </h1>

            <p className="text-sm text-center text-[#4B5A50] leading-relaxed">
              주변 사물을 찍고 걷기
              미션을 수행하여
              <br />
              몬스터를 수집하세요!
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center">
            <div
              className="relative w-full h-[190px]"
              onMouseEnter={() => {
                setIsCarouselHovered(
                  true
                );
              }}
              onMouseLeave={() => {
                setIsCarouselHovered(
                  false
                );
              }}
            >
              {INTRO_MONSTERS.map(
                (
                  monster,
                  index
                ) => {
                  const position =
                    getCardPosition(
                      index
                    );

                  const isCenter =
                    position === 0;

                  const offsetX =
                    position === -1
                      ? -108
                      : position === 1
                        ? 108
                        : 0;

                  const offsetY =
                    isCenter
                      ? -12
                      : 10;

                  const scale =
                    isCenter
                      ? 1
                      : 0.76;

                  const opacity =
                    isCenter
                      ? 1
                      : 0.58;

                  return (
                    <button
                      type="button"
                      key={
                        monster.id
                      }
                      onMouseEnter={() => {
                        setActiveCardIndex(
                          index
                        );
                      }}
                      onFocus={() => {
                        setActiveCardIndex(
                          index
                        );
                      }}
                      onClick={() => {
                        setActiveCardIndex(
                          index
                        );
                      }}
                      aria-label={`${index + 1}번째 몬스터 보기`}
                      className={`
                        absolute
                        left-1/2
                        top-1/2
                        w-[146px]
                        bg-white
                        rounded-2xl
                        p-3
                        text-left
                        transition-[transform,opacity,box-shadow,background-color]
                        duration-500
                        ease-[cubic-bezier(0.22,1,0.36,1)]
                        will-change-transform
                        ${
                          isCenter
                            ? 'z-30 shadow-[0_16px_32px_-10px_rgba(45,75,55,0.32)]'
                            : 'z-10 shadow-sm bg-white/80'
                        }
                      `}
                      style={{
                        transform: `
                          translate(
                            calc(-50% + ${offsetX}px),
                            calc(-50% + ${offsetY}px)
                          )
                          scale(${scale})
                        `,
                        opacity,
                      }}
                    >
                      <div
                        className={`aspect-square rounded-xl flex items-center justify-center relative overflow-hidden transition-colors duration-500 ${
                          isCenter
                            ? 'bg-[#DCE8DE]'
                            : 'bg-[#E5ECE7]'
                        }`}
                      >
                        <MonsterSilhouette
                          className={`transition-all duration-500 ${
                            isCenter
                              ? 'w-3/4 h-3/4 text-[#A9C3AF]'
                              : 'w-2/3 h-2/3 text-[#C4D2C8]'
                          }`}
                        />

                        <span
                          className={`absolute font-black transition-all duration-500 ${
                            isCenter
                              ? 'text-3xl text-[#8FAF98]/70'
                              : 'text-xl text-[#AABBAE]/70'
                          }`}
                        >
                          ?
                        </span>
                      </div>

                      <div className="pt-2">
                        <p
                          className={`font-black text-center transition-all duration-500 ${
                            isCenter
                              ? 'text-[12px] text-[#35483D]'
                              : 'text-[10px] text-[#87948B]'
                          }`}
                        >
                          {
                            monster.name
                          }
                        </p>

                        <div
                          className={`flex justify-center gap-1 overflow-hidden transition-all duration-500 ${
                            isCenter
                              ? 'max-h-8 opacity-100 mt-1.5'
                              : 'max-h-0 opacity-0 mt-0'
                          }`}
                        >
                          <span className="text-[9px] font-bold bg-[#DCE8DE] text-[#3E7A5C] rounded-full px-2 py-0.5 whitespace-nowrap">
                            {
                              monster.material
                            }
                          </span>

                          <span className="text-[9px] font-bold bg-[#FCEEB0] text-[#8A6D1A] rounded-full px-2 py-0.5 whitespace-nowrap">
                            {
                              monster.shape
                            }
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div className="flex justify-center gap-1.5 mb-3 shrink-0">
            {INTRO_MONSTERS.map(
              (
                monster,
                index
              ) => (
                <button
                  type="button"
                  key={
                    monster.id
                  }
                  onMouseEnter={() => {
                    setActiveCardIndex(
                      index
                    );
                  }}
                  onClick={() => {
                    setActiveCardIndex(
                      index
                    );
                  }}
                  aria-label={`${index + 1}번째 몬스터 선택`}
                  className={`rounded-full transition-all duration-500 ${
                    index ===
                    activeCardIndex
                      ? 'w-5 h-1.5 bg-[#3E7A5C]'
                      : 'w-1.5 h-1.5 bg-[#BAC9BD]'
                  }`}
                />
              )
            )}
          </div>

          <p className="text-xs text-[#8A9A8E] text-center shrink-0">
            카드를 살펴보고 다양한
            몬스터를 만나보세요!
          </p>

          <div className="mt-auto pt-8 shrink-0">
            <button
              type="button"
              onClick={() => {
                setSubmitError(
                  null
                );

                setStep(
                  'nickname'
                );
              }}
              className="w-full py-4 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
            >
              시작하기
            </button>
          </div>
        </div>
      ) : (
        <div
          className={`${SCREEN_FRAME} bg-white rounded-[32px] px-6 py-8`}
        >
          <div className="grid grid-cols-3 items-center shrink-0 mb-8">
            <button
              type="button"
              onClick={() => {
                setSubmitError(
                  null
                );

                setStep('intro');
              }}
              className="w-9 h-9 rounded-full bg-[#F2F5F2] flex items-center justify-center active:scale-95 transition-transform"
              aria-label="인트로로 돌아가기"
            >
              <ChevronLeft
                size={18}
                className="text-[#1B1B1B]"
              />
            </button>

            <p className="font-bold text-[#1B1B1B] text-center">
              프로필 설정
            </p>

            <div />
          </div>

          <div className="bg-[#F7FAF7] rounded-2xl p-5 shrink-0">
            <p className="font-bold text-[#1B1B1B] mb-1">
              닉네임 입력
            </p>

            <p className="text-xs text-[#8A9A8E] mb-4">
              MonSnap에서 사용할
              닉네임을 입력해 주세요
            </p>

            <input
              value={nickname}
              onCompositionStart={() => {
                setIsComposing(
                  true
                );
              }}
              onCompositionEnd={() => {
                setIsComposing(
                  false
                );
              }}
              onChange={(e) => {
                setNickname(
                  e.target.value
                );

                if (
                  submitError
                ) {
                  setSubmitError(
                    null
                  );
                }
              }}
              placeholder="닉네임을 입력하세요 (2~12자)"
              disabled={submitting}
              autoComplete="off"
              inputMode="text"
              className={`w-full bg-white border-2 rounded-xl px-4 py-3 text-sm text-[#1B1B1B] placeholder:text-[#B0BDB4] outline-none transition-colors duration-200 disabled:opacity-60 mb-1 ${
                nickname.length ===
                0
                  ? 'border-[#E0E5E1] focus:border-[#3E7A5C] focus:bg-[#F0F7F1]'
                  : nicknameValid
                    ? 'border-[#7EAC89] focus:border-[#3E7A5C] bg-[#FBFDFB]'
                    : 'border-[#D98A7B] focus:border-[#C0503D] bg-[#FFF9F8]'
              }`}
            />

            <p
              className={`text-right text-[10px] mb-4 ${
                nickname.length > 12
                  ? 'text-[#C0503D] font-bold'
                  : 'text-[#B0BDB4]'
              }`}
            >
              {
                nickname.length
              }
              /12
            </p>

            <ul className="space-y-2">
              <NicknameRule
                valid={
                  hasAllowedCharacters
                }
              >
                한글, 영문, 숫자
                사용 가능
              </NicknameRule>

              <NicknameRule
                valid={
                  hasValidLength
                }
              >
                2자 이상 12자 이내
              </NicknameRule>

              <NicknameRule
                valid={
                  hasNoInvalidCharacters
                }
              >
                특수문자 및 공백 불가
              </NicknameRule>
            </ul>
          </div>

          <div className="mt-auto pt-8 shrink-0">
            {submitError && (
              <p className="text-xs text-[#C0503D] text-center mb-3">
                {submitError}
              </p>
            )}

            <button
              type="button"
              onClick={
                handleSubmit
              }
              disabled={!canSubmit}
              className={`w-full py-4 rounded-full font-bold text-sm transition-all ${
                canSubmit
                  ? 'bg-[#1F4B3C] text-white shadow-md active:scale-95 cursor-pointer'
                  : 'bg-[#CFE3D3] text-white/80 shadow-none cursor-not-allowed'
              }`}
            >
              {submitting
                ? '등록 중...'
                : '다음으로'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
