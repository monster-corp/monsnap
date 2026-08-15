'use client';

import { useState, useEffect } from 'react';
import { Camera, Ghost, ArrowRight } from 'lucide-react';
import Link from 'next/link';

type Monster = {
  id: string;
  name: string;
  rarity?: string;
  imageUrl?: string;
};

export default function HomePage() {
  const [nickname, setNickname] = useState<string>('새내기 탐험가');
  const [partnerMonster, setPartnerMonster] = useState<Monster | null>(null);
  const [remainingSlots, setRemainingSlots] = useState<number>(3);
  const [speechText, setSpeechText] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchLobbyData() {
      try {
        // 1. 유저 정보 조회
        try {
          const userRes = await fetch('/api/users/me');
          const userData = await userRes.json().catch(() => null);
          if (userData?.code === 20000 && userData.data?.nickname) {
            setNickname(userData.data.nickname);
          }
        } catch {}

        // 2. 알 슬롯 조회
        try {
          const eggRes = await fetch('/api/eggs');
          const eggData = await eggRes.json().catch(() => null);
          if (eggData?.code === 20000) {
            const currentEggsCount = eggData.data?.eggs?.length ?? 0;
            setRemainingSlots(Math.max(0, 3 - currentEggsCount));
          }
        } catch {}

        // 3. 보유 몬스터 조회 (유력 엔드포인트들 순차 시도)
        let monsterData: any = null;

        // 시도 1: /api/user-monsters
        const res1 = await fetch('/api/user-monsters').catch(() => null);
        if (res1?.ok) {
          monsterData = await res1.json().catch(() => null);
        }

        // 시도 2: /api/monsters (기존 경로)
        if (!monsterData || monsterData.code !== 20000) {
          const res2 = await fetch('/api/monsters').catch(() => null);
          if (res2?.ok) {
            monsterData = await res2.json().catch(() => null);
          }
        }

        console.log('📦 [홈 로비] 최종 받아온 보유 몬스터 응답:', monsterData);

        // 응답 배열 추출
        const list: any[] = 
          monsterData?.data?.userMonsters ?? 
          monsterData?.data?.monsters ?? 
          monsterData?.data?.items ??
          (Array.isArray(monsterData?.data) ? monsterData.data : []);

        console.log('🔍 [홈 로비] 추출된 몬스터 리스트:', list);

        if (Array.isArray(list) && list.length > 0) {
          const item = list[0];
          const mInfo = item.monster ? item.monster : item;
          
          let rawImg = 
            mInfo.imageUrl || 
            mInfo.image_url || 
            item.imageUrl || 
            item.image_url || 
            mInfo.cutoutImageUrl ||
            '';

          // 상대 경로 보정 (ex: "images/..." -> "/images/...")
          if (rawImg && !rawImg.startsWith('http') && !rawImg.startsWith('/')) {
            rawImg = `/${rawImg}`;
          }

          const parsedName = mInfo.name || item.name || '내 몬스터';

          console.log('🎯 [홈 로비] 최종 파트너 지정:', { name: parsedName, imageUrl: rawImg });

          setPartnerMonster({
            id: item.id || mInfo.id || '1',
            name: parsedName,
            imageUrl: rawImg,
            rarity: mInfo.rarity || item.rarity || 'COMMON',
          });
          setSpeechText('오늘도 함께 산책하며 새로운 친구를 찾아볼까요? ✨');
        } else {
          setPartnerMonster(null);
          setSpeechText('주변 사물을 찍어 첫 친구를 찾아볼까요? 🔍');
        }
      } catch (err) {
        console.error('로비 데이터 로드 에러:', err);
        setPartnerMonster(null);
        setSpeechText('주변 사물을 찍어 첫 친구를 찾아볼까요? 🔍');
      } finally {
        setLoading(false);
      }
    }

    fetchLobbyData();
  }, []);

  const handleTouchCenter = () => {
    if (partnerMonster) {
      const dialogues = [
        '주변 사물을 촬영하면 친구가 늘어나요! 🔍',
        '걸을수록 사진이 선명하게 인화돼요. 👟',
        '오늘 날씨가 산책하기 딱 좋네요! 🌿',
        '멋진 사물을 발견하면 언제든 알려주세요! 📸',
      ];
      setSpeechText(dialogues[Math.floor(Math.random() * dialogues.length)]);
    } else {
      const emptyDialogues = [
        '주변 사물을 찍어 첫 친구를 찾아볼까요? 🔍',
        '책상 위의 컵, 펜, 식물을 카메라에 담아보세요! ☕',
        '사물을 촬영하고 걸어서 알을 부화시켜보세요! 🥚',
      ];
      setSpeechText(emptyDialogues[Math.floor(Math.random() * emptyDialogues.length)]);
    }
  };

  return (
    <div className="flex-1 flex flex-col justify-between p-4 pb-20 bg-gradient-to-b from-[#F2F6F3] via-[#E8F0EA] to-[#DCE8DF] min-h-[calc(100svh-3.5rem)] relative overflow-hidden select-none">
      
      {/* ───────── 1. 상단 프로필 & 슬롯 바 ───────── */}
      <header className="flex items-center justify-between z-10 pt-1 shrink-0">
        <div className="flex items-center gap-2 bg-white/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/70 shadow-sm">
          <div className="w-6 h-6 rounded-full bg-[#1F4B3C] text-white flex items-center justify-center font-black text-[10px] shadow-sm">
            Lv.1
          </div>
          <span className="text-xs font-black text-[#1B1B1B]">{nickname}</span>
        </div>

        <div className="flex items-center gap-1.5 bg-white/85 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-white/70 shadow-sm">
          <Camera size={13} className="text-[#1F4B3C]" />
          <span className="text-xs font-bold text-[#1B1B1B]">스캔 슬롯</span>
          <span className="text-xs font-black text-[#1F4B3C]">{remainingSlots}/3</span>
        </div>
      </header>

      {/* ───────── 2. 중앙 메인 영역 ───────── */}
      <main className="flex-1 flex flex-col items-center justify-center my-auto relative w-full">
        
        {/* 말풍선 */}
        <div 
          onClick={handleTouchCenter}
          className="relative mb-6 bg-white/95 backdrop-blur-md px-4 py-2.5 rounded-2xl shadow-[0_6px_18px_rgba(0,0,0,0.06)] border border-white/90 max-w-[260px] text-center cursor-pointer active:scale-95 transition-all"
        >
          <p className="text-xs font-bold text-[#1B1B1B] leading-relaxed break-keep">
            {speechText}
          </p>
          <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[5px] border-l-transparent border-r-[5px] border-r-transparent border-t-[6px] border-t-white/95" />
        </div>

        {loading ? (
          <div className="w-48 h-48 flex items-center justify-center">
            <div className="w-7 h-7 border-2 border-[#1F4B3C] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : partnerMonster ? (
          /* [보유 몬스터 있을 때] - 폴라로이드 테두리 잘라낸 카드형 */
          <div
            onClick={handleTouchCenter}
            className="relative cursor-pointer flex flex-col items-center active:scale-95 transition-transform"
          >
            <div className="relative flex flex-col items-center">
              <div className="w-52 h-52 rounded-3xl bg-white p-2.5 shadow-[0_16px_32px_rgba(31,75,60,0.12)] border border-white/80 animate-floating">
                <div className="w-full h-full rounded-2xl overflow-hidden bg-[#E6ECE8] relative shadow-inner flex items-center justify-center">
                  {partnerMonster.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={partnerMonster.imageUrl}
                      alt={partnerMonster.name}
                      className="w-full h-full object-cover scale-[1.18]"
                    />
                  ) : (
                    <Ghost size={52} className="text-[#3E7A5C] animate-pulse" />
                  )}
                </div>
              </div>

              <div className="w-40 h-6 bg-[#1F4B3C]/10 rounded-full blur-md mt-3" />
            </div>

            <div className="mt-2 flex items-center gap-1.5 bg-white/90 backdrop-blur-md px-4 py-1.5 rounded-full border border-white shadow-sm">
              <span className="w-2 h-2 rounded-full bg-[#3E7A5C] animate-pulse" />
              <span className="text-xs font-black text-[#1B1B1B]">{partnerMonster.name}</span>
            </div>
          </div>
        ) : (
          /* [보유 몬스터 0마리일 때] */
          <div
            onClick={handleTouchCenter}
            className="w-64 bg-white/80 backdrop-blur-md border border-white/90 rounded-3xl p-6 flex flex-col items-center text-center shadow-[0_8px_24px_rgba(0,0,0,0.04)] cursor-pointer active:scale-95 transition-all"
          >
            <div className="relative w-28 h-28 flex items-center justify-center mb-4">
              <div className="absolute inset-0 bg-[#3E7A5C]/10 rounded-full animate-ping opacity-25" />
              <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-[#1F4B3C] to-[#3E7A5C] flex flex-col items-center justify-center text-white shadow-md">
                <Ghost size={38} strokeWidth={1.8} className="animate-bounce" />
                <span className="text-[9px] font-black tracking-widest mt-1 opacity-90">START</span>
              </div>
            </div>

            <p className="text-xs font-bold text-[#4D6353] leading-relaxed">
              주변 사물을 카메라로 비추면<br />
              <span className="text-[#1F4B3C] font-black">나만의 첫 몬스터</span>가 탄생해요!
            </p>
          </div>
        )}
      </main>

      {/* ───────── 3. 하단 퀵 액션 버튼 ───────── */}
      <footer className="z-10 shrink-0 px-2">
        <Link
          href="/scans"
          className="w-full py-3.5 rounded-xl bg-[#1F4B3C] text-white font-bold text-xs sm:text-sm shadow-[0_4px_14px_rgba(31,75,60,0.2)] flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Camera size={16} />
          <span>{partnerMonster ? '새로운 사물 촬영하기' : '첫 몬스터 찾으러 가기'}</span>
          <ArrowRight size={14} />
        </Link>
      </footer>

      {/* 플로팅 모션 */}
      <style jsx>{`
        @keyframes floating {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-6px); }
        }
        .animate-floating {
          animation: floating 3.2s ease-in-out infinite;
        }
      `}</style>

    </div>
  );
}

