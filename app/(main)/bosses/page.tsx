'use client';

import React, { useState, useEffect, useMemo } from 'react';

interface Monster {
  id: string;
  dexId: number; 
  name: string;
  rarity?: string; 
  hp?: number;
  baseHp?: number;
  attack?: number;
  baseAttack?: number;
  level?: number;
  imageUrl: string;
}

interface DamageEffect {
  id: number;
  damage: number;
  x: number;
  y: number;
}

export default function BossPage() {
  // -------------------------------------------------------------
  // [상태 관리]
  // -------------------------------------------------------------
  const [myMonsters, setMyMonsters] = useState<Monster[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [selectedMonster, setSelectedMonster] = useState<Monster | null>(null);
  const [isSelectModalOpen, setIsSelectModalOpen] = useState(false);

  // 보스 체력 설정 (파리지옥: 2000)
  const maxHp = 2000; 
  const [currentHp, setCurrentHp] = useState<number>(2000);

  // 1:1 전투 및 연출 상태
  const [isBattleStarted, setIsBattleStarted] = useState(false);
  const [showBattleFlash, setShowBattleFlash] = useState(false);

  const [isHit, setIsHit] = useState(false);
  const [damageList, setDamageList] = useState<DamageEffect[]>([]);
  const [showRewardModal, setShowRewardModal] = useState(false);

  // -------------------------------------------------------------
  // [헬퍼 함수] HP / ATK 값 안전하게 추출
  // -------------------------------------------------------------
  const getMonsterHp = (m: Monster | null): number => {
    if (!m) return 100;
    return m.hp ?? m.baseHp ?? 100;
  };

  const getMonsterAttack = (m: Monster | null): number => {
    if (!m) return 50;
    return m.attack ?? m.baseAttack ?? 50;
  };

  // -------------------------------------------------------------
  // [API 연동 및 데이터 세팅]
  // -------------------------------------------------------------
  useEffect(() => {
    const fetchMyMonsters = async () => {
      try {
        setIsLoading(true);
        const res = await fetch('/api/user-monsters?sort=dexId&order=asc');
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.monsters || [];
          setMyMonsters(list);
        } else {
          setMyMonsters([
            { id: '1', dexId: 2, name: '먼지돌이', rarity: 'COMMON', hp: 50, attack: 140, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/먼지돌이.png' },
            { id: '2', dexId: 27, name: '메탈리퍼', rarity: 'EPIC', hp: 280, attack: 350, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/메탈리퍼.png' },
          ]);
        }
      } catch (error) {
        console.error('몬스터 불러오기 실패:', error);
        setMyMonsters([
          { id: '1', dexId: 2, name: '먼지돌이', rarity: 'COMMON', hp: 50, attack: 140, imageUrl: 'https://2xxbahx4rrugreh6.public.blob.vercel-storage.com/먼지돌이.png' },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchMyMonsters();
  }, []);

  const sortedMonsters = useMemo(() => {
    if (!myMonsters.length) return [];
    return [...myMonsters].sort((a, b) => getMonsterHp(b) - getMonsterHp(a));
  }, [myMonsters]);

  useEffect(() => {
    if (sortedMonsters.length > 0 && !selectedMonster) {
      setSelectedMonster(sortedMonsters[0]);
    }
  }, [sortedMonsters, selectedMonster]);

  // -------------------------------------------------------------
  // [이벤트 핸들러] 보스 클릭 시 연출과 함께 전투 개시
  // -------------------------------------------------------------
  const handleBossClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentHp <= 0 || !selectedMonster) return;

    if (!isBattleStarted) {
      setIsBattleStarted(true);
      setShowBattleFlash(true);
      setTimeout(() => setShowBattleFlash(false), 200);
    }

    const monsterAtk = getMonsterAttack(selectedMonster);
    const baseDamage = Math.floor(monsterAtk / 10); 
    const randomVariation = Math.floor(Math.random() * 10) - 5;
    const finalDamage = Math.max(1, baseDamage + randomVariation);

    setCurrentHp((prevHp) => {
      const validPrev = typeof prevHp === 'number' && !isNaN(prevHp) ? prevHp : maxHp;
      const nextHp = Math.max(0, validPrev - finalDamage);
      if (nextHp === 0) {
        setTimeout(() => setShowRewardModal(true), 500);
      }
      return nextHp;
    });

    setIsHit(true);
    setTimeout(() => setIsHit(false), 200);

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const newDamage: DamageEffect = {
      id: Date.now() + Math.random(),
      damage: finalDamage,
      x,
      y,
    };

    setDamageList((prev) => [...prev, newDamage]);
    setTimeout(() => {
      setDamageList((prev) => prev.filter((d) => d.id !== newDamage.id));
    }, 800);
  };

  const handleOpenSelectModal = () => {
    if (isBattleStarted) return; 
    setIsSelectModalOpen(true);
  };

  const safeCurrentHp = typeof currentHp === 'number' && !isNaN(currentHp) ? currentHp : maxHp;
  const hpPercentage = Math.max(0, (safeCurrentHp / maxHp) * 100);

  if (isLoading) {
    return (
      <div className="w-full h-screen bg-black flex items-center justify-center text-white p-6">
        <p className="text-sm font-bold animate-pulse">몬스터 데이터를 불러오는 중...</p>
      </div>
    );
  }

  return (
    <div className="relative w-full h-screen overflow-hidden bg-black flex flex-col justify-between items-center select-none p-6">
      {/* 전투 개시 섬광 효과 */}
      {showBattleFlash && (
        <div className="absolute inset-0 bg-red-600/30 z-40 pointer-events-none animate-pulse" />
      )}

      {/* 🌲 1. 배경화면 */}
      <div
        className="absolute inset-0 bg-cover bg-center opacity-80"
        style={{ backgroundImage: `url('/images/boss-bg.jpg')` }}
      />

      {/* 🛡️ 2. 상단 보스 정보 및 파리지옥 타이틀 아래 설명 문구 배치 */}
      <div className="relative z-10 w-full max-w-md flex flex-col items-center pt-4 min-h-[85px]">
        {isBattleStarted ? (
          <div className="w-full flex flex-col items-center animate-hp-slide-down">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="px-2 py-0.5 text-xs font-black bg-red-600 text-white rounded-sm shadow-[0_0_10px_rgba(220,38,38,0.8)]">
                BOSS
              </span>
              <h1 className="text-xl font-black text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">
                파리지옥
              </h1>
            </div>

            {/* 네모난 각진 스타일의 HP 바 (rounded-sm 적용) */}
            <div className="w-full bg-gray-950/80 border-2 border-red-900/60 rounded-sm h-6 p-0.5 relative shadow-[0_0_15px_rgba(0,0,0,0.8)] overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-600 via-orange-500 to-yellow-400 rounded-xs transition-all duration-300 ease-out shadow-inner"
                style={{ width: `${hpPercentage}%` }}
              />
              <span className="absolute inset-0 flex items-center justify-center text-xs font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,0.9)]">
                {safeCurrentHp} / {maxHp}
              </span>
            </div>
          </div>
        ) : (
          /* 전투 시작 전: 파리지옥 문구 바로 밑에 보스 설명 배치 */
          <div className="flex flex-col items-center mt-1">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-xs font-bold bg-red-600 text-white rounded-sm">BOSS</span>
              <h1 className="text-xl font-black text-white drop-shadow-md">파리지옥</h1>
            </div>
            {/* 💡 파리지옥 문구 바로 밑 설명 텍스트 */}
            <p className="text-xs font-bold text-amber-300/90 tracking-tight drop-shadow animate-pulse">
              보스를 터치하여 전투를 시작하세요!
            </p>
          </div>
        )}
      </div>

      {/* 👾 3. 중앙 보스 캐릭터 */}
      <div className="relative z-10 my-auto flex flex-col justify-center items-center">
        <div
          onClick={handleBossClick}
          className={`relative cursor-pointer transition-transform active:scale-95 ${
            isHit ? 'animate-boss-hit' : 'animate-boss-idle'
          }`}
        >
          <img
            src="/images/boss.png"
            alt="Boss"
            className={`w-64 h-64 object-contain pointer-events-none transition-all duration-100 ${
              isHit ? 'brightness-150 drop-shadow-[0_0_25px_rgba(239,68,68,0.9)]' : 'drop-shadow-2xl'
            }`}
          />

          {damageList.map((item) => (
            <div
              key={item.id}
              className="absolute pointer-events-none text-3xl font-black text-yellow-300 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] animate-damage-float"
              style={{ left: `${item.x}px`, top: `${item.y - 20}px` }}
            >
              -{item.damage}
            </div>
          ))}
        </div>
      </div>

      {/* 🐾 4. 하단 출전 대표 몬스터 카드 (💡 각진 네모난 테두리: rounded-lg 적용) */}
      <div className="relative z-10 w-full max-w-md pb-6 flex justify-center">
        {selectedMonster ? (
          <div
            onClick={handleOpenSelectModal}
            className={`bg-gray-900/85 backdrop-blur-md rounded-lg px-4 py-3 shadow-2xl border flex items-center justify-between transition-all w-full ${
              isBattleStarted 
                ? 'border-gray-800 cursor-default opacity-90' 
                : 'border-gray-700 cursor-pointer active:scale-98 hover:border-emerald-500/60'
            }`}
          >
            <div className="flex items-center gap-4 flex-1">
              {/* 💡 각진 네모난 썸네일 프레임 (rounded-md) */}
              <div className="w-18 h-18 rounded-md bg-gray-950/80 border border-gray-700 flex items-center justify-center p-1.5 overflow-hidden shadow-inner shrink-0">
                <img
                  src={selectedMonster.imageUrl}
                  alt={selectedMonster.name}
                  className="w-full h-full object-contain transform scale-110"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src =
                      'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png';
                  }}
                />
              </div>

              <div className="flex-1 flex flex-col justify-center">
                <div className="flex items-baseline gap-1">
                  <span className="text-[11px] font-bold text-gray-400">HP</span>
                  <span className="text-lg font-black text-amber-400 drop-shadow-sm">
                    {getMonsterHp(selectedMonster)}
                  </span>
                </div>
                <p className="text-sm font-bold text-gray-100 truncate">{selectedMonster.name}</p>
              </div>
            </div>

            {/* 네모난 모서리의 교체/상태 버튼 (rounded-md) */}
            {isBattleStarted ? (
              <div className="text-xs font-bold text-gray-500 bg-gray-950/60 border border-gray-800 px-3.5 py-2 rounded-md flex items-center gap-1 shrink-0 ml-3">
                <span>전투 중</span>
              </div>
            ) : (
              <div className="text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-700/80 px-3.5 py-2 rounded-md flex items-center gap-1 shrink-0 ml-3 shadow-lg active:scale-95 transition-transform">
                <span>교체</span>
                <span>▲</span>
              </div>
            )}
          </div>
        ) : (
          <div
            onClick={handleOpenSelectModal}
            className="bg-gray-900/85 backdrop-blur-md rounded-lg p-6 border border-gray-700 flex flex-col items-center justify-center cursor-pointer w-full hover:border-emerald-500/50 transition-colors"
          >
            <p className="text-sm font-bold text-gray-400">출전할 몬스터를 선택하세요</p>
            <p className="text-[11px] text-gray-600 mt-1">터치 ▲</p>
          </div>
        )}
      </div>

      {/* 📜 5. 보유 몬스터 모달 (네모난 스타일로 모서리 통일) */}
      {isSelectModalOpen && !isBattleStarted && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm animate-fade-in p-6">
          <div className="flex-1" onClick={() => setIsSelectModalOpen(false)} />

          <div className="w-full max-w-md mx-auto bg-gray-900/95 backdrop-blur-lg rounded-t-xl p-6 shadow-2xl animate-slide-up flex flex-col max-h-[75vh] border-t border-gray-700">
            <div className="w-12 h-1 bg-gray-700 rounded-sm mx-auto mb-4 shrink-0" />

            <div className="flex justify-between items-center mb-5 shrink-0 px-1">
              <div>
                <h3 className="text-lg font-black text-white">출전 몬스터 선택</h3>
                <p className="text-xs text-gray-400">전투에 참여할 몬스터를 고르세요.</p>
              </div>
              <button
                onClick={() => setIsSelectModalOpen(false)}
                className="text-gray-500 hover:text-white font-bold text-lg p-1"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto grid grid-cols-3 gap-3 p-1">
              {sortedMonsters.map((monster) => {
                const isSelected = monster.id === selectedMonster?.id;
                const mHp = getMonsterHp(monster);
                return (
                  <div
                    key={monster.id}
                    onClick={() => {
                      setSelectedMonster(monster);
                      setIsSelectModalOpen(false);
                    }}
                    className={`flex flex-col items-center justify-between p-3 rounded-lg border transition-all cursor-pointer relative aspect-[1/1.1] ${
                      isSelected
                        ? 'border-emerald-500 bg-emerald-950/70 shadow-md ring-1 ring-emerald-500/40'
                        : 'border-gray-800 hover:border-gray-700 bg-gray-950/60'
                    }`}
                  >
                    {isSelected && (
                      <span className="absolute top-2 right-2 w-2 h-2 bg-emerald-500 rounded-sm" />
                    )}

                    <div className="text-center mb-1 flex items-baseline gap-0.5 justify-center">
                      <span className="text-[10px] text-gray-400 font-bold">HP </span>
                      <span className="text-xs font-black text-amber-400">{mHp}</span>
                    </div>

                    <div className="w-16 h-16 bg-black/50 rounded-md border border-gray-800 p-1 flex items-center justify-center shadow-inner my-1">
                      <img
                        src={monster.imageUrl}
                        alt={monster.name}
                        className="w-full h-full object-contain transform scale-105"
                        onError={(e) => {
                          (e.currentTarget as HTMLImageElement).src =
                            'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/25.png';
                        }}
                      />
                    </div>

                    <p className="text-xs font-bold text-gray-200 truncate w-full text-center mt-1 px-1">
                      {monster.name}
                    </p>
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setIsSelectModalOpen(false)}
              className="mt-6 w-full py-3.5 bg-emerald-700 hover:bg-emerald-600 text-white font-extrabold text-sm rounded-md shadow-lg active:scale-95 transition-transform shrink-0"
            >
              선택 완료
            </button>
          </div>
        </div>
      )}

      {/* 🏆 6. 승리 보상 팝업 */}
      {showRewardModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in p-6">
          <div className="w-full max-w-sm bg-gray-950 border-2 border-yellow-500/50 rounded-xl p-6 text-center shadow-2xl flex flex-col items-center">
            <div className="text-5xl mb-3">🏆</div>
            <h2 className="text-2xl font-black text-yellow-400 mb-1">VICTORY!</h2>
            <p className="text-gray-300 text-sm mb-6">보스를 퇴치하고 보상을 획득했습니다!</p>

            <div className="w-full bg-gray-900 border border-gray-800 rounded-lg p-4 mb-6 flex justify-around items-center">
              <div className="flex flex-col items-center">
                <span className="text-2xl mb-1">📸</span>
                <span className="text-xs text-gray-400 font-bold">인화권 +1</span>
              </div>
              <div className="flex flex-col items-center">
                <span className="text-2xl mb-1">⚡</span>
                <span className="text-xs text-gray-400 font-bold">스캔 충전 +1</span>
              </div>
            </div>

            <button
              onClick={() => {
                setShowRewardModal(false);
                setCurrentHp(maxHp);
                setIsBattleStarted(false); 
              }}
              className="w-full py-3.5 rounded-md bg-gradient-to-r from-yellow-500 to-amber-600 text-black font-extrabold text-sm shadow-lg active:scale-95 transition-transform"
            >
              보상 수령하기
            </button>
          </div>
        </div>
      )}

      {/* 🎨 7. 애니메이션 CSS */}
      <style jsx>{`
        @keyframes hpSlideDown {
          0% { transform: translateY(-30px) scale(0.95); opacity: 0; }
          70% { transform: translateY(4px) scale(1.01); opacity: 1; }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }

        @keyframes bossIdle {
          0% { transform: scale(1); brightness: 1; }
          50% { transform: scale(1.03); brightness: 1.05; }
          100% { transform: scale(1); brightness: 1; }
        }

        @keyframes bossHit {
          0% { transform: scale(0.95) translate(0, 0); brightness(1); }
          25% { transform: scale(1.03) translate(-6px, 4px) brightness(1.3); }
          50% { transform: scale(0.97) translate(6px, -4px) brightness(0.8); }
          75% { transform: scale(1.02) translate(-4px, -2px) brightness(1.1); }
          100% { transform: scale(1) translate(0, 0) brightness(1); }
        }

        @keyframes damageFloat {
          0% { opacity: 1; transform: translateY(0) scale(1); }
          50% { opacity: 1; transform: translateY(-30px) scale(1.2); }
          100% { opacity: 0; transform: translateY(-55px) scale(0.8); }
        }

        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }

        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .animate-hp-slide-down { animation: hpSlideDown 0.35s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards; }
        .animate-boss-idle { animation: bossIdle 3s ease-in-out infinite; }
        .animate-boss-hit { animation: bossHit 0.2s ease-in-out; }
        .animate-damage-float { animation: damageFloat 0.8s ease-out forwards; }
        .animate-slide-up { animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .animate-fade-in { animation: fadeIn 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
}