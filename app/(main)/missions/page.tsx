'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Check,
  Sun,
  Moon,
  CalendarCheck,
  Camera,
  Footprints,
  Gauge,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';
import { ApiError, ERROR } from "@/lib/api/response";

const notoSans = Noto_Sans_KR({
  weight: ['400', '500', '700', '900'],
  display: 'swap',
  preload: false,
});

type Tab = 'daily' | 'weekly';

type Mission = {
  missionId: string;
  code: string;
  title: string;
  description: string | null;
  cycle: string;
  conditionType: string;
  progress: number;
  targetCount: number;
  completed: boolean;
  completedAt: string | null;
  claimedAt: string | null;
  periodEndsAt: string;
};

function MissionIcon({
  conditionType,
  code,
}: {
  conditionType: string;
  code: string;
}) {
  switch (conditionType) {
    case 'SCAN_COUNT':
      return <Camera size={20} className="text-[#3E7A5C]" />;

    case 'WALK_SESSION_COUNT':
      return <Footprints size={20} className="text-[#3E7A5C]" />;

    case 'TOTAL_STEPS':
      return <Gauge size={20} className="text-[#3E7A5C]" />;

    case 'DEX_REGISTER_COUNT':
      return <BookOpen size={20} className="text-[#3E7A5C]" />;

    case 'DAILY_MISSION_CLEAR':
      return <Check size={20} className="text-[#3E7A5C]" />;

    case 'HATCH_IN_TIME_RANGE':
      return code === 'DAILY_NIGHT_HATCH' ? (
        <Moon size={20} className="text-[#3E7A5C]" />
      ) : (
        <Sun size={20} className="text-[#3E7A5C]" />
      );

    case 'SCAN_WITH_ATTRIBUTE':
      return <Sparkles size={20} className="text-[#3E7A5C]" />;

    default:
      return <Check size={20} className="text-[#3E7A5C]" />;
  }
}

function MissionCard({
  mission,
  isWeekly = false,
  isConfirmed,
  onConfirm,
}: {
  mission: Mission;
  isWeekly?: boolean;
  isConfirmed: boolean;
  onConfirm: () => void;
}) {
  const percent =
    mission.targetCount > 0
      ? Math.min(
          100,
          Math.round((mission.progress / mission.targetCount) * 100)
        )
      : 0;

  const displayDescription =
    mission.conditionType === 'SCAN_WITH_ATTRIBUTE' && mission.description
      ? mission.description.replace(
          '이번 주의 지정 몬스터는 ',
          '이번 주의 지정 몬스터는\n'
        )
      : mission.description;

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm flex flex-col justify-between shrink-0 transition-all ${
        isWeekly ? 'p-5 min-h-[170px]' : 'p-3.5 min-h-[125px]'
      }`}
    >
      <div>
        <div
          className={`flex items-start gap-2.5 mb-2.5 ${
            isWeekly ? 'flex-col' : ''
          }`}
        >
          {!isWeekly && (
            <div className="w-10 h-10 rounded-xl bg-[#EAF3EA] flex items-center justify-center shrink-0">
              <MissionIcon
                conditionType={mission.conditionType}
                code={mission.code}
              />
            </div>
          )}

          <div className="flex-1 min-w-0 w-full">
            <div className="flex items-start justify-between relative gap-2">
              <p
                className={`font-bold text-[#1B1B1B] ${
                  isWeekly ? 'text-base' : 'text-sm'
                }`}
              >
                {mission.title}
              </p>

              {mission.completed && (
                <span
                  className={`shrink-0 text-[10px] font-black text-white px-2 py-0.5 rounded-full ${
                    isConfirmed ? 'bg-[#8A9A8E]' : 'bg-[#1F4B3C]'
                  }`}
                >
                  {isConfirmed ? '완료' : '완료 가능'}
                </span>
              )}
            </div>

            {displayDescription && (
              <p
                className={`text-[#8A9A8E] leading-relaxed whitespace-pre-line ${
                  isWeekly ? 'text-xs mt-2' : 'text-xs mt-0.5'
                }`}
              >
                {displayDescription}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        <div
          className={`flex items-center gap-2 ${
            isWeekly ? 'mb-2' : 'mb-1'
          }`}
        >
          <div
            className={`flex-1 bg-[#EAF3EA] rounded-full overflow-hidden ${
              isWeekly ? 'h-3' : 'h-2'
            }`}
          >
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                mission.completed ? 'bg-[#1F4B3C]' : 'bg-[#3E7A5C]'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <span
            className={`font-bold shrink-0 ${
              mission.completed
                ? 'text-[#1F4B3C]'
                : 'text-[#8A9A8E]'
            } ${isWeekly ? 'text-sm' : 'text-[11px]'}`}
          >
            {mission.progress} / {mission.targetCount}
          </span>
        </div>

        {/*
          TODO:
          백엔드에서 '완료 가능'과 '실제 완료' 상태가 분리되면
          현재 프론트 UI 확인 상태를 실제 완료 처리 API와 연결한다.
        */}
        {mission.completed &&
          (isConfirmed ? (
            <div
              className={`w-full rounded-full bg-[#EAF3EA] text-[#3E7A5C] font-bold flex items-center justify-center gap-1.5 ${
                isWeekly ? 'py-2.5 text-sm' : 'py-1.5 text-xs mt-1.5'
              }`}
            >
              <Check size={isWeekly ? 16 : 14} />
              미션 완료
            </div>
          ) : (
            <button
              type="button"
              onClick={onConfirm}
              className={`w-full rounded-full bg-[#1F4B3C] text-white font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform cursor-pointer ${
                isWeekly ? 'py-2.5 text-sm' : 'py-1.5 text-xs mt-1.5'
              }`}
            >
              <Check size={isWeekly ? 16 : 14} />
              미션 완료 가능
            </button>
          ))}
      </div>
    </div>
  );
}

export default function MissionsPage() {
  const [tab, setTab] = useState<Tab>('daily');
  const [missions, setMissions] = useState<Mission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 현재는 프론트 UI에서만 완료 확인 여부를 관리한다.
  const [confirmedMissionIds, setConfirmedMissionIds] = useState<Set<string>>(
    new Set()
  );

  const loadMissions = useCallback(async () => {
    setLoading(true);
    setError(null); // 재시도 및 성공 경로를 위해 초기화

    try {
      const res = await fetch('/api/missions');
      const body = await res.json().catch(() => null);

      // ERROR 모듈 대신 문자열 'OK' 직접 비교
      if (!res.ok || body?.code !== 'OK') {
        // 세션 만료 등 서버가 전달한 메시지가 있으면 UI에 최우선 노출
        const serverMessage = body?.message;
        if (serverMessage) {
          setError(serverMessage);
          return;
        }
        setError('미션을 불러오지 못했습니다.');
        return;
      }

      const list = body.data?.missions;

      if (!Array.isArray(list)) {
        setError('올바르지 않은 데이터 형식입니다.');
        return;
      }

      setMissions(list);
    } catch (err) {
      console.error('[/api/missions] unexpected error:', err);
      // "Failed to fetch" 등 영문 원문 노출 방지를 위한 마스킹
      setError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMissions();
  }, [loadMissions]);

  // 각 탭 안에서는 조건을 달성한 미션을 상단에 표시한다.
  // 완료 여부가 같은 미션끼리는 서버에서 받은 기존 순서를 유지한다.
  const filteredMissions = missions
    .filter((mission) =>
      tab === 'daily'
        ? mission.cycle === 'DAILY'
        : mission.cycle === 'WEEKLY'
    )
    .sort((a, b) => {
      if (a.completed === b.completed) return 0;

      return a.completed ? -1 : 1;
    });

  const handleConfirmMission = (missionId: string) => {
    setConfirmedMissionIds((prev) => {
      const next = new Set(prev);
      next.add(missionId);
      return next;
    });
  };

  return (
    <div
      className={`${notoSans.className} h-full w-full bg-[#EAF3EA] flex flex-col overflow-hidden`}
    >
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-6 pb-4 text-center">
        <h1 className="text-lg font-black text-[#1B1B1B]">
          미션
        </h1>

        <p className="text-xs text-[#8A9A8E] mt-1">
          일상 속 작은 습관을 기록해보세요
        </p>
      </div>

      {/* 탭 */}
      <div className="shrink-0 px-4 flex gap-1">
        {(
          [
            ['daily', '일일 미션'],
            ['weekly', '주간 미션'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 rounded-t-2xl text-sm font-bold transition-colors cursor-pointer ${
              tab === key
                ? 'bg-[#FDFCF8] text-[#1F4B3C]'
                : 'bg-[#DCE8DE] text-[#8A9A8E]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 본문 */}
      <div className="flex-1 min-h-0 bg-[#FDFCF8] mx-4 mb-4 rounded-b-2xl rounded-tr-2xl overflow-y-auto flex flex-col">
        <div className="p-4 flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between mb-3 shrink-0">
            <p className="text-xs tracking-widest text-[#B0BDB4] font-bold">
              {tab === 'daily' ? 'DAILY' : 'WEEKLY'}
            </p>

            <span className="text-[11px] text-[#B0BDB4]">
              {tab === 'daily'
                ? '매일 05:00 초기화'
                : '매주 월요일 05:00 초기화'}
            </span>
          </div>

          {tab === 'daily' && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-[#F2F5F2] flex items-center gap-2 text-xs text-[#3E7A5C] font-semibold">
              <Check size={15} />
              <span>오늘의 미션을 하나씩 완료해보세요.</span>
            </div>
          )}

          {tab === 'weekly' && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-[#F2F5F2] flex items-center gap-2 text-xs text-[#3E7A5C] font-semibold">
              <CalendarCheck size={15} />
              <span>일주일 동안 도전할 수 있는 미션입니다.</span>
            </div>
          )}

          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-2 py-16">
              <div className="w-6 h-6 border-2 border-[#1F4B3C] border-t-transparent rounded-full animate-spin" />

              <p className="text-xs text-[#8A9A8E]">
                미션을 불러오는 중...
              </p>
            </div>
          ) : error ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16">
              <p className="text-xs text-[#C0503D] text-center">
                {error}
              </p>

              <button
                type="button"
                onClick={() => void loadMissions()}
                className="px-4 py-2 bg-[#DCE8DE] text-[#1F4B3C] rounded-xl text-xs font-bold active:scale-95 transition-transform cursor-pointer"
              >
                다시 시도
              </button>
            </div>
          ) : filteredMissions.length === 0 ? (
            <div className="flex-1 flex items-center justify-center py-16">
              <p className="text-xs text-[#8A9A8E]">
                진행 중인 미션이 없어요.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredMissions.map((mission) => (
                <MissionCard
                  key={mission.missionId}
                  mission={mission}
                  isWeekly={tab === 'weekly'}
                  isConfirmed={confirmedMissionIds.has(mission.missionId)}
                  onConfirm={() => handleConfirmMission(mission.missionId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}