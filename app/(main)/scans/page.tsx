'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Camera, Footprints } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

type Tab = 'capture' | 'developing';
type CaptureStep = 'idle' | 'scanning';

const MIN_DEVELOP_MS = 2600;
const CODE_OK = 20000;
const CODE_EGG_SLOT_FULL = 40900;
const REQUEST_TIMEOUT_MS = 20000;
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.85;
const MAX_EGG_SLOTS = 3;
const MANUAL_STEP_SMALL = 5;
const MANUAL_STEP_LARGE = 20;
const SYNC_INTERVAL_MS = 5000;
const STEPS_STORAGE_PREFIX = 'monsnap:walk:';
const REVEAL_ANIMATION_MS = 2400;

type Egg = {
  eggId: string;
  status: string;
  currentSteps: number;
  requiredSteps: number;
  activeWalkSessionId: string | null;
  imageUrl: string;
};

type RevealedMonster = {
  id: string;
  name: string;
  rarity: string;
  material: string;
  shape: string;
  imageUrl: string;
};

const MATERIAL_LABEL: Record<string, string> = {
  NORMAL: '일반', FIRE: '불', WATER: '물', GRASS: '식물', METAL: '금속',
  CERAMIC: '도자기', GLASS: '유리', PLASTIC: '플라스틱', ELECTRIC: '전기',
};

const SHAPE_LABEL: Record<string, string> = {
  FREEFORM: '자유형', ROUND: '둥글', TRIANGLE: '세모', SQUARE: '네모', LONG: '길쭉',
};

const RARITY_STYLE: Record<string, string> = {
  COMMON: 'bg-[#8F9A92]',
  RARE: 'bg-[#5B7B9C]',
  EPIC: 'bg-[#8A629E]',
};

function MonsterSilhouette({
  className = '',
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg viewBox="0 0 100 100" className={className} style={style} aria-hidden="true">
      <path d="M28 38 Q26 14 36 20 Q40 26 41 34 Z" fill="currentColor" />
      <path d="M72 38 Q74 14 64 20 Q60 26 59 34 Z" fill="currentColor" />
      <path
        d="M50 26 Q76 26 78 52 Q79 70 74 82 Q72 88 64 88 L36 88 Q28 88 26 82 Q21 70 22 52 Q24 26 50 26 Z"
        fill="currentColor"
      />
    </svg>
  );
}

async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));

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

export default function ScansPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('capture');

  const [captureStep, setCaptureStep] = useState<CaptureStep>('idle');
  const [isScanDone, setIsScanDone] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isSlotFull, setIsSlotFull] = useState(false);
  const [newEggSteps, setNewEggSteps] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [eggs, setEggs] = useState<Egg[]>([]);
  const [selectedEggId, setSelectedEggId] = useState<string | null>(null);
  const [eggsLoading, setEggsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [eggError, setEggError] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedMonster, setRevealedMonster] = useState<RevealedMonster | null>(null);
  const [isNewMonster, setIsNewMonster] = useState(false);

  const localStepsRef = useRef(0);
  const lastSentRef = useRef(0);
  const [sessionSteps, setSessionSteps] = useState(0);

  const currentEgg = eggs.find((e) => e.eggId === selectedEggId) ?? null;
  const isWalking = currentEgg?.activeWalkSessionId != null;
  const isReadyToReveal = currentEgg?.status === 'READY';
  const activeSessionId = currentEgg?.activeWalkSessionId ?? null;

  const loadEggs = useCallback(async () => {
    try {
      const res = await fetch('/api/eggs');
      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== CODE_OK) {
        setEggError(body?.message ?? '인화 대기 목록을 불러오지 못했어요.');
        return;
      }

      const list: Egg[] = body.data?.eggs ?? [];
      setEggs(list);
      setEggError(null);

      setSelectedEggId((prev) =>
        prev && list.some((e) => e.eggId === prev) ? prev : list[0]?.eggId ?? null
      );
    } catch {
      setEggError('네트워크 오류가 발생했어요.');
    } finally {
      setEggsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEggs();
  }, [loadEggs]);

  useEffect(() => {
    if (!activeSessionId) {
      localStepsRef.current = 0;
      lastSentRef.current = 0;
      setSessionSteps(0);
      return;
    }

    const saved = Number(localStorage.getItem(STEPS_STORAGE_PREFIX + activeSessionId) ?? 0);
    localStepsRef.current = Number.isFinite(saved) ? saved : 0;
    lastSentRef.current = 0;
    setSessionSteps(localStepsRef.current);
  }, [activeSessionId]);

  const syncSteps = useCallback(async () => {
    if (!currentEgg?.activeWalkSessionId) return;

    const steps = localStepsRef.current;
    if (steps <= lastSentRef.current) return;

    try {
      const res = await fetch(
        `/api/eggs/${currentEgg.eggId}/walk-sessions/${currentEgg.activeWalkSessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepsCaptured: steps }),
        }
      );
      const body = await res.json().catch(() => null);
      if (!res.ok || body?.code !== CODE_OK) return;

      lastSentRef.current = steps;

      const egg = body.data?.egg;
      if (egg) {
        setEggs((prev) =>
          prev.map((e) =>
            e.eggId === egg.id ? { ...e, currentSteps: egg.currentSteps, status: egg.status } : e
          )
        );
      }
    } catch {}
  }, [currentEgg]);

  const addSteps = useCallback((amount: number) => {
    if (amount <= 0 || !currentEgg?.activeWalkSessionId) return;

    localStepsRef.current += amount;
    setSessionSteps(localStepsRef.current);
    localStorage.setItem(
      STEPS_STORAGE_PREFIX + currentEgg.activeWalkSessionId,
      String(localStepsRef.current)
    );

    const nextSteps = Math.min(currentEgg.requiredSteps, currentEgg.currentSteps + amount);
    setEggs((prev) =>
      prev.map((e) => (e.eggId === currentEgg.eggId ? { ...e, currentSteps: nextSteps } : e))
    );

    if (nextSteps >= currentEgg.requiredSteps) {
      void syncSteps();
    }
  }, [currentEgg, syncSteps]);

  useEffect(() => {
    if (!isWalking) return;
    const timer = setInterval(syncSteps, SYNC_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isWalking, syncSteps]);

  useEffect(() => {
    if (!isWalking) return;

    const handleVisibilityChange = () => {
      if (document.hidden) void syncSteps();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isWalking, syncSteps]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    e.target.value = '';

    setScanError(null);
    setIsSlotFull(false);
    setIsScanDone(false);
    setNewEggSteps(null);
    setCaptureStep('scanning');

    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const uploadFile = await resizeImage(file);
      const formData = new FormData();
      formData.append('image', uploadFile);

      const res = await fetch('/api/scans', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      const body = await res.json().catch(() => null);

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_DEVELOP_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_DEVELOP_MS - elapsed));
      }

      if (!res.ok || body?.code !== CODE_OK) {
        setIsSlotFull(body?.code === CODE_EGG_SLOT_FULL);
        setScanError(body?.message ?? '스캔에 실패했어요. 다시 시도해주세요.');
        setCaptureStep('idle');
        return;
      }

      setNewEggSteps(body.data?.requiredSteps ?? null);
      setIsScanDone(true);
      await loadEggs();
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      setScanError(
        aborted
          ? '분석이 오래 걸리고 있어요. 잠시 후 다시 시도해주세요.'
          : '네트워크 오류가 발생했어요. 다시 시도해주세요.'
      );
      setCaptureStep('idle');
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleStart = async () => {
    if (!currentEgg || busy) return;
    setBusy(true);
    setEggError(null);

    try {
      const res = await fetch(`/api/eggs/${currentEgg.eggId}/walk-sessions`, { method: 'POST' });
      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== CODE_OK) {
        setEggError(body?.message ?? '걷기를 시작하지 못했어요.');
        return;
      }

      localStepsRef.current = 0;
      lastSentRef.current = 0;
      setSessionSteps(0);
      await loadEggs();
    } catch {
      setEggError('네트워크 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (!currentEgg?.activeWalkSessionId || busy) return;
    setBusy(true);
    setEggError(null);

    const sessionId = currentEgg.activeWalkSessionId;
    await syncSteps();

    try {
      const res = await fetch(`/api/eggs/${currentEgg.eggId}/walk-sessions/${sessionId}/end`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== CODE_OK) {
        setEggError(body?.message ?? '걷기를 종료하지 못했어요.');
        return;
      }

      localStorage.removeItem(STEPS_STORAGE_PREFIX + sessionId);
      await loadEggs();
    } catch {
      setEggError('네트워크 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    if (!currentEgg || busy || isRevealing) return;
    setIsRevealing(true);
    setBusy(true);
    setEggError(null);

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([40, 60, 80, 60, 200]);
    }

    const sessionId = currentEgg.activeWalkSessionId;
    const startedAt = Date.now();

    try {
      const res = await fetch(`/api/eggs/${currentEgg.eggId}/hatch`, { method: 'POST' });
      const body = await res.json().catch(() => null);

      const elapsed = Date.now() - startedAt;
      if (elapsed < REVEAL_ANIMATION_MS) {
        await new Promise((r) => setTimeout(r, REVEAL_ANIMATION_MS - elapsed));
      }

      if (!res.ok || body?.code !== CODE_OK) {
        setEggError(body?.message ?? '인화에 실패했어요. 다시 시도해주세요.');
        setIsRevealing(false);
        return;
      }

      setRevealedMonster(body.data?.monster ?? null);
      setIsNewMonster(body.data?.isNewMonster ?? false);
      setIsRevealing(false);

      if (sessionId) localStorage.removeItem(STEPS_STORAGE_PREFIX + sessionId);
      localStepsRef.current = 0;
      lastSentRef.current = 0;
      setSessionSteps(0);

      await loadEggs();
    } catch {
      setEggError('네트워크 오류가 발생했어요.');
      setIsRevealing(false);
    } finally {
      setBusy(false);
    }
  };

  const progressPercent = currentEgg
    ? Math.min(100, Math.round((currentEgg.currentSteps / currentEgg.requiredSteps) * 100))
    : 0;

  const blurPx = Math.max(0, 16 - (progressPercent / 100) * 16);
  const grayscale = Math.max(0, 100 - progressPercent);
  const veilOpacity = Math.max(0, 0.5 - (progressPercent / 100) * 0.5);

  return (
    <div className={`${notoSans.className} min-h-screen flex items-center justify-center bg-[#EAF3EA] p-3`}>
      <div className="w-full max-w-sm flex flex-col h-[calc(100svh-1.5rem)] max-h-[800px]">

        {/* ───────── 탭 ───────── */}
        <div className="shrink-0 flex gap-1 mb-3">
          {(
            [
              ['capture', '촬영', Camera],
              ['developing', '인화 대기', Footprints],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex-1 py-2.5 rounded-2xl text-sm font-bold transition-colors flex items-center justify-center gap-1.5 ${
                tab === key ? 'bg-white text-[#1F4B3C]' : 'bg-white/40 text-[#8A9A8E]'
              }`}
            >
              <Icon size={15} />
              {label}
              {key === 'developing' && eggs.length > 0 && (
                <span className="text-[10px] bg-[#DCE8DE] text-[#3E7A5C] rounded-full px-1.5 py-0.5">
                  {eggs.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {tab === 'capture' ? (
          // ───────── 촬영 탭 ─────────
          <div className="flex-1 min-h-0 flex flex-col">
            {captureStep === 'idle' ? (
              <>
                <div className="flex flex-col items-center shrink-0 mb-3">
                  <h1 className="text-xl font-black text-[#1B1B1B] mb-1">사물을 촬영하세요</h1>
                  <p className="text-sm text-center text-[#8A9A8E] leading-relaxed">
                    주변 사물을 카메라에 담으면<br />몬스터로 변신해요
                  </p>
                </div>

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
                      <Camera size={36} className="text-white/30" />
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

                <input
                  ref={inputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  capture="environment"
                  onChange={handleCapture}
                  className="hidden"
                />

                {scanError && (
                  <div className="mt-3 shrink-0">
                    <p className="text-sm text-[#C0503D] bg-[#FBEAE7] rounded-xl px-4 py-3 text-center leading-relaxed">
                      {scanError}
                    </p>
                    {isSlotFull && (
                      <button
                        onClick={() => setTab('developing')}
                        className="mt-2.5 w-full py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
                      >
                        인화 대기 목록 보기
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
                <div className="w-60 h-[18px] rounded-[3px] bg-gradient-to-b from-[#4A4A4A] via-[#2A2A2A] to-[#1A1A1A] shadow-lg relative z-20 flex items-center justify-center shrink-0">
                  <div className="w-[212px] h-[5px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]" />
                </div>

                <div className="w-60 relative z-10 clip-window shrink-0">
                  <div
                    className={`polaroid-paper bg-[#FAF8F5] shadow-[0_12px_28px_-6px_rgba(0,0,0,0.35)] px-3 pt-3 pb-12 rounded-[2px] border border-[#EFECE6] ${
                      !isScanDone ? 'printing-loop' : 'print-done'
                    }`}
                  >
                    <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
                      <MonsterSilhouette className="w-3/4 h-3/4 text-white/25 blur-[6px]" />

                      <div
                        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-700 ${
                          isScanDone ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        <div className="w-12 h-12 rounded-2xl bg-black/35 backdrop-blur-sm border border-white/25 flex items-center justify-center">
                          <Lock size={20} strokeWidth={2.2} className="text-white/90" />
                        </div>
                        <span className="text-[11px] font-bold text-white/90 drop-shadow">
                          걸으면 인화돼요
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 text-center shrink-0">
                  {!isScanDone ? (
                    <>
                      <p className="text-sm font-bold text-[#1B1B1B]">인화 중...</p>
                      <p className="text-xs text-[#8A9A8E] mt-1">몬스터를 분석하고 있어요</p>
                    </>
                  ) : (
                    <div className="fade-up">
                      <p className="text-sm font-bold text-[#1B1B1B] mb-1">사진을 담았어요!</p>
                      <p className="text-xs text-[#8A9A8E]">
                        {newEggSteps !== null
                          ? `${newEggSteps.toLocaleString()}보를 걸으면 인화가 끝나요`
                          : '걸으면 인화가 진행돼요'}
                      </p>
                    </div>
                  )}
                </div>

                {isScanDone && (
                  <div className="w-full mt-6 shrink-0 fade-up space-y-2">
                    <button
                      onClick={() => {
                        setTab('developing');
                        setCaptureStep('idle');
                      }}
                      className="w-full py-3.5 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
                    >
                      인화 대기 목록 보기
                    </button>
                    <button
                      onClick={() => setCaptureStep('idle')}
                      className="w-full py-3.5 rounded-full bg-white text-[#3E7A5C] font-bold text-sm border border-[#DCE8DE] active:scale-95 transition-transform"
                    >
                      계속 촬영하기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          // ───────── 인화 대기 탭 ─────────
          <div className="flex-1 min-h-0 flex flex-col">
            {eggsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-sm text-[#8A9A8E]">불러오는 중...</p>
              </div>
            ) : eggs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <p className="text-sm text-[#8A9A8E] mb-5">인화를 기다리는 사진이 없어요</p>
                <button
                  onClick={() => setTab('capture')}
                  className="px-6 py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-sm shadow-md active:scale-95 transition-transform"
                >
                  사물 촬영하러 가기
                </button>
              </div>
            ) : (
              <>
                {/* 폴라로이드 */}
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
                  <div className={`w-56 shrink-0 ${isRevealing ? 'reveal-pop' : ''}`}>
                    <div className="bg-[#FAF8F5] shadow-[0_12px_28px_-6px_rgba(0,0,0,0.3)] px-3 pt-3 pb-10 rounded-[2px] border border-[#EFECE6]">
                      <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={currentEgg?.imageUrl}
                          alt=""
                          className="w-full h-full object-contain transition-all duration-700"
                          style={{ filter: `blur(${blurPx}px) grayscale(${grayscale}%)` }}
                        />

                        <div
                          className="absolute inset-0 bg-[#8FA396] transition-opacity duration-700"
                          style={{ opacity: veilOpacity }}
                        />

                        {!isReadyToReveal && !isRevealing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                            <div className="w-11 h-11 rounded-2xl bg-black/30 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-inner">
                              <Lock size={18} strokeWidth={2.2} className="text-white/90" />
                            </div>
                            <span className="text-[11px] font-bold text-white/90 drop-shadow">
                              인화 중...
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 진행률 */}
                  <div className="w-full text-center shrink-0 mt-5">
                    <div className="flex items-baseline justify-center gap-1 mb-1">
                      <span className="text-2xl font-black text-[#1B1B1B]">
                        {currentEgg?.currentSteps.toLocaleString()}
                      </span>
                      <span className="text-sm font-bold text-[#8A9A8E]">
                        / {currentEgg?.requiredSteps.toLocaleString()} 보
                      </span>
                    </div>

                    <p className="text-xs text-[#8A9A8E] mb-2">
                      {isRevealing
                        ? '사진이 드러나고 있어요...'
                        : isReadyToReveal
                        ? '인화가 끝났어요! 확인해보세요'
                        : `${((currentEgg?.requiredSteps ?? 0) - (currentEgg?.currentSteps ?? 0)).toLocaleString()}보 더 걸으면 완성돼요`}
                    </p>

                    <div className="w-full h-2.5 bg-white/60 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#1F4B3C] rounded-full transition-all duration-300 ease-out"
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* 걷는 중 상태 */}
                {isWalking && !isReadyToReveal && (
                  <div className="bg-white/70 rounded-2xl p-2.5 shrink-0 mt-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Footprints size={13} className="text-[#3E7A5C]" />
                      <span className="text-[11px] font-bold text-[#4B5A50]">걷는 중</span>
                      <span className="ml-auto text-[11px] text-[#8A9A8E]">
                        이번 {sessionSteps.toLocaleString()}보
                      </span>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => addSteps(MANUAL_STEP_SMALL)}
                        className="flex-1 py-2 bg-white text-[#1F4B3C] font-bold text-xs rounded-lg shadow-sm active:scale-95 transition-transform"
                      >
                        +{MANUAL_STEP_SMALL}보
                      </button>
                      <button
                        onClick={() => addSteps(MANUAL_STEP_LARGE)}
                        className="flex-1 py-2 bg-white text-[#1F4B3C] font-bold text-xs rounded-lg shadow-sm active:scale-95 transition-transform"
                      >
                        +{MANUAL_STEP_LARGE}보
                      </button>
                    </div>
                  </div>
                )}

                {/* 인화 대기 목록 */}
                <div className="bg-white/70 rounded-2xl p-2.5 shrink-0 mt-3">
                  <p className="text-[11px] font-bold text-[#4B5A50] mb-1.5 px-1">
                    인화 대기 (최대 {MAX_EGG_SLOTS}장)
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {Array.from({ length: MAX_EGG_SLOTS }).map((_, index) => {
                      const egg = eggs[index];
                      const isSelected = egg?.eggId === selectedEggId;
                      const percent = egg
                        ? Math.round((egg.currentSteps / egg.requiredSteps) * 100)
                        : 0;

                      return (
                        <div
                          key={index}
                          onClick={() => egg && !isRevealing && setSelectedEggId(egg.eggId)}
                          className={`h-14 rounded-xl flex flex-col items-center justify-center transition-all ${
                            isSelected
                              ? 'bg-white border-2 border-[#1F4B3C] shadow-sm cursor-pointer'
                              : egg
                              ? 'bg-white/50 border border-transparent cursor-pointer'
                              : 'bg-white/20 border border-dashed border-[#B0BDB4]'
                          }`}
                        >
                          {egg ? (
                            <>
                              <div className="w-5 h-6 bg-[#FAF8F5] border border-[#D5E3D8] rounded-[1px] mb-1" />
                              <span className="text-[10px] font-bold text-[#1B1B1B]">{percent}%</span>
                            </>
                          ) : (
                            <Lock size={14} className="text-[#A0B0A4]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {eggError && (
                  <p className="shrink-0 mt-2 text-xs text-[#C0503D] bg-[#FBEAE7] rounded-xl px-3 py-2.5 text-center leading-relaxed">
                    {eggError}
                  </p>
                )}

                {/* 하단 버튼 */}
                <div className="shrink-0 mt-3">
                  {isReadyToReveal ? (
                    <button
                      disabled={busy || isRevealing}
                      onClick={handleReveal}
                      className="w-full py-3.5 rounded-full font-bold text-sm bg-[#1F4B3C] text-white shadow-md active:scale-95 transition-transform disabled:opacity-60"
                    >
                      {isRevealing ? '사진을 꺼내는 중...' : '몬스터 확인하기'}
                    </button>
                  ) : isWalking ? (
                    <button
                      disabled={busy}
                      onClick={handleEnd}
                      className="w-full py-3.5 rounded-full font-bold text-sm bg-white text-[#3E7A5C] border border-[#DCE8DE] active:scale-95 transition-transform disabled:opacity-60"
                    >
                      {busy ? '처리 중...' : '걷기 그만하기'}
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={handleStart}
                      className="w-full py-3.5 rounded-full font-bold text-sm bg-[#1F4B3C] text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                      <Footprints size={16} />
                      {busy ? '처리 중...' : '걷기 시작'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ───────── 인화 완료 카드 ───────── */}
      {revealedMonster && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="w-64 relative card-in flex flex-col items-center">
            <button
              onClick={() => setRevealedMonster(null)}
              aria-label="닫기"
              className="absolute -top-3 -right-3 z-20 w-9 h-9 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-90 transition-transform text-xl font-bold text-[#1B1B1B] leading-none border border-[#EFECE6]"
            >
              ×
            </button>

            <div className="w-full bg-[#FAF8F5] shadow-[0_20px_40px_rgba(0,0,0,0.4)] px-3.5 pt-3.5 pb-6 rounded-[2px] border border-[#EFECE6]">
              <div className="aspect-square bg-[#F2EFE9] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_4px_rgba(0,0,0,0.15)]">
                {/* hatch API는 테두리가 포함된 원본 이미지를 반환하므로, 폴라로이드 프레임과 겹치지 않도록 확대해 잘라낸다 */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={revealedMonster.imageUrl}
                  alt={revealedMonster.name}
                  className="w-full h-full object-cover scale-[1.18] reveal-in"
                />

                <span
                  className={`absolute top-2 left-2 z-10 text-[10px] font-extrabold text-white px-2 py-0.5 rounded-md shadow-sm ${
                    RARITY_STYLE[revealedMonster.rarity] ?? 'bg-[#8F9A92]'
                  }`}
                >
                  {revealedMonster.rarity}
                </span>
                {isNewMonster && (
                  <span className="absolute top-2 right-2 z-10 text-[10px] font-black text-white bg-[#C84B31] px-2 py-0.5 rounded-full shadow-sm">
                    NEW
                  </span>
                )}

                <div className="absolute bottom-2 left-2 right-2 z-10 flex gap-1.5 justify-start">
                  <span className="text-[10px] bg-black/50 backdrop-blur-md text-white rounded-md px-2 py-0.5 font-semibold border border-white/20 shadow-sm">
                    {MATERIAL_LABEL[revealedMonster.material] ?? revealedMonster.material}
                  </span>
                  <span className="text-[10px] bg-black/50 backdrop-blur-md text-white rounded-md px-2 py-0.5 font-semibold border border-white/20 shadow-sm">
                    {SHAPE_LABEL[revealedMonster.shape] ?? revealedMonster.shape}
                  </span>
                </div>
              </div>

              <div className="pt-4 text-center">
                <p className="font-black text-[#1B1B1B] text-xl tracking-tight">
                  {revealedMonster.name}
                </p>
              </div>
            </div>

            <button
              onClick={() => router.push('/collections')}
              className="w-full mt-4 py-3.5 bg-[#1F4B3C] text-white font-bold text-xs rounded-full active:scale-95 transition-transform shadow-xl"
            >
              도감에서 확인하기
            </button>
          </div>
        </div>
      )}

      <style jsx>{`
        .clip-window { clip-path: inset(0 -40px -40px -40px); }

        .printing-loop { animation: printMechanical 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @keyframes printMechanical {
          0%   { transform: translateY(-75%); }
          40%  { transform: translateY(-35%); }
          55%  { transform: translateY(-35%); }
          85%  { transform: translateY(-65%); }
          100% { transform: translateY(-75%); }
        }

        .print-done { animation: printDone 2.2s cubic-bezier(0.16, 0.84, 0.28, 1) forwards; }
        @keyframes printDone {
          0%   { transform: translateY(-40%); }
          75%  { transform: translateY(1.5%); }
          88%  { transform: translateY(-0.5%); }
          100% { transform: translateY(0); }
        }

        .fade-up { animation: fadeUp 0.5s ease-out forwards; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .reveal-pop { animation: revealPop 2.4s ease-in-out forwards; }
        @keyframes revealPop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.03); }
          60%  { transform: scale(1.01); }
          100% { transform: scale(1); }
        }

        .reveal-in { animation: revealIn 1s ease-out forwards; }
        @keyframes revealIn {
          from { opacity: 0; filter: blur(12px); transform: scale(1.3); }
          to   { opacity: 1; filter: blur(0); transform: scale(1.18); }
        }

        .card-in { animation: cardIn 0.45s ease-out forwards; }
        @keyframes cardIn {
          from { opacity: 0; transform: scale(0.9) translateY(12px); }
          to   { opacity: 1; transform: scale(1) translateY(0); }
        }

        @media (prefers-reduced-motion: reduce) {
          .printing-loop, .print-done, .fade-up, .reveal-pop, .reveal-in, .card-in { animation: none; }
        }
      `}</style>
    </div>
  );
}