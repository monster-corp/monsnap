'use client';

import {
  useEffect,
  useRef,
  useState,
  type TouchEvent,
} from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Ghost,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { ApiError, ERROR } from "@/lib/api/response";

const SWIPE_THRESHOLD = 45;

// 상단 종이 영역 높이
const TOP_PAPER_HEIGHT = '106px';

type Monster = {
  id: string;
  name: string;
  rarity?: string;
  imageUrl?: string;
};

type UserMonsterItem = {
  userMonsterId: string;
  name: string;
  rarity: string;
  imageUrl: string;
};

export default function HomePage() {
  // error, setError 상태 선언 추가
  const [error, setError] = useState<string | null>(null);

  // /api/users 연동 전/실패 시 fallback
  const [nickname, setNickname] =
    useState('새내기 탐험가');

  const [monsters, setMonsters] =
    useState<Monster[]>([]);

  const [
    activeMonsterIndex,
    setActiveMonsterIndex,
  ] = useState(0);

  const [scanCharges, setScanCharges] =
    useState(0);

  const [
    maxScanCharges,
    setMaxScanCharges,
  ] = useState(5);

  const [speechText, setSpeechText] =
    useState('');

  const [loading, setLoading] =
    useState(true);

  const [monsterLoadError, setMonsterLoadError] =
    useState(false);

  const touchStartX =
    useRef<number | null>(null);

  const touchEndX =
    useRef<number | null>(null);

  const activeMonster =
    monsters.length > 0
      ? monsters[activeMonsterIndex]
      : null;

  // ─────────────────────
  // 메인 데이터 조회
  // ─────────────────────
  useEffect(() => {
    async function fetchLobbyData() {

      // 요청 시작 시 기존 에러 상태 초기화 (재시도 케이스 대응)
      setError(null);

      try {
        // ─────────────────────
        // 1. 현재 사용자 정보
        // ─────────────────────
        try {
          const userRes = await fetch('/api/users');
          const userData = await userRes.json().catch(() => null);

          if (!userRes.ok || userData?.code !== ERROR.OK.code) {
            // 서버에서 내려준 메시지가 있다면 해당 메시지를 UI에 노출
            const serverMessage = userData?.message;
            if (serverMessage) {
              setError(serverMessage);
              return;
            }
            // 메시지가 없는 알 수 없는 서버 에러일 때만 INTERNAL_ERROR 예외 던지기
            throw new ApiError("INTERNAL_ERROR");
          }

          setNickname(userData.data?.nickname ?? '새내기 탐험가');
          setScanCharges(userData.data?.scanCharge?.charges ?? 0);
          setMaxScanCharges(userData.data?.scanCharge?.maxCharges ?? 5);
        } catch (error) {
          if (error instanceof ApiError) {
            console.error(`[/api/users] ApiError (${error.key} / ${error.code}):`, error.message);
          } else if (error instanceof Error) {
            console.error("[/api/users] unexpected error:", error.message);
          } else {
            console.error("[/api/users] unknown error:", error);
          }
        }

        // ─────────────────────
        // 2. 보유 몬스터 전체 조회
        // ─────────────────────
        try {
          const monsterRes = await fetch('/api/user-monsters?sort=dexId&order=asc');
          const monsterData = await monsterRes.json().catch(() => null);

          if (!monsterRes.ok || monsterData?.code !== ERROR.OK.code) {
            // 서버에서 내려준 메시지가 있다면 해당 메시지를 UI에 노출
            const serverMessage = monsterData?.message;
            if (serverMessage) {
              setError(serverMessage);
              return;
            }
            // 메시지가 없는 알 수 없는 서버 에러일 때만 INTERNAL_ERROR 예외 던지기
            throw new ApiError("INTERNAL_ERROR");
          }

          const list = monsterData.data?.userMonsters;

          if (!Array.isArray(list)) {
            throw new ApiError("INVALID_REQUEST");
          }

          if (list.length === 0) {
            setMonsterLoadError(false);
            setMonsters([]);
            setSpeechText('주변 사물을 찍어 첫 친구를 찾아볼까요?');
          } else {
            const parsedMonsters: Monster[] = (list as UserMonsterItem[]).map((item) => {
              let imageUrl = item.imageUrl;

              if (
                imageUrl &&
                !imageUrl.startsWith('http') &&
                !imageUrl.startsWith('/')
              ) {
                imageUrl = `/${imageUrl}`;
              }

              return {
                id: item.userMonsterId,
                name: item.name,
                rarity: item.rarity,
                imageUrl,
              };
            });

            setMonsterLoadError(false);
            setMonsters(parsedMonsters);
            setActiveMonsterIndex(0);
            setSpeechText('오늘도 같이 탐험해볼까요?');
          }
        } catch (error) {
          if (error instanceof ApiError) {
            console.error(`[/api/user-monsters] ApiError (${error.key} / ${error.code}):`, error.message);
          } else if (error instanceof Error) {
            console.error("[/api/user-monsters] unexpected error:", error.message);
          } else {
            console.error("[/api/user-monsters] unknown error:", error);
          }

          setMonsterLoadError(true);
          setMonsters([]);
          setSpeechText('몬스터 정보를 불러오지 못했어요.');
        }
      } finally {
        setLoading(false);
      }
    }

    void fetchLobbyData();
  }, []);

  // 몬스터가 바뀌면 기본 대사
  useEffect(() => {
    if (monsters.length > 0) {
      setSpeechText('오늘도 같이 탐험해볼까요?');
    }
  }, [
    activeMonsterIndex,
    monsters.length,
  ]);

  // ─────────────────────
  // 이전 몬스터
  // ─────────────────────
  const showPreviousMonster = () => {
    if (monsters.length <= 1) return;

    setActiveMonsterIndex((prev) =>
      prev === 0
        ? monsters.length - 1
        : prev - 1
    );
  };

  // ─────────────────────
  // 다음 몬스터
  // ─────────────────────
  const showNextMonster = () => {
    if (monsters.length <= 1) return;

    setActiveMonsterIndex((prev) =>
      prev === monsters.length - 1
        ? 0
        : prev + 1
    );
  };

  // ─────────────────────
  // 모바일 좌우 스와이프
  // ─────────────────────
  const handleTouchStart = (
    event: TouchEvent<HTMLDivElement>
  ) => {
    touchStartX.current =
      event.touches[0]?.clientX ??
      null;

    touchEndX.current = null;
  };

  const handleTouchMove = (
    event: TouchEvent<HTMLDivElement>
  ) => {
    touchEndX.current =
      event.touches[0]?.clientX ??
      null;
  };

  const handleTouchEnd = () => {
    if (
      touchStartX.current === null ||
      touchEndX.current === null
    ) {
      touchStartX.current = null;
      touchEndX.current = null;
      return;
    }

    const distance =
      touchStartX.current -
      touchEndX.current;

    if (
      Math.abs(distance) >=
      SWIPE_THRESHOLD
    ) {
      if (distance > 0) {
        showNextMonster();
      } else {
        showPreviousMonster();
      }
    }

    touchStartX.current = null;
    touchEndX.current = null;
  };

  // ─────────────────────
  // 말풍선 터치 시 대사 변경
  // ─────────────────────
  const handleTouchCenter = () => {
    if (activeMonster) {
      const dialogues = [
        '오늘은 어떤 사물을 만나게 될까요?',
        '걸을수록 사진이 선명하게 인화돼요.',
        '새로운 친구를 만나러 가볼까요?',
        '멋진 사물을 발견하면 꼭 보여주세요!',
      ];

      setSpeechText(
        dialogues[
          Math.floor(
            Math.random() *
              dialogues.length
          )
        ]
      );

      return;
    }

    const emptyDialogues = [
      '주변 사물을 찍어 첫 친구를 찾아볼까요?',
      '책상 위 물건부터 촬영해보는 건 어때요?',
      '사물을 촬영하고 걸어서 알을 부화시켜보세요!',
    ];

    setSpeechText(
      emptyDialogues[
        Math.floor(
          Math.random() *
            emptyDialogues.length
        )
      ]
    );
  };

  return (
    <div
      className="
        h-full
        w-full
        relative
        overflow-hidden
        select-none
        bg-[#E7E0D8]
      "
    >
      {/* ═══════════════════════════════
          상단 종이 영역
      ═══════════════════════════════ */}
      <div
        className="
          absolute
          top-0
          left-0
          right-0
          z-[5]
          bg-[#E7E0D8]
          border-b
          border-[#C8BFB5]
        "
        style={{
          height: TOP_PAPER_HEIGHT,
        }}
      />

      {/* ═══════════════════════════════
          몬스터 이미지 영역
      ═══════════════════════════════ */}
      {activeMonster?.imageUrl ? (
        <>
          {/* 흐린 보조 배경 */}
          <div
            className="
              absolute
              left-0
              right-0
              bottom-0
              overflow-hidden
            "
            style={{
              top: TOP_PAPER_HEIGHT,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={
                activeMonster.imageUrl
              }
              alt=""
              aria-hidden="true"
              className="
                w-full
                h-full
                object-cover
                scale-[1.18]
                blur-2xl
                opacity-35
              "
            />
          </div>

          {/* 실제 몬스터 이미지 */}
          <div
            className="
              absolute
              left-0
              right-0
              bottom-0
              touch-pan-y
              overflow-hidden
            "
            style={{
              top: TOP_PAPER_HEIGHT,
            }}
            onTouchStart={
              handleTouchStart
            }
            onTouchMove={
              handleTouchMove
            }
            onTouchEnd={
              handleTouchEnd
            }
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              key={
                activeMonster.id
              }
              src={
                activeMonster.imageUrl
              }
              alt={
                activeMonster.name
              }
              className="
                w-full
                h-full
                object-cover
                scale-[1.18]
                transition-transform
                duration-300
                ease-out
              "
            />
          </div>

          {/* 가독성 그라데이션 */}
          <div
            className="
              pointer-events-none
              absolute
              left-0
              right-0
              bottom-0
              bg-gradient-to-b
              from-black/5
              via-transparent
              to-black/45
            "
            style={{
              top: TOP_PAPER_HEIGHT,
            }}
          />
        </>
      ) : (
        <>
          {/* 몬스터가 없는 경우 */}
          <div
            className="
              absolute
              left-0
              right-0
              bottom-0
              bg-gradient-to-b
              from-[#F4F8F5]
              via-[#E9F1EB]
              to-[#D8E5DC]
            "
            style={{
              top: TOP_PAPER_HEIGHT,
            }}
          />

          <div
            className="
              pointer-events-none
              absolute
              -left-24
              top-32
              w-80
              h-80
              rounded-full
              bg-white/40
              blur-3xl
            "
          />

          <div
            className="
              pointer-events-none
              absolute
              -right-24
              bottom-10
              w-80
              h-80
              rounded-full
              bg-[#AAC6B2]/30
              blur-3xl
            "
          />
        </>
      )}

      {/* ═══════════════════════════════
          상단 정보
      ═══════════════════════════════ */}
      <header
        className="
          absolute
          top-0
          left-0
          right-0
          z-20
          h-[106px]
          px-4
          pt-4
          flex
          items-start
          justify-between
        "
      >
        {/* 프로필 */}
        <div
          className="
            flex
            items-center
            gap-2
            bg-[#F3EEE8]
            pl-2
            pr-3.5
            py-1.5
            rounded-full
            border
            border-[#C8BFB5]
            shadow-[0_2px_7px_rgba(45,38,30,0.10)]
          "
        >
          <div
            className="
              w-8
              h-8
              rounded-full
              bg-[#1F4B3C]
              flex
              items-center
              justify-center
              shadow-sm
            "
          >
            <UserRound
              size={16}
              className="text-[#F4F0EA]"
            />
          </div>

          <span
            className="
              text-xs
              font-black
              text-[#31473C]
              max-w-[110px]
              truncate
            "
          >
            {nickname}
          </span>
        </div>

        {/* 스캔 가능 횟수 */}
        <Link
          href="/scans"
          className="
            flex
            items-center
            gap-2
            bg-[#F3EEE8]
            pl-3
            pr-3.5
            py-2
            rounded-full
            border
            border-[#C8BFB5]
            shadow-[0_2px_7px_rgba(45,38,30,0.10)]
            active:scale-95
            transition-transform
          "
        >
          <Camera
            size={14}
            className="text-[#456A58]"
          />

          <div
            className="
              flex
              flex-col
              items-start
              leading-none
            "
          >
            <div
              className="
                flex
                items-center
                gap-2
              "
            >
              <span
                className="
                  text-[11px]
                  font-bold
                  text-[#66776E]
                "
              >
                스캔 가능
              </span>

              <span
                className="
                  text-sm
                  font-black
                  text-[#1F4B3C]
                "
              >
                {scanCharges}/
                {maxScanCharges}
              </span>
            </div>

          </div>
        </Link>
      </header>

      {/* ═══════════════════════════════
          메인 UI
      ═══════════════════════════════ */}
      <div
        className="
          relative
          z-10
          h-full
          w-full
          flex
          flex-col
          pointer-events-none
        "
        style={{
          paddingTop:
            TOP_PAPER_HEIGHT,
        }}
      >
        <main
          className="
            flex-1
            min-h-0
            flex
            flex-col
            justify-end
            items-center
            px-4
            pb-4
            pointer-events-auto
          "
        >
          {loading ? (
            <div
              className="
                flex-1
                flex
                items-center
                justify-center
              "
            >
              <div
                className="
                  w-8
                  h-8
                  border-2
                  border-white
                  border-t-transparent
                  rounded-full
                  animate-spin
                  drop-shadow-md
                "
              />
            </div>
          ) : activeMonster ? (
            <div
              className="
                w-full
                flex
                flex-col
                items-center
                relative
              "
            >
              {/* 좌우 몬스터 전환 */}
              {monsters.length >
                1 && (
                <>
                  <button
                    type="button"
                    onClick={
                      showPreviousMonster
                    }
                    aria-label="이전 몬스터"
                    className="
                      absolute
                      left-0
                      top-[-205px]
                      w-10
                      h-10
                      rounded-full
                      bg-[#1A2621]/75
                      backdrop-blur-md
                      border
                      border-white/15
                      text-white
                      flex
                      items-center
                      justify-center
                      shadow-[0_4px_12px_rgba(0,0,0,0.18)]
                      active:scale-90
                      transition-all
                    "
                  >
                    <ChevronLeft
                      size={20}
                    />
                  </button>

                  <button
                    type="button"
                    onClick={
                      showNextMonster
                    }
                    aria-label="다음 몬스터"
                    className="
                      absolute
                      right-0
                      top-[-205px]
                      w-10
                      h-10
                      rounded-full
                      bg-[#1A2621]/75
                      backdrop-blur-md
                      border
                      border-white/15
                      text-white
                      flex
                      items-center
                      justify-center
                      shadow-[0_4px_12px_rgba(0,0,0,0.18)]
                      active:scale-90
                      transition-all
                    "
                  >
                    <ChevronRight
                      size={20}
                    />
                  </button>
                </>
              )}

              {/* 말풍선 */}
              <button
                type="button"
                onClick={
                  handleTouchCenter
                }
                className="
                  relative
                  max-w-[270px]
                  mb-2
                  px-4
                  py-2.5
                  rounded-2xl
                  bg-white/90
                  backdrop-blur-lg
                  border
                  border-white/70
                  shadow-[0_5px_16px_rgba(0,0,0,0.08)]
                  active:scale-95
                  transition-transform
                "
              >
                {/* 몬스터 방향을 가리키는 꼬리 */}
                <span
                  className="
                    absolute
                    left-1/2
                    -top-[8px]
                    -translate-x-1/2
                    w-0
                    h-0
                    border-l-[7px]
                    border-l-transparent
                    border-r-[7px]
                    border-r-transparent
                    border-b-[8px]
                    border-b-white/90
                  "
                />

                <p
                  className="
                    text-xs
                    font-bold
                    text-[#263B31]
                    leading-relaxed
                    text-center
                    break-keep
                  "
                >
                  {speechText}
                </p>
              </button>

              {/* 인디케이터 */}
              {monsters.length >
                1 && (
                <div
                  className="
                    flex
                    items-center
                    justify-center
                    gap-1.5
                    mt-2
                  "
                >
                  {monsters.map(
                    (
                      monster,
                      index
                    ) => (
                      <button
                        key={
                          monster.id
                        }
                        type="button"
                        onClick={() =>
                          setActiveMonsterIndex(
                            index
                          )
                        }
                        aria-label={`${index + 1}번째 몬스터`}
                        className={`
                          h-1.5
                          rounded-full
                          transition-all
                          duration-300
                          ${
                            index ===
                            activeMonsterIndex
                              ? 'w-5 bg-white'
                              : 'w-1.5 bg-white/45'
                          }
                        `}
                      />
                    )
                  )}
                </div>
              )}
            </div>
          ) : (
            /* 보유 몬스터 없음 */
            <button
              type="button"
              onClick={
                handleTouchCenter
              }
              className="
                mb-3
                flex
                flex-col
                items-center
                active:scale-[0.98]
                transition-transform
              "
            >
              <div
                className="
                  relative
                  w-44
                  h-44
                  flex
                  items-center
                  justify-center
                "
              >
                <div
                  className="
                    absolute
                    inset-0
                    rounded-full
                    bg-white/30
                    border
                    border-white/50
                  "
                />

                <div
                  className="
                    relative
                    w-32
                    h-32
                    rounded-full
                    bg-gradient-to-br
                    from-[#327052]
                    to-[#1F4B3C]
                    flex
                    flex-col
                    items-center
                    justify-center
                    text-white
                    shadow-[0_18px_35px_rgba(31,75,60,0.22)]
                  "
                >
                  <Ghost
                    size={50}
                    strokeWidth={1.7}
                    className="mb-1"
                  />

                  <span
                    className="
                      text-[9px]
                      tracking-[0.18em]
                      font-black
                      opacity-90
                    "
                  >
                    START
                  </span>
                </div>
              </div>

              <p
                className="
                  mt-5
                  text-sm
                  font-black
                  text-[#284336]
                "
              >
                {monsterLoadError
                  ? '몬스터 정보를 불러오지 못했어요'
                  : '아직 만난 몬스터가 없어요'}
              </p>

              <p
                className="
                  mt-2
                  text-xs
                  text-[#718278]
                  leading-relaxed
                  text-center
                  break-keep
                "
              >
                {monsterLoadError ? (
                  <>
                    잠시 후 다시 시도해 주세요.
                  </>
                ) : (
                  <>
                    주변 사물을 촬영하고 걸어서
                    <br />
                    첫 몬스터를 만나보세요!
                  </>
                )}
              </p>
            </button>
          )}
        </main>

        {/* 하단 CTA */}
        <footer
          className="
            shrink-0
            flex
            justify-center
            px-4
            pb-6
            pointer-events-auto
          "
        >
          <Link
            href="/scans"
            className="
              min-w-[210px]
              max-w-[250px]
              px-6
              py-3
              rounded-full
              bg-[#1F4B3C]
              text-white
              font-black
              text-sm
              shadow-[0_8px_20px_rgba(0,0,0,0.18)]
              border
              border-white/10
              flex
              items-center
              justify-center
              active:scale-[0.97]
              transition-transform
              animate-[pulse_3s_ease-in-out_infinite]
            "
          >
            몬스터 찾으러 가기
          </Link>
        </footer>
      </div>
    </div>
  );
}
