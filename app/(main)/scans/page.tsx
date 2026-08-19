'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Camera, Footprints } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';
import { ApiError, ERROR } from "@/lib/api/response";

const notoSans = Noto_Sans_KR({
  weight: ['400', '700', '900'],
  display: 'swap',
  preload: false,
});

type Tab = 'capture' | 'developing';
type CaptureStep = 'idle' | 'scanning';

// iOS의 비표준 센서 권한 API를 타입에 추가한다
type DeviceMotionEventWithPermission = typeof DeviceMotionEvent & {
  requestPermission?: () => Promise<'granted' | 'denied'>;
};

// 연출 및 UI 관련 상수
const MIN_DEVELOP_MS = 2600;
const REVEAL_ANIMATION_MS = 2400;

// 글로벌 네트워크 타임아웃 설정이 따로 없다면 유지
const REQUEST_TIMEOUT_MS = 20000;

// 이미지 및 슬롯 제한 설정
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.85;
const MAX_EGG_SLOTS = 3;

// 걸음 수 및 센서 관련 설정
const MANUAL_STEP_SMALL = 5;
const MANUAL_STEP_LARGE = 20;
const SYNC_INTERVAL_MS = 5000;
const STEPS_STORAGE_PREFIX = 'monsnap:walk:';

const STEP_THRESHOLD = 13.5;
const STEP_COOLDOWN_MS = 450;

type Egg = {
  eggId: string;
  status: string;
  currentSteps: number;
  requiredSteps: number;
  activeWalkSessionId: string | null;
  cutoutImageUrl?: string | null;
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
  EPIC: 'bg-[#A778C2]',
};

const triggerHaptic = (type: 'snap' | 'step' | 'success' | 'rare' | 'epic') => {
  if (typeof window === 'undefined' || !('vibrate' in navigator)) return;

  if (type === 'snap') navigator.vibrate(50);
  if (type === 'step') navigator.vibrate(20);
  if (type === 'success') navigator.vibrate([40, 60, 80, 60, 200]);
  if (type === 'rare') navigator.vibrate(70);
  if (type === 'epic') navigator.vibrate([60, 100, 60, 100, 250]);
};

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

// VLM 전송 부담을 줄이기 위해 이미지를 축소하며, 실패 시 원본을 사용한다
// 일부 모바일에서 파일 타입이 비어 오므로 축소 여부와 관계없이 MIME 타입을 보정한다.
async function resizeImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const { width, height } = bitmap;
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(width, height));

    if (scale >= 1) {
      bitmap.close();
      const hasValidType =
        file.type === 'image/jpeg' ||
        file.type === 'image/png' ||
        file.type === 'image/webp';
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
  const [isFlashing, setIsFlashing] = useState(false);
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
  const currentStepsRef = useRef(0);
  const lastStepTimeRef = useRef(0);
  const [sessionSteps, setSessionSteps] = useState(0);

  const currentEgg = eggs.find((egg) => egg.eggId === selectedEggId) ?? null;

  // 선택한 알이 바뀌어도 활성 걷기 세션 기준으로 동기화를 유지한다
  const walkingEgg = eggs.find((egg) => egg.activeWalkSessionId != null) ?? null;
  const isWalking = walkingEgg !== null;
  const activeSessionId = walkingEgg?.activeWalkSessionId ?? null;
  const isReadyToReveal = currentEgg?.status === 'READY';

  useEffect(() => {
    currentStepsRef.current = walkingEgg?.currentSteps ?? 0;
  }, [walkingEgg?.eggId, walkingEgg?.currentSteps]);

  const loadEggs = useCallback(async () => {
    setEggError(null);

    try {
      const res = await fetch('/api/eggs');
      const body = await res.json().catch(() => null);

      if (!res.ok || body?.code !== ERROR.OK.code) {
        // 서버에서 전달된 메시지가 있으면 사용하고, 없으면 기본 에러 메시지 노출
        setEggError(body?.message ?? ERROR.INTERNAL_ERROR.message);
        return;
      }

      const list = body.data?.eggs;

      if (!Array.isArray(list)) {
        throw new ApiError("INVALID_REQUEST");
      }

      const parsedEggs: Egg[] = list.map((item) => ({
        eggId: item.eggId,
        status: item.status,
        currentSteps: item.currentSteps,
        requiredSteps: item.requiredSteps,
        activeWalkSessionId: item.activeWalkSessionId,
        cutoutImageUrl: item.cutoutImageUrl,
      }));

      // 서버에 없는 만료 세션의 로컬 키를 정리한다
      const activeSessionIds = new Set(
        parsedEggs
          .map((egg) => egg.activeWalkSessionId)
          .filter((id): id is string => id !== null)
      );

      for (let i = localStorage.length - 1; i >= 0; i -= 1) {
        const key = localStorage.key(i);
        if (!key?.startsWith(STEPS_STORAGE_PREFIX)) continue;

        const sessionId = key.slice(STEPS_STORAGE_PREFIX.length);
        if (!activeSessionIds.has(sessionId)) {
          localStorage.removeItem(key);
        }
      }

      setEggs(parsedEggs);

      setSelectedEggId((prev) =>
        prev && parsedEggs.some((egg) => egg.eggId === prev)
          ? prev
          : (parsedEggs[0]?.eggId ?? null)
      );
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(`[/api/eggs] ApiError (${error.key} / ${error.code}):`, error.message);
        setEggError(error.message);
      } else if (error instanceof Error) {
        console.error("[/api/eggs] unexpected error:", error.message);
        setEggError(error.message);
      } else {
        console.error("[/api/eggs] unknown error:", error);
        setEggError(ERROR.INTERNAL_ERROR.message);
      }
    } finally {
      setEggsLoading(false);
    }
  }, []);

  // 누적값 동기화라 일시 실패 후 다음 주기에 재전송할 수 있다
  const syncSteps = useCallback(async (): Promise<boolean> => {
    if (!walkingEgg?.activeWalkSessionId) return true;

    const sessionId = walkingEgg.activeWalkSessionId;
    const steps = localStepsRef.current;

    // 서버는 감소한 누적값을 거부하므로 증가했을 때만 전송한다
    if (steps <= lastSentRef.current) return true;

    setEggError(null);

    try {
      const res = await fetch(
        `/api/eggs/${walkingEgg.eggId}/walk-sessions/${sessionId}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stepsCaptured: steps }),
        }
      );
      const body = await res.json().catch(() => null);

      // 만료/종료된 세션이면 로컬 키를 지우고 기존 행동 유도 문구를 노출한다
      if (
        body?.code === ERROR.WALK_SESSION_NOT_FOUND.code ||
        body?.code === ERROR.SESSION_NOT_ACTIVE.code
      ) {
        localStorage.removeItem(STEPS_STORAGE_PREFIX + sessionId);
        await loadEggs();
        setEggError('걷기 세션이 종료되었어요. 다시 시작해주세요.');
        return false;
      }

      if (!res.ok || body?.code !== ERROR.OK.code) {
        setEggError(body?.message ?? ERROR.INTERNAL_ERROR.message);
        return false;
      }

      const egg = body.data?.egg;

      if (!egg) {
        throw new ApiError("INVALID_REQUEST");
      }

      lastSentRef.current = steps;

      setEggs((prev) =>
        prev.map((item) =>
          item.eggId === egg.id
            ? { ...item, currentSteps: egg.currentSteps, status: egg.status }
            : item
        )
      );

      setEggError(null);
      return true;
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(`[/api/walk-sessions] ApiError (${error.key} / ${error.code}):`, error.message);
        setEggError(error.message);
      } else if (error instanceof Error) {
        console.error("[/api/walk-sessions] unexpected error:", error.message);
        setEggError(error.message);
      } else {
        console.error("[/api/walk-sessions] unknown error:", error);
        setEggError(ERROR.INTERNAL_ERROR.message);
      }
      return false;
    }
  }, [walkingEgg, loadEggs]);

  // 목표 걸음 수에 도달하면 즉시 서버에 동기화한다
  const addSteps = useCallback(
    (amount: number, haptic = false) => {
      if (amount <= 0 || !walkingEgg?.activeWalkSessionId) return;

      if (haptic) triggerHaptic('step');

      localStepsRef.current += amount;
      setSessionSteps(localStepsRef.current);

      localStorage.setItem(
        STEPS_STORAGE_PREFIX + walkingEgg.activeWalkSessionId,
        String(localStepsRef.current)
      );

      const nextSteps = Math.min(
        walkingEgg.requiredSteps,
        currentStepsRef.current + amount
      );
      currentStepsRef.current = nextSteps;

      setEggs((prev) =>
        prev.map((egg) =>
          egg.eggId === walkingEgg.eggId ? { ...egg, currentSteps: nextSteps } : egg
        )
      );

      if (nextSteps >= walkingEgg.requiredSteps) {
        void syncSteps();
      }
    },
    [walkingEgg, syncSteps]
  );

  useEffect(() => {
    if (!isWalking) return;

    const handleDeviceMotion = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      const now = Date.now();

      // 한 동작의 중복 감지를 막는다
      if (
        magnitude > STEP_THRESHOLD &&
        now - lastStepTimeRef.current > STEP_COOLDOWN_MS
      ) {
        lastStepTimeRef.current = now;
        addSteps(1, false);
      }
    };

    window.addEventListener('devicemotion', handleDeviceMotion);
    return () => window.removeEventListener('devicemotion', handleDeviceMotion);
  }, [isWalking, addSteps]);

  useEffect(() => {
    if (!isWalking) return;

    const timer = setInterval(() => {
      void syncSteps();
    }, SYNC_INTERVAL_MS);

    return () => clearInterval(timer);
  }, [isWalking, syncSteps]);

  // 백그라운드 전환 전에 미전송 걸음을 한 번 더 동기화한다
  useEffect(() => {
    if (!isWalking) return;

    const handleVisibilityChange = () => {
      if (document.hidden) void syncSteps();
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isWalking, syncSteps]);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFlashing(true);
    setTimeout(() => setIsFlashing(false), 250);
    triggerHaptic('snap');

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
        await new Promise((resolve) =>
          setTimeout(resolve, MIN_DEVELOP_MS - elapsed)
        );
      }

      if (body?.code === ERROR.EGG_SLOT_FULL.code) {
        throw new ApiError("EGG_SLOT_FULL");
      }

      // 서버 응답이 OK가 아닐 경우 서버 메시지 우선 활용
      if (!res.ok || body?.code !== ERROR.OK.code) {
        const serverMessage = body?.message;
        if (serverMessage) {
          setScanError(serverMessage);
          setCaptureStep('idle');
          return;
        }
        throw new ApiError("INTERNAL_ERROR");
      }

      const requiredSteps = body.data?.requiredSteps;

      if (typeof requiredSteps !== 'number') {
        throw new ApiError("INVALID_REQUEST");
      }

      setNewEggSteps(requiredSteps);
      setIsScanDone(true);
      await loadEggs();
    } catch (error) {
      setCaptureStep('idle');

      if (error instanceof DOMException && error.name === 'AbortError') {
        console.error(
          `[/api/scans] ApiError (${ERROR.VLM_TIMEOUT.code}):`,
          ERROR.VLM_TIMEOUT.message
        );
        setScanError(ERROR.VLM_TIMEOUT.message);
      } else if (error instanceof ApiError) {
        console.error(`[/api/scans] ApiError (${error.key} / ${error.code}):`, error.message);
        setIsSlotFull(error.key === "EGG_SLOT_FULL");
        setScanError(error.message);
      } else if (error instanceof Error) {
        console.error('[/api/scans] unexpected error:', error.message);
        setScanError(ERROR.INTERNAL_ERROR.message);
      } else {
        console.error('[/api/scans] unknown error:', error);
        setScanError(ERROR.INTERNAL_ERROR.message);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  const handleStart = async () => {
    if (!currentEgg || busy) return;

    setBusy(true);
    setEggError(null);

    let sensorUnavailable = false;

    try {
      if (typeof DeviceMotionEvent !== 'undefined') {
        const deviceMotionEvent = DeviceMotionEvent as DeviceMotionEventWithPermission;

        if (typeof deviceMotionEvent.requestPermission === 'function') {
          const permission = await deviceMotionEvent.requestPermission();
          if (permission !== 'granted') sensorUnavailable = true;
        }
      }
    } catch {
      sensorUnavailable = true;
    }

    try {
      const res = await fetch(`/api/eggs/${currentEgg.eggId}/walk-sessions`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => null);

      // 서버 응답이 OK가 아닐 경우 처리
      if (!res.ok || body?.code !== ERROR.OK.code) {
        const serverMessage = body?.message;
        if (serverMessage) {
          setEggError(serverMessage);
          return;
        }
        throw new ApiError('INTERNAL_ERROR');
      }

      localStepsRef.current = 0;
      lastSentRef.current = 0;
      lastStepTimeRef.current = 0;
      setSessionSteps(0);

      await loadEggs();

      if (sensorUnavailable) {
        setEggError('센서를 사용할 수 없어 수동 걸음 버튼으로 진행할 수 있어요.');
      }
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/walk-sessions] ApiError (${error.key} / ${error.code}):`,
          error.message
        );
        setEggError(error.message);
      } else if (error instanceof Error) {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/walk-sessions] unexpected error:`,
          error.message
        );
        setEggError(ERROR.INTERNAL_ERROR.message);
      } else {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/walk-sessions] unknown error:`,
          error
        );
        setEggError(ERROR.INTERNAL_ERROR.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleEnd = async () => {
    if (!walkingEgg?.activeWalkSessionId || busy) return;

    setBusy(true);
    setEggError(null);

    const sessionId = walkingEgg.activeWalkSessionId;

    const synced = await syncSteps();

    if (!synced) {
      setBusy(false);
      return;
    }

    try {
      const res = await fetch(
        `/api/eggs/${walkingEgg.eggId}/walk-sessions/${sessionId}/end`,
        { method: 'POST' }
      );
      const body = await res.json().catch(() => null);

      // 서버 응답이 OK가 아닐 경우 처리
      if (!res.ok || body?.code !== ERROR.OK.code) {
        const serverMessage = body?.message;
        if (serverMessage) {
          setEggError(serverMessage);
          return;
        }
        throw new ApiError('INTERNAL_ERROR');
      }

      localStorage.removeItem(STEPS_STORAGE_PREFIX + sessionId);
      await loadEggs();
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(
          `[/api/eggs/${walkingEgg.eggId}/walk-sessions/${sessionId}/end] ApiError (${error.key} / ${error.code}):`,
          error.message
        );
        setEggError(error.message);
      } else if (error instanceof Error) {
        console.error(
          `[/api/eggs/${walkingEgg.eggId}/walk-sessions/${sessionId}/end] unexpected error:`,
          error.message
        );
        setEggError(ERROR.INTERNAL_ERROR.message);
      } else {
        console.error(
          `[/api/eggs/${walkingEgg.eggId}/walk-sessions/${sessionId}/end] unknown error:`,
          error
        );
        setEggError(ERROR.INTERNAL_ERROR.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const handleReveal = async () => {
    if (!currentEgg || busy || isRevealing) return;

    setIsRevealing(true);
    setBusy(true);
    setEggError(null);

    const sessionId = currentEgg.activeWalkSessionId;
    const startedAt = Date.now();

    try {
      const res = await fetch(`/api/eggs/${currentEgg.eggId}/hatch`, {
        method: 'POST',
      });
      const body = await res.json().catch(() => null);

      // 서버 응답이 빨라도 공개 연출 시간은 보장한다
      const elapsed = Date.now() - startedAt;
      if (elapsed < REVEAL_ANIMATION_MS) {
        await new Promise((resolve) =>
          setTimeout(resolve, REVEAL_ANIMATION_MS - elapsed)
        );
      }

      // 서버 응답이 OK가 아닐 경우 처리
      if (!res.ok || body?.code !== ERROR.OK.code) {
        if (res.status === 404) {
          if (sessionId) {
            localStorage.removeItem(STEPS_STORAGE_PREFIX + sessionId);
          }
          await loadEggs();
        }

        const serverMessage = body?.message;
        if (serverMessage) {
          setEggError(serverMessage);
          return;
        }
        throw new ApiError('INTERNAL_ERROR');
      }

      const monsterData = body.data?.monster;
      const newMonster = body.data?.isNewMonster;

      if (!monsterData || typeof newMonster !== 'boolean') {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/hatch] unexpected response structure:`,
          body
        );
        setEggError('몬스터 정보를 확인하지 못했어요. 다시 시도해주세요.');
        return;
      }

      setRevealedMonster(monsterData);
      setIsNewMonster(newMonster);

      const rarity = monsterData.rarity;
      if (rarity === 'EPIC') triggerHaptic('epic');
      else if (rarity === 'RARE') triggerHaptic('rare');
      else triggerHaptic('success');

      if (sessionId) localStorage.removeItem(STEPS_STORAGE_PREFIX + sessionId);
      localStepsRef.current = 0;
      lastSentRef.current = 0;
      setSessionSteps(0);

      await loadEggs();
    } catch (error) {
      if (error instanceof ApiError) {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/hatch] ApiError (${error.key} / ${error.code}):`,
          error.message
        );
        setEggError(error.message);
      } else if (error instanceof Error) {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/hatch] unexpected error:`,
          error.message
        );
        setEggError(ERROR.INTERNAL_ERROR.message);
      } else {
        console.error(
          `[/api/eggs/${currentEgg.eggId}/hatch] unknown error:`,
          error
        );
        setEggError(ERROR.INTERNAL_ERROR.message);
      }
    } finally {
      setIsRevealing(false);
      setBusy(false);
    }
  };

  const progressPercent = currentEgg
    ? Math.min(
        100,
        Math.round((currentEgg.currentSteps / currentEgg.requiredSteps) * 100)
      )
    : 0;

  // 확인 버튼을 누르기 전까지 몬스터가 완전히 드러나지 않도록 한다
  const blurPx = Math.max(3, 16 - (progressPercent / 100) * 13);
  const grayscale = Math.max(15, 100 - progressPercent * 0.85);
  const veilOpacity = Math.max(0.12, 0.5 - (progressPercent / 100) * 0.38);

  const displayDevelopingImage = currentEgg?.cutoutImageUrl ?? null;

  // 선택한 알과 걷는 알이 다르면 조작을 막고 진행 중임을 안내한다
  const isOtherEggWalking =
    walkingEgg !== null && currentEgg?.eggId !== walkingEgg.eggId;

  return (
    <div
      className={`${notoSans.className} h-full w-full flex flex-col justify-between bg-[#EAF3EA] px-3 pt-2 pb-1 overflow-hidden select-none relative`}
    >
      <div
        className={`pointer-events-none fixed inset-0 z-50 bg-white transition-opacity duration-300 ${
          isFlashing ? 'opacity-90' : 'opacity-0'
        }`}
      />

      <div className="w-full max-w-sm mx-auto flex flex-col h-full justify-between">
        <div className="shrink-0 flex gap-1 mb-1.5">
          {(
            [
              ['capture', '촬영', Camera],
              ['developing', '인화 대기', Footprints],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`flex-1 py-2 rounded-2xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer ${
                tab === key ? 'bg-white text-[#1F4B3C]' : 'bg-white/40 text-[#8A9A8E]'
              }`}
            >
              <Icon size={14} />
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
          <div className="flex-1 min-h-0 flex flex-col justify-between py-0.5">
            {captureStep === 'idle' ? (
              <>
                <div className="flex flex-col items-center shrink-0 mb-1">
                  <h1 className="text-base sm:text-lg font-black text-[#1B1B1B]">
                    사물을 촬영하세요
                  </h1>
                  <p className="text-[11px] sm:text-xs text-center text-[#8A9A8E] leading-relaxed">
                    주변 사물을 카메라에 담으면 몬스터로 변신해요
                  </p>
                </div>

                {/* flex 자식의 화면 넘침 방지 */}
                <div
                  onClick={() => inputRef.current?.click()}
                  className="flex-1 min-h-0 w-full rounded-3xl bg-[#2A2A2A] p-2.5 shadow-xl flex flex-col justify-between my-1 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="flex-1 min-h-0 rounded-2xl bg-[#1A1A1A] relative overflow-hidden mb-2">
                    <div className="absolute inset-0 grid grid-cols-3 grid-rows-3">
                      {Array.from({ length: 9 }).map((_, index) => (
                        <div key={index} className="border border-white/10" />
                      ))}
                    </div>

                    <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-white/40 rounded-tl-lg" />
                    <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-white/40 rounded-tr-lg" />
                    <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-white/40 rounded-bl-lg" />
                    <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-white/40 rounded-br-lg" />

                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
                      <Camera size={28} className="text-white/30" />
                      <span className="text-[10px] text-white/50">
                        탭해서 사물을 담아보세요
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-center shrink-0 py-0.5">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        inputRef.current?.click();
                      }}
                      aria-label="촬영하기"
                      className="w-[50px] h-[50px] rounded-full bg-white flex items-center justify-center active:scale-90 transition-transform shadow-lg cursor-pointer"
                    >
                      <span className="w-[42px] h-[42px] rounded-full border-[3px] border-[#2A2A2A]" />
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
                  <div className="mt-1 shrink-0">
                    <p className="text-xs text-[#C0503D] bg-[#FBEAE7] rounded-xl px-3 py-2 text-center">
                      {scanError}
                    </p>
                    {isSlotFull && (
                      <button
                        type="button"
                        onClick={() => setTab('developing')}
                        className="mt-1.5 w-full py-2 rounded-full bg-[#1F4B3C] text-white font-bold text-xs shadow-md active:scale-95 transition-transform cursor-pointer"
                      >
                        인화 대기 목록 보기
                      </button>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
                <div className="w-52 h-[16px] rounded-[3px] bg-gradient-to-b from-[#4A4A4A] via-[#2A2A2A] to-[#1A1A1A] shadow-lg relative z-20 flex items-center justify-center shrink-0">
                  <div className="w-[180px] h-[4px] rounded-full bg-black shadow-[inset_0_1px_2px_rgba(0,0,0,0.9)]" />
                </div>

                <div className="w-52 relative z-10 clip-window shrink-0">
                  <div
                    className={`bg-[#FAF8F5] shadow-[0_12px_28px_-6px_rgba(0,0,0,0.35)] px-3 pt-3 pb-8 rounded-[2px] border border-[#EFECE6] ${
                      !isScanDone ? 'printing-loop' : 'print-done'
                    }`}
                  >
                    <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
                      {/* 촬영 이미지는 저장하지 않으므로 실루엣으로 대체한다 (Zero-Storage) */}
                      <MonsterSilhouette className="w-3/4 h-3/4 text-white/25 blur-[6px]" />

                      <div
                        className={`absolute inset-0 flex flex-col items-center justify-center gap-2 transition-opacity duration-700 ${
                          isScanDone ? 'opacity-100' : 'opacity-0'
                        }`}
                      >
                        <div className="w-10 h-10 rounded-2xl bg-black/35 backdrop-blur-sm border border-white/25 flex items-center justify-center">
                          <Lock size={18} strokeWidth={2.2} className="text-white/90" />
                        </div>
                        <span className="text-[10px] font-bold text-white/90 drop-shadow">
                          걸으면 인화돼요
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="mt-3 text-center shrink-0">
                  {!isScanDone ? (
                    <>
                      <p className="text-sm font-bold text-[#1B1B1B]">인화 중...</p>
                      <p className="text-xs text-[#8A9A8E] mt-0.5">
                        몬스터를 분석하고 있어요
                      </p>
                    </>
                  ) : (
                    <div className="fade-up">
                      <p className="text-sm font-bold text-[#1B1B1B] mb-0.5">
                        사진을 담았어요!
                      </p>
                      <p className="text-xs text-[#8A9A8E]">
                        {newEggSteps !== null
                          ? `${newEggSteps.toLocaleString()}보를 걸으면 인화가 끝나요`
                          : '걸으면 인화가 진행돼요'}
                      </p>
                    </div>
                  )}
                </div>

                {isScanDone && (
                  <div className="w-full mt-3 shrink-0 fade-up space-y-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setTab('developing');
                        setCaptureStep('idle');
                      }}
                      className="w-full py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-xs shadow-md active:scale-95 transition-transform cursor-pointer"
                    >
                      인화 대기 목록 보기
                    </button>
                    <button
                      type="button"
                      onClick={() => setCaptureStep('idle')}
                      className="w-full py-3 rounded-full bg-white text-[#3E7A5C] font-bold text-xs border border-[#DCE8DE] active:scale-95 transition-transform cursor-pointer"
                    >
                      계속 촬영하기
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 min-h-0 flex flex-col justify-between py-0.5">
            {eggsLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <p className="text-xs text-[#8A9A8E]">불러오는 중...</p>
              </div>
            ) : eggError && eggs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-2">
                <p className="text-xs font-bold text-[#C0503D] mb-2">
                  인화 대기 목록을 불러오지 못했어요
                </p>
                <p className="text-[11px] text-[#8A9A8E] text-center">
                  잠시 후 다시 시도해주세요.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setEggsLoading(true);
                    void loadEggs();
                  }}
                  className="w-full mt-4 py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-xs shadow-md active:scale-95 transition-transform cursor-pointer"
                >
                  다시 불러오기
                </button>
              </div>
            ) : eggs.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-2">
                <div className="w-44 max-w-[190px] mb-3 opacity-60">
                  <div className="bg-[#FAF8F5] shadow-[0_8px_20px_-4px_rgba(0,0,0,0.15)] px-2.5 pt-2.5 pb-6 rounded-[2px] border border-[#EFECE6]">
                    <div className="aspect-square bg-[#E5ECE7] flex items-center justify-center rounded-[1px]">
                      <Lock size={20} className="text-[#A0B0A4]" />
                    </div>
                  </div>
                </div>

                <p className="text-xs font-bold text-[#4B5A50] mb-1">
                  인화 대기 중인 사진이 없어요
                </p>
                <p className="text-[11px] text-[#8A9A8E] mb-4 text-center">
                  사물을 촬영하고 걸어서
                  <br />
                  몬스터를 인화해보세요!
                </p>

                <div className="w-full bg-white/70 rounded-2xl p-2 shrink-0 mb-3">
                  <p className="text-[10px] font-bold text-[#4B5A50] mb-1 px-1">
                    인화 대기 슬롯 (0 / {MAX_EGG_SLOTS})
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: MAX_EGG_SLOTS }).map((_, index) => (
                      <div
                        key={index}
                        className="h-11 rounded-xl bg-white/30 border border-dashed border-[#B0BDB4] flex items-center justify-center"
                      >
                        <Lock size={12} className="text-[#C0D0C4]" />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setTab('capture')}
                  className="w-full py-3 rounded-full bg-[#1F4B3C] text-white font-bold text-xs shadow-md active:scale-95 transition-transform cursor-pointer"
                >
                  사물 촬영하러 가기
                </button>
              </div>
            ) : (
              <>
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center py-1">
                  <div
                    className={`w-44 max-w-[190px] shrink ${isRevealing ? 'reveal-pop' : ''}`}
                  >
                    <div className="bg-[#FAF8F5] shadow-[0_8px_20px_-4px_rgba(0,0,0,0.25)] px-2.5 pt-2.5 pb-6 rounded-[2px] border border-[#EFECE6]">
                      <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
                        {displayDevelopingImage ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={displayDevelopingImage}
                            alt=""
                            className="w-full h-full object-cover transition-all duration-700 drop-shadow-md"
                            style={{
                              filter: `blur(${blurPx}px) grayscale(${grayscale}%)`,
                            }}
                          />
                        ) : (
                          <MonsterSilhouette className="w-3/4 h-3/4 text-white/25 blur-[4px]" />
                        )}

                        <div
                          className="absolute inset-0 bg-[#8FA396] transition-opacity duration-700"
                          style={{ opacity: veilOpacity }}
                        />

                        {!isReadyToReveal && !isRevealing && (
                          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1">
                            <div className="w-9 h-9 rounded-xl bg-black/30 backdrop-blur-sm border border-white/25 flex items-center justify-center shadow-inner">
                              <Lock size={15} strokeWidth={2.2} className="text-white/90" />
                            </div>
                            <span className="text-[10px] font-bold text-white/90 drop-shadow">
                              인화 중...
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="w-full text-center shrink-0 mt-2">
                    <div className="flex items-baseline justify-center gap-1 mb-0.5">
                      <span className="text-xl font-black text-[#1B1B1B]">
                        {currentEgg?.currentSteps.toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-[#8A9A8E]">
                        / {currentEgg?.requiredSteps.toLocaleString()} 보
                      </span>
                    </div>

                    <p className="text-[11px] text-[#8A9A8E] whitespace-pre-line leading-relaxed">
                      {isRevealing
                        ? '사진이 드러나고 있어요...'
                        : isReadyToReveal
                          ? '인화가 끝났어요!\n확인해보세요'
                          : `${Math.max(
                              0,
                              (currentEgg?.requiredSteps ?? 0) -
                                (currentEgg?.currentSteps ?? 0)
                            ).toLocaleString()}보 더 걸으면\n완성돼요`}
                    </p>
                  </div>
                </div>

                {isWalking && !isOtherEggWalking && !isReadyToReveal && (
                  <div className="bg-white/70 rounded-2xl p-2 shrink-0 mb-1.5">
                    <div className="flex items-center gap-1.5 mb-1.5 px-1">
                      <Footprints size={12} className="text-[#3E7A5C]" />
                      <span className="text-[10px] font-bold text-[#4B5A50]">걷는 중</span>
                      <span className="ml-auto text-[10px] text-[#8A9A8E]">
                        이번 {sessionSteps.toLocaleString()}보
                      </span>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => addSteps(MANUAL_STEP_SMALL, true)}
                        className="flex-1 py-1.5 bg-white text-[#1F4B3C] font-bold text-[11px] rounded-lg shadow-xs active:scale-95 transition-transform cursor-pointer"
                      >
                        +{MANUAL_STEP_SMALL}보
                      </button>
                      <button
                        type="button"
                        onClick={() => addSteps(MANUAL_STEP_LARGE, true)}
                        className="flex-1 py-1.5 bg-white text-[#1F4B3C] font-bold text-[11px] rounded-lg shadow-xs active:scale-95 transition-transform cursor-pointer"
                      >
                        +{MANUAL_STEP_LARGE}보
                      </button>
                    </div>
                  </div>
                )}

                <div className="bg-white/70 rounded-2xl p-2 shrink-0 mb-1.5">
                  <p className="text-[10px] font-bold text-[#4B5A50] mb-1 px-1">
                    인화 대기 (최대 {MAX_EGG_SLOTS}장)
                  </p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {Array.from({ length: MAX_EGG_SLOTS }).map((_, index) => {
                      const egg = eggs[index];
                      const isSelected = egg?.eggId === selectedEggId;
                      const percent = egg
                        ? Math.min(
                            100,
                            Math.round((egg.currentSteps / egg.requiredSteps) * 100)
                          )
                        : 0;

                      return (
                        <div
                          key={index}
                          onClick={() =>
                            egg && !isRevealing && setSelectedEggId(egg.eggId)
                          }
                          className={`h-11 rounded-xl flex flex-col items-center justify-center transition-all relative ${
                            isSelected
                              ? 'bg-white border-2 border-[#1F4B3C] shadow-xs cursor-pointer'
                              : egg
                                ? 'bg-white/50 border border-transparent cursor-pointer'
                                : 'bg-white/20 border border-dashed border-[#B0BDB4]'
                          }`}
                        >
                          {egg ? (
                            <>
                              <div className="w-4 h-4 bg-[#FAF8F5] border border-[#D5E3D8] rounded-[1px] mb-0.5" />
                              <span className="text-[9px] font-bold text-[#1B1B1B]">
                                {percent}%
                              </span>
                              {egg.activeWalkSessionId && (
                                <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#3E7A5C]" />
                              )}
                            </>
                          ) : (
                            <Lock size={12} className="text-[#A0B0A4]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {eggError && (
                  <p className="shrink-0 mb-1 text-[11px] text-[#C0503D] bg-[#FBEAE7] rounded-xl px-2.5 py-1.5 text-center leading-relaxed">
                    {eggError}
                  </p>
                )}

                <div className="shrink-0 mt-0.5">
                  {isReadyToReveal ? (
                    <button
                      type="button"
                      disabled={busy || isRevealing}
                      onClick={handleReveal}
                      className="w-full py-3 rounded-full font-bold text-xs bg-[#1F4B3C] text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
                    >
                      {isRevealing ? '사진을 꺼내는 중...' : '몬스터 확인하기'}
                    </button>
                  ) : isOtherEggWalking ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-3 rounded-full font-bold text-xs bg-white/60 text-[#8A9A8E] border border-[#DCE8DE]"
                    >
                      다른 사진이 인화 중이에요
                    </button>
                  ) : isWalking ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleEnd}
                      className="w-full py-3 rounded-full font-bold text-xs bg-white text-[#3E7A5C] border border-[#DCE8DE] active:scale-95 transition-transform disabled:opacity-60 cursor-pointer"
                    >
                      {busy ? '처리 중...' : '걷기 그만하기'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={handleStart}
                      className="w-full py-3 rounded-full font-bold text-xs bg-[#1F4B3C] text-white shadow-md active:scale-95 transition-transform disabled:opacity-60 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Footprints size={14} />
                      {busy ? '처리 중...' : '걷기 시작'}
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {revealedMonster && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex flex-col items-center justify-center p-4">
          <div className="w-64 relative card-in flex flex-col items-center z-10">
            <button
              type="button"
              onClick={() => setRevealedMonster(null)}
              aria-label="닫기"
              className="absolute -top-3 -right-3 z-30 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center active:scale-90 transition-transform text-lg font-bold text-[#1B1B1B] leading-none border border-[#EFECE6] cursor-pointer"
            >
              ×
            </button>

            <div
              className={`w-full rounded-[2px] p-[2px] transition-all ${
                revealedMonster.rarity === 'EPIC'
                  ? 'shadow-[0_0_40px_rgba(255,215,0,0.6)] epic-gold-shimmer'
                  : revealedMonster.rarity === 'RARE'
                    ? 'shadow-[0_15px_30px_rgba(180,195,210,0.5)] rare-silver'
                    : 'shadow-[0_20px_40px_rgba(0,0,0,0.4)] border border-[#EFECE6]'
              }`}
            >
              <div className="w-full bg-[#FAF8F5] px-3 pt-3 pb-5 rounded-[2px] border border-[#EFECE6]">
                <div
                  className={`aspect-square bg-[#F2EFE9] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_4px_rgba(0,0,0,0.15)] ${
                    revealedMonster.rarity === 'EPIC'
                      ? 'epic-inner-shine'
                      : revealedMonster.rarity === 'RARE'
                        ? 'rare-inner-shine'
                        : ''
                  }`}
                >
                  {/* 원본 이미지 테두리를 가리기 위해 살짝 확대한다 */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={revealedMonster.imageUrl}
                    alt={revealedMonster.name}
                    className="w-full h-full object-cover scale-[1.18] reveal-in"
                  />

                  <span
                    className={`absolute top-2 left-2 z-10 text-[9px] font-black text-white px-2 py-0.5 rounded-md shadow-xs ${
                      RARITY_STYLE[revealedMonster.rarity] ?? 'bg-[#8F9A92]'
                    }`}
                  >
                    {revealedMonster.rarity}
                  </span>

                  {isNewMonster && (
                    <span className="absolute top-2 right-2 z-10 text-[9px] font-black text-white bg-[#C84B31] px-2 py-0.5 rounded-full shadow-xs">
                      NEW
                    </span>
                  )}

                  <div className="absolute bottom-2 left-2 right-2 z-10 flex gap-1 justify-start">
                    <span className="text-[9px] bg-black/50 backdrop-blur-md text-white rounded-md px-2 py-0.5 font-bold border border-white/20 shadow-xs">
                      {MATERIAL_LABEL[revealedMonster.material] ?? revealedMonster.material}
                    </span>
                    <span className="text-[9px] bg-black/50 backdrop-blur-md text-white rounded-md px-2 py-0.5 font-bold border border-white/20 shadow-xs">
                      {SHAPE_LABEL[revealedMonster.shape] ?? revealedMonster.shape}
                    </span>
                  </div>
                </div>

                <div className="pt-3 text-center">
                  <p className="font-black text-[#1B1B1B] text-lg tracking-tight">
                    {revealedMonster.name}
                  </p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => router.push('/collections')}
              className="w-full mt-3 py-3 bg-[#1F4B3C] text-white font-bold text-xs rounded-full active:scale-95 transition-transform shadow-lg cursor-pointer"
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

        /* reveal 최종 scale은 이미지의 기본 scale(1.18)과 맞춘다 */
        .reveal-in { animation: revealIn 1s ease-out forwards; }
        @keyframes revealIn {
          from { opacity: 0; filter: blur(12px); transform: scale(1.3); }
          to   { opacity: 1; filter: blur(0); transform: scale(1.18); }
        }

        .card-in { animation: cardPop 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
        @keyframes cardPop {
          0%   { opacity: 0; transform: scale(0.85) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }

        .rare-silver {
          background: linear-gradient(135deg, #a8b8cc 0%, #e8eef5 50%, #8fa5bc 100%);
        }
        .rare-inner-shine { position: relative; overflow: hidden; }
        .rare-inner-shine::after {
          content: '';
          position: absolute;
          top: -50%; left: -50%;
          width: 200%; height: 200%;
          background: linear-gradient(
            60deg,
            transparent 35%,
            rgba(210, 230, 255, 0.5) 50%,
            transparent 65%
          );
          animation: shimmer 1.5s ease-in-out infinite;
        }

        .epic-gold-shimmer {
          background: linear-gradient(135deg, #d4af37 0%, #fff8e7 50%, #aa771c 100%);
        }
        .epic-inner-shine { position: relative; overflow: hidden; }
        .epic-inner-shine::after {
          content: '';
          position: absolute;
          top: -50%; left: -50%;
          width: 200%; height: 200%;
          background: linear-gradient(
            60deg,
            transparent 25%,
            rgba(255, 225, 100, 0.6) 40%,
            rgba(255, 255, 255, 0.8) 50%,
            rgba(255, 180, 0, 0.6) 60%,
            transparent 75%
          );
          animation: shimmer 1.1s ease-in-out infinite;
        }

        @keyframes shimmer {
          0%   { transform: translateX(-100%) translateY(-100%); }
          100% { transform: translateX(100%) translateY(100%); }
        }

        @media (prefers-reduced-motion: reduce) {
          .printing-loop, .print-done, .fade-up, .reveal-pop, .reveal-in, .card-in,
          .rare-inner-shine::after, .epic-inner-shine::after {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}