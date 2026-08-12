'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CSSProperties } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Camera, Footprints } from 'lucide-react';
import { Noto_Sans_KR } from 'next/font/google';

const notoSans = Noto_Sans_KR({ subsets: ['latin'], weight: ['400', '500', '700', '900'] });

type Tab = 'capture' | 'developing';
type CaptureStep = 'idle' | 'scanning';

// 응답이 인화 애니메이션보다 빨리 오면 사진이 나오는 도중에 결과가 표시되므로,
// 애니메이션이 끝날 때까지는 기다린다
const MIN_DEVELOP_MS = 2600;

// 얼굴/화면 거부(20001, 20002)도 HTTP 200으로 오기 때문에
// res.ok가 아니라 code 값으로 성공 여부를 판단해야 한다 (lib/api/response.ts)
const CODE_OK = 20000;
const CODE_EGG_SLOT_FULL = 40900;

// 서버 VLM 타임아웃(lib/vlm.ts의 VLM_TIMEOUT_MS = 15초)에 네트워크 여유를 더한 값
const REQUEST_TIMEOUT_MS = 20000;

// 회의 결과 현행 기준(1280px, 85%)을 우선 적용
const MAX_IMAGE_EDGE = 1280;
const JPEG_QUALITY = 0.85;

// 인화 대기 상한 (lib/eggs.ts의 MAX_ACTIVE_EGGS)
const MAX_EGG_SLOTS = 3;

// TODO: 가속도계 기반 측정 구현 후 제거 여부 결정.
// 회의 결과 MVP는 가속도계로 가되, 실내·미지원 환경 대비 수동 입력을 남겨둔다
const MANUAL_STEP_SMALL = 5;
const MANUAL_STEP_LARGE = 20;

// 걸음 수는 매번 보내지 않고 모아서 주기적으로 전송한다
const SYNC_INTERVAL_MS = 5000;

// 세션이 끊겨도 걸음이 유실되지 않도록 로컬에 보관할 때 쓰는 키
const STEPS_STORAGE_PREFIX = 'monsnap:walk:';

// 사진을 꺼내는 연출 길이 (아래 CSS와 맞춰야 한다)
const REVEAL_ANIMATION_MS = 2400;

// GET /api/eggs 응답 형식
type Egg = {
  eggId: string;
  status: string;                      // INCUBATING | READY
  currentSteps: number;
  requiredSteps: number;
  activeWalkSessionId: string | null;  // 진행 중인 걷기 세션이 없으면 null
};

// POST /api/eggs/{eggId}/hatch 응답의 monster 부분
type RevealedMonster = {
  id: string;
  name: string;
  rarity: string;
  material: string;
  shape: string;
  imageUrl: string;
};

// 서버는 영문 코드로 주기 때문에 화면에 보여줄 한글로 변환한다 (lib/schemas/vlm.ts 기준)
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

// 아직 공개되지 않은 몬스터를 나타내는 실루엣
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

  // ───────── 촬영 상태 ─────────
  const [captureStep, setCaptureStep] = useState<CaptureStep>('idle');
  const [isScanDone, setIsScanDone] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [isSlotFull, setIsSlotFull] = useState(false);
  const [newEggSteps, setNewEggSteps] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // ───────── 인화 대기 상태 ─────────
  const [eggs, setEggs] = useState<Egg[]>([]);
  const [selectedEggId, setSelectedEggId] = useState<string | null>(null);
  const [eggsLoading, setEggsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [eggError, setEggError] = useState<string | null>(null);
  const [isRevealing, setIsRevealing] = useState(false);
  const [revealedMonster, setRevealedMonster] = useState<RevealedMonster | null>(null);
  const [isNewMonster, setIsNewMonster] = useState(false);

  // 이번 세션에서 쌓은 걸음 수. 전송 실패해도 값이 남도록 useRef로 관리한다
  const localStepsRef = useRef(0);
  const lastSentRef = useRef(0);
  const [sessionSteps, setSessionSteps] = useState(0);

  const currentEgg = eggs.find((e) => e.eggId === selectedEggId) ?? null;
  const isWalking = currentEgg?.activeWalkSessionId != null;
  const isReadyToReveal = currentEgg?.status === 'READY';
  const activeSessionId = currentEgg?.activeWalkSessionId ?? null;

  // ───────── 인화 대기 목록 조회 ─────────
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

  /**
   * 진행 중인 세션의 걸음 수를 로컬에서 복원한다.
   * 앱을 껐다 켜거나 새로고침해도 아직 전송하지 못한 걸음이 남아 있게 한다.
   */
  useEffect(() => {
    if (!activeSessionId) {
      localStepsRef.current = 0;
      lastSentRef.current = 0;
      setSessionSteps(0);
      return;
    }

    const saved = Number(localStorage.getItem(STEPS_STORAGE_PREFIX + activeSessionId) ?? 0);
    localStepsRef.current = Number.isFinite(saved) ? saved : 0;
    lastSentRef.current = 0; // 저장된 값을 다시 보내도 서버가 누적 기준으로 처리한다
    setSessionSteps(localStepsRef.current);
  }, [activeSessionId]);

  // ───────── 걸음 수 서버 전송 ─────────
  // 누적값을 보내므로 한 번 실패해도 다음 주기에 복구된다
  const syncSteps = useCallback(async () => {
    if (!currentEgg?.activeWalkSessionId) return;

    const steps = localStepsRef.current;
    // 서버는 이전보다 작은 값을 거부하므로(STEP_COUNT_REGRESSED) 늘어났을 때만 보낸다
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

      // 서버가 계산한 값으로 맞춘다 (목표 초과분은 서버가 잘라줌)
      const egg = body.data?.egg;
      if (egg) {
        setEggs((prev) =>
          prev.map((e) =>
            e.eggId === egg.id ? { ...e, currentSteps: egg.currentSteps, status: egg.status } : e
          )
        );
      }
    } catch {
      // 전송에 실패해도 로컬 값은 유지되므로 다음 주기에 재시도된다
    }
  }, [currentEgg]);

  /**
   * 걸음이 늘어나면 화면을 먼저 갱신하고 로컬에 저장한다.
   * 서버 전송은 주기적으로 이뤄지지만, 목표에 도달한 순간에는
   * 확인 버튼이 늦게 나타나지 않도록 바로 전송한다.
   */
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

  /**
   * 다른 앱으로 나가거나 화면이 꺼지면 브라우저가 타이머를 멈춘다.
   * 나가기 직전에 한 번 전송해 아직 못 보낸 걸음이 유실되지 않게 한다.
   */
  useEffect(() => {
    if (!isWalking) return;

    const handleVisibilityChange = () => {
      if (document.hidden) void syncSteps();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [isWalking, syncSteps]);

  // ───────── 촬영 ─────────
  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 브라우저는 파일 값이 바뀔 때만 onChange를 발생시킨다
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
      formData.append('image', uploadFile); // 서버가 기대하는 필드명 (app/api/scans/route.ts)

      const res = await fetch('/api/scans', {
        method: 'POST',
        body: formData, // FormData는 Content-Type을 브라우저가 자동으로 넣는다
        signal: controller.signal,
      });

      // 서버가 다운되면 JSON이 아닌 응답이 올 수 있어, 파싱 실패 시 null로 둔다
      const body = await res.json().catch(() => null);

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_DEVELOP_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_DEVELOP_MS - elapsed));
      }

      // 거부 응답도 HTTP 200이므로 code가 정확히 OK일 때만 통과시킨다
      if (!res.ok || body?.code !== CODE_OK) {
        // 보관함 초과는 사용자가 할 수 있는 조치가 있어(인화 완료하기) 따로 구분한다
        setIsSlotFull(body?.code === CODE_EGG_SLOT_FULL);
        // 안내 문구는 서버가 내려준 message를 우선 사용하고,
        // 뒤의 문구는 응답 자체를 읽지 못한 경우에만 쓰이는 대비용이다
        setScanError(body?.message ?? '스캔에 실패했어요. 다시 시도해주세요.');
        setCaptureStep('idle');
        return;
      }

      setNewEggSteps(body.data?.requiredSteps ?? null);
      setIsScanDone(true);
      await loadEggs();
    } catch (err) {
      // 시간 초과로 직접 끊은 경우와 그 외 네트워크 오류를 구분해 안내한다
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

  // ───────── 걷기 시작 ─────────
  // 유저당 진행 중인 세션은 하나만 허용되므로, 다른 사진이 진행 중이면 서버가 막는다
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

      // 새 세션이므로 세션 걸음 수를 초기화한다 (누적 진행률은 서버가 관리)
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

  // ───────── 걷기 종료 ─────────
  // 목표를 채우지 않아도 종료할 수 있고, 진행률은 그대로 남는다
  const handleEnd = async () => {
    if (!currentEgg?.activeWalkSessionId || busy) return;
    setBusy(true);
    setEggError(null);

    const sessionId = currentEgg.activeWalkSessionId;
    await syncSteps(); // 종료 전에 쌓인 걸음을 마지막으로 보낸다

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

  // ───────── 인화 완료 (몬스터 확인) ─────────
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

      // 응답이 먼저 와도 연출이 끝날 때까지 기다린다
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

  // 걷기 진행률이 곧 사진이 현상된 정도가 된다
  const progressPercent = currentEgg
    ? Math.min(100, Math.round((currentEgg.currentSteps / currentEgg.requiredSteps) * 100))
    : 0;

  // 진행률에 따라 흐림과 채도를 조절해 사진이 서서히 드러나게 한다
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
                tab === key ? 'bg-white text-[#1F4B3C] shadow-sm' : 'bg-white/40 text-[#8A9A8E]'
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

                {/* min-h-0이 없으면 자식 크기만큼 늘어나 화면을 넘겨버린다 */}
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

                {scanError && (
                  <div className="mt-3 shrink-0">
                    <p className="text-sm text-[#C0503D] bg-[#FBEAE7] rounded-xl px-4 py-3 text-center leading-relaxed">
                      {scanError}
                    </p>
                    {/* 보관함은 인화를 마쳐야 비므로, 인화 대기 탭으로 안내한다 */}
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
              // 스캔 중에는 인쇄 모션을 반복하고, 분석이 끝나면 슬롯 밖으로 정착시킨다
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
                      {/* 촬영한 이미지는 화면에 남기지 않는다 (Zero-Storage) */}
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
                      {/* 필요한 걸음 수는 희귀도마다 다르므로 서버가 준 값을 그대로 보여준다 */}
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
                {/* 폴라로이드. 걸을수록 흐림이 걷히며 사진이 드러난다 */}
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
                  <div className={`w-56 shrink-0 ${isRevealing ? 'reveal-pop' : ''}`}>
                    <div className="bg-[#FAF8F5] shadow-[0_12px_28px_-6px_rgba(0,0,0,0.3)] px-3 pt-3 pb-10 rounded-[2px] border border-[#EFECE6]">
                      <div className="aspect-square bg-[#8FA396] overflow-hidden relative flex items-center justify-center rounded-[1px] shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
                        {/* TODO: GET /api/eggs 응답에 monster.imageUrl이 추가되면 실제 이미지로 교체.
                            팀 논의 결과 인화 중에도 실제 몬스터를 흐리게 노출하는 방향으로 결정 */}
                        <MonsterSilhouette
                          className="w-3/4 h-3/4 text-white/70 transition-all duration-700"
                          style={{ filter: `blur(${blurPx}px) grayscale(${grayscale}%)` }}
                        />

                        <div
                          className="absolute inset-0 bg-[#8FA396] transition-opacity duration-700"
                          style={{ opacity: veilOpacity }}
                        />

                        {/* 인화가 끝나기 전에는 잠금 상태를 표시한다 */}
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

                    {/* TODO: 가속도계 기반 측정 구현 후 제거 여부 결정.
                        실내·미지원 환경에서도 진행할 수 있도록 남겨둔 대체 수단 */}
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

      {/* ───────── 인화 완료 카드 ─────────
          잠금 상태였던 폴라로이드가 공개되는 흐름을 이어받는다.
          바깥을 눌러도 닫히지 않고 우상단 X로만 닫아 결과를 충분히 볼 수 있게 한다 */}
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
                {/* TODO: 몬스터 이미지에 폴라로이드 테두리가 포함되어 있어 확대해 잘라내고 있다.
                    테두리 없는 이미지로 교체되면 object-contain으로 바꾸고 scale 제거 */}
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
        /* 폴라로이드가 프린터 출구 위로 삐져나오지 않도록 잘라낸다 */
        .clip-window { clip-path: inset(0 -40px -40px -40px); }

        /* 분석 중에는 인쇄 모션을 반복해 대기 시간을 자연스럽게 채운다 */
        .printing-loop { animation: printMechanical 3.8s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
        @keyframes printMechanical {
          0%   { transform: translateY(-75%); }
          40%  { transform: translateY(-35%); } /* 지긋이 밀려 내려옴 */
          55%  { transform: translateY(-35%); } /* 잠시 멈춤 */
          85%  { transform: translateY(-65%); } /* 롤러 안으로 살짝 들어감 */
          100% { transform: translateY(-75%); }
        }

        /* 분석이 끝나면 슬롯 밖으로 밀려나와 정착한다 */
        .print-done { animation: printDone 2.2s cubic-bezier(0.16, 0.84, 0.28, 1) forwards; }
        @keyframes printDone {
          0%   { transform: translateY(-40%); }
          75%  { transform: translateY(1.5%); }  /* 살짝 지나쳤다가 */
          88%  { transform: translateY(-0.5%); } /* 되돌아오는 관성 */
          100% { transform: translateY(0); }
        }

        .fade-up { animation: fadeUp 0.5s ease-out forwards; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* 사진을 꺼낼 때 폴라로이드가 살짝 커졌다 돌아온다 */
        .reveal-pop { animation: revealPop 2.4s ease-in-out forwards; }
        @keyframes revealPop {
          0%   { transform: scale(1); }
          30%  { transform: scale(1.03); }
          60%  { transform: scale(1.01); }
          100% { transform: scale(1); }
        }

        /* 결과 카드 속 몬스터가 흐릿한 상태에서 서서히 드러난다 */
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

        /* 화면 움직임에 민감한 사용자를 위해 애니메이션을 끈다 */
        @media (prefers-reduced-motion: reduce) {
          .printing-loop, .print-done, .fade-up, .reveal-pop, .reveal-in, .card-in { animation: none; }
        }
      `}</style>
    </div>
  );
}