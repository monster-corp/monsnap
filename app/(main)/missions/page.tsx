'use client';

import { useState } from 'react';
import { Check, Sun, Moon, CalendarCheck, Camera, Footprints } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

type Tab = 'daily' | 'weekly';

type Mission = {
  id: string;
  code: string;
  iconType: 'sun' | 'moon' | 'camera' | 'footprints';
  title: string;
  description?: string;
  current: number;
  target: number;
  completed: boolean;
  claimed: boolean;
};

// 일일 미션 목록 (모든 미션에 설명 문구 포함)
const DAILY_MISSIONS: Mission[] = [
  {
    id: 'daily-morning',
    code: 'DAILY_MORNING_MONSTER',
    iconType: 'sun',
    title: '모닝 리프레시 스캔',
    description: '오전 06:00 ~ 10:00 사이 몬스터 1마리 획득',
    current: 0,
    target: 1,
    completed: false,
    claimed: false,
  },
  {
    id: 'daily-night',
    code: 'DAILY_NIGHT_MONSTER',
    iconType: 'moon',
    title: '나이트 케어 스캔',
    description: '저녁 20:00 ~ 24:00 사이 몬스터 1마리 획득',
    current: 0,
    target: 1,
    completed: false,
    claimed: false,
  },
  {
    id: 'daily-scan-3',
    code: 'DAILY_SCAN_3',
    iconType: 'camera',
    title: '오늘 3번 스캔하기',
    description: '사물을 스캔하여 새로운 몬스터를 탐색',
    current: 0,
    target: 3,
    completed: false,
    claimed: false,
  },
  {
    id: 'daily-walk-start-2',
    code: 'DAILY_WALK_START_2',
    iconType: 'footprints',
    title: '걷기 2번 시작하기',
    description: '알을 부화시키기 위한 걷기 세션을 시작',
    current: 0,
    target: 2,
    completed: false,
    claimed: false,
  },
];

// 주간 미션
const WEEKLY_MISSIONS: Mission[] = [
  {
    id: 'weekly-streak',
    code: 'WEEKLY_STREAK',
    iconType: 'sun',
    title: '3일 연속 기록',
    description: '일일 미션을 하루 한 개 이상,\n3일 연속 완료해 주세요',
    current: 0,
    target: 3,
    completed: false,
    claimed: false,
  },
];

function MissionCard({ mission, isWeekly = false }: { mission: Mission; isWeekly?: boolean }) {
  const percent = Math.min(100, Math.round((mission.current / mission.target) * 100));
  const isComplete = mission.completed || mission.current >= mission.target;

  const renderIcon = () => {
    switch (mission.iconType) {
      case 'sun':
        return <Sun size={20} className="text-[#3E7A5C]" />;
      case 'moon':
        return <Moon size={20} className="text-[#3E7A5C]" />;
      case 'camera':
        return <Camera size={20} className="text-[#3E7A5C]" />;
      case 'footprints':
        return <Footprints size={20} className="text-[#3E7A5C]" />;
      default:
        return null;
    }
  };

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm flex flex-col justify-between shrink-0 transition-all ${
        isWeekly ? 'p-6 min-h-[200px]' : 'p-3.5 min-h-[125px]'
      }`}
    >
      <div>
        <div className={`flex items-start gap-2.5 mb-2.5 ${isWeekly ? 'justify-center text-center flex-col' : ''}`}>
          {!isWeekly && (
            <div className="w-10 h-10 rounded-xl bg-[#EAF3EA] flex items-center justify-center shrink-0">
              {renderIcon()}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <div className={`flex items-center ${isWeekly ? 'justify-center relative' : 'justify-between'}`}>
              <p
                className={`font-bold text-[#1B1B1B] ${
                  isWeekly ? 'text-xl text-center' : 'text-sm'
                }`}
              >
                {mission.title}
              </p>
              {isComplete && !mission.claimed && (
                <span
                  className={`shrink-0 text-[10px] font-black text-white bg-[#C84B31] px-2 py-0.5 rounded-full ${
                    isWeekly ? 'absolute right-0 top-0' : 'ml-1.5'
                  }`}
                >
                  달성
                </span>
              )}
            </div>

            {/* 미션 설명 문구 */}
            {mission.description && (
              <p
                className={`text-[#8A9A8E] leading-relaxed whitespace-pre-line ${
                  isWeekly ? 'text-sm mt-3 text-center' : 'text-xs mt-0.5'
                }`}
              >
                {mission.description}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mt-2">
        {/* 진행률 바 */}
        <div className={`flex items-center gap-2 ${isWeekly ? 'mb-4' : 'mb-1'}`}>
          <div
            className={`flex-1 bg-[#EAF3EA] rounded-full overflow-hidden ${
              isWeekly ? 'h-3' : 'h-2'
            }`}
          >
            <div
              className="h-full bg-[#1F4B3C] rounded-full transition-all duration-300"
              style={{ width: `${percent}%` }}
            />
          </div>
          <span
            className={`font-bold text-[#8A9A8E] shrink-0 ${
              isWeekly ? 'text-sm' : 'text-[11px]'
            }`}
          >
            {mission.current} / {mission.target}
          </span>
        </div>

        {/* 보상 버튼 상태 */}
        {mission.claimed ? (
          <button
            disabled
            className={`w-full rounded-full bg-[#EAF3EA] text-[#8A9A8E] font-bold flex items-center justify-center gap-1.5 ${
              isWeekly ? 'py-3 text-sm' : 'py-1.5 text-xs mt-1.5'
            }`}
          >
            <Check size={isWeekly ? 16 : 14} />
            보상 받음
          </button>
        ) : isComplete ? (
          <button
            className={`w-full rounded-full bg-[#1F4B3C] text-white font-bold active:scale-95 transition-transform ${
              isWeekly ? 'py-3 text-sm' : 'py-1.5 text-xs mt-1.5'
            }`}
          >
            보상 받기
          </button>
        ) : null}
      </div>
    </div>
  );
}

export default function MissionsPage() {
  const [tab, setTab] = useState<Tab>('daily');

  const missions = tab === 'daily' ? DAILY_MISSIONS : WEEKLY_MISSIONS;

  return (
    <div className={`${notoSans.className} h-[100svh] bg-[#EAF3EA] flex flex-col overflow-hidden`}>
      {/* 헤더 */}
      <div className="shrink-0 px-4 pt-6 pb-4 text-center">
        <h1 className="text-lg font-black text-[#1B1B1B]">미션</h1>
        <p className="text-xs text-[#8A9A8E] mt-1">일상 속 작은 습관을 기록해보세요</p>
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
            onClick={() => setTab(key)}
            className={`px-5 py-2.5 rounded-t-2xl text-sm font-bold transition-colors ${
              tab === key ? 'bg-[#FDFCF8] text-[#1F4B3C]' : 'bg-[#DCE8DE] text-[#8A9A8E]'
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
              {tab === 'daily' ? '매일 05:00 초기화' : '매주 월요일 05:00 초기화'}
            </span>
          </div>

          {/* 일일 탭 상단 웰니스 안내 배너 */}
          {tab === 'daily' && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-[#F2F5F2] flex items-center gap-2 text-xs text-[#3E7A5C] font-semibold">
              <Sun size={15} />
              <span>생체 주기에 맞춘 데일리 웰니스 루틴 미션입니다.</span>
            </div>
          )}

          {/* 주간 탭 안내 배너 */}
          {tab === 'weekly' && (
            <div className="mb-3 px-3 py-2 rounded-xl bg-[#F2F5F2] flex items-center gap-2 text-xs text-[#3E7A5C] font-semibold">
              <CalendarCheck size={15} />
              <span>일주일간 도전할 수 있는 장기 미션입니다.</span>
            </div>
          )}

          {/* 미션 카드 목록 */}
          <div className="flex flex-col gap-3">
            {missions.map((mission) => (
              <MissionCard
                key={mission.id}
                mission={mission}
                isWeekly={tab === 'weekly'}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}