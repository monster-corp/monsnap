'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useRouter } from 'next/navigation';
import { Home } from 'lucide-react';

const BUTTON_SIZE = 48;
const EDGE_MARGIN = 12;

/**
 * BottomNav가 차지하는 영역.
 * 홈 버튼이 이 영역 안으로 내려가지 않도록 제한한다.
 */
const BOTTOM_NAV_RESERVED_HEIGHT = 88;

const DRAG_THRESHOLD = 5;

const STORAGE_KEY =
  'monsnap:home-button-position';

type Position = {
  x: number;
  y: number;
};

type HomeButtonProps = {
  hidden?: boolean;
};

function clamp(
  value: number,
  min: number,
  max: number
) {
  return Math.min(
    Math.max(value, min),
    max
  );
}

export default function HomeButton({
  hidden = false,
}: HomeButtonProps) {
  const router = useRouter();

  const [position, setPosition] =
    useState<Position | null>(null);

  const positionRef =
    useRef<Position | null>(null);

  const draggingRef = useRef(false);
  const movedRef = useRef(false);

  const pointerStartRef = useRef({
    x: 0,
    y: 0,
  });

  const buttonStartRef = useRef({
    x: 0,
    y: 0,
  });

  /**
   * 버튼이
   * - 화면 밖으로 나가지 않고
   * - BottomNav 영역으로 내려가지 않도록 제한한다.
   */
  const clampPosition = useCallback(
    (nextPosition: Position): Position => {
      const maxX = Math.max(
        EDGE_MARGIN,
        window.innerWidth -
          BUTTON_SIZE -
          EDGE_MARGIN
      );

      const maxY = Math.max(
        EDGE_MARGIN,
        window.innerHeight -
          BUTTON_SIZE -
          BOTTOM_NAV_RESERVED_HEIGHT -
          EDGE_MARGIN
      );

      return {
        x: clamp(
          nextPosition.x,
          EDGE_MARGIN,
          maxX
        ),

        y: clamp(
          nextPosition.y,
          EDGE_MARGIN,
          maxY
        ),
      };
    },
    []
  );

  /**
   * 최초 위치 설정.
   *
   * 저장된 위치가 있으면 복원하고,
   * 없으면 BottomNav 바로 위 왼쪽에서 시작한다.
   */
  useEffect(() => {
    const defaultPosition =
      clampPosition({
        x: 16,

        y:
          window.innerHeight -
          BUTTON_SIZE -
          BOTTOM_NAV_RESERVED_HEIGHT -
          16,
      });

    try {
      const saved =
        window.localStorage.getItem(
          STORAGE_KEY
        );

      if (saved) {
        const parsed =
          JSON.parse(saved) as Position;

        if (
          Number.isFinite(parsed.x) &&
          Number.isFinite(parsed.y)
        ) {
          /**
           * 이전에 저장된 위치가
           * 현재 화면 범위를 벗어나더라도
           * 자동으로 보정한다.
           */
          const restored =
            clampPosition(parsed);

          positionRef.current =
            restored;

          setPosition(restored);

          return;
        }
      }
    } catch (error) {
      console.warn(
        '[HomeButton] 저장된 위치를 불러오지 못했습니다.',
        error
      );
    }

    positionRef.current =
      defaultPosition;

    setPosition(defaultPosition);
  }, [clampPosition]);

  /**
   * 화면 회전 / 브라우저 크기 변경 시
   * 버튼이 화면이나 BottomNav 영역으로
   * 넘어가지 않도록 다시 보정한다.
   */
  useEffect(() => {
    const handleResize = () => {
      const current =
        positionRef.current;

      if (!current) {
        return;
      }

      const corrected =
        clampPosition(current);

      positionRef.current =
        corrected;

      setPosition(corrected);

      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(corrected)
        );
      } catch {
        // 저장 실패는 버튼 사용에 영향을 주지 않는다.
      }
    };

    window.addEventListener(
      'resize',
      handleResize
    );

    return () => {
      window.removeEventListener(
        'resize',
        handleResize
      );
    };
  }, [clampPosition]);

  const handlePointerDown = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!positionRef.current) {
      return;
    }

    draggingRef.current = true;
    movedRef.current = false;

    pointerStartRef.current = {
      x: event.clientX,
      y: event.clientY,
    };

    buttonStartRef.current = {
      ...positionRef.current,
    };

    event.currentTarget.setPointerCapture(
      event.pointerId
    );
  };

  const handlePointerMove = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!draggingRef.current) {
      return;
    }

    const deltaX =
      event.clientX -
      pointerStartRef.current.x;

    const deltaY =
      event.clientY -
      pointerStartRef.current.y;

    /**
     * 아주 작은 손떨림은 클릭으로 취급한다.
     */
    if (
      Math.abs(deltaX) >
        DRAG_THRESHOLD ||
      Math.abs(deltaY) >
        DRAG_THRESHOLD
    ) {
      movedRef.current = true;
    }

    if (!movedRef.current) {
      return;
    }

    const nextPosition =
      clampPosition({
        x:
          buttonStartRef.current.x +
          deltaX,

        y:
          buttonStartRef.current.y +
          deltaY,
      });

    positionRef.current =
      nextPosition;

    setPosition(nextPosition);
  };

  const handlePointerUp = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (!draggingRef.current) {
      return;
    }

    draggingRef.current = false;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }

    /**
     * 실제로 이동했다면 위치만 저장한다.
     * 홈 이동은 하지 않는다.
     */
    if (
      movedRef.current &&
      positionRef.current
    ) {
      try {
        window.localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify(
            positionRef.current
          )
        );
      } catch (error) {
        console.warn(
          '[HomeButton] 위치를 저장하지 못했습니다.',
          error
        );
      }

      return;
    }

    /**
     * 이동하지 않고 짧게 눌렀을 때만
     * 홈으로 이동한다.
     */
    router.push('/home');
  };

  const handlePointerCancel = (
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    draggingRef.current = false;
    movedRef.current = false;

    if (
      event.currentTarget.hasPointerCapture(
        event.pointerId
      )
    ) {
      event.currentTarget.releasePointerCapture(
        event.pointerId
      );
    }
  };

  if (hidden || !position) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="홈으로 이동"
      title="홈으로 이동"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={
        handlePointerCancel
      }
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        touchAction: 'none',
      }}
      className="
        fixed
        z-40
        flex
        h-12
        w-12
        cursor-grab
        items-center
        justify-center
        rounded-full
        border
        border-white/20
        bg-[#161A18]/90
        text-white
        shadow-[0_4px_14px_rgba(0,0,0,0.35)]
        backdrop-blur-md
        select-none
        active:cursor-grabbing
        active:scale-95
        [-webkit-tap-highlight-color:transparent]
      "
    >
      <Home
        size={21}
        strokeWidth={2.2}
      />
    </button>
  );
}