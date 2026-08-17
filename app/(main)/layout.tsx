'use client';

import {
  useEffect,
  useState,
} from 'react';
import { usePathname } from 'next/navigation';

import BottomNav from '@/components/BottomNav';
import HomeButton from '@/components/HomeButton';

const BOTTOM_NAV_VISIBILITY_EVENT =
  'monsnap:bottom-nav-visibility';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [
    isBottomNavHidden,
    setIsBottomNavHidden,
  ] = useState(false);

  /**
   * bosses/page.tsx에서 보내는
   * BottomNav 표시/숨김 이벤트를 받는다.
   */
  useEffect(() => {
    const handleBottomNavVisibility = (
      event: Event
    ) => {
      const customEvent =
        event as CustomEvent<{
          hidden: boolean;
        }>;

      setIsBottomNavHidden(
        customEvent.detail.hidden
      );
    };

    window.addEventListener(
      BOTTOM_NAV_VISIBILITY_EVENT,
      handleBottomNavVisibility
    );

    return () => {
      window.removeEventListener(
        BOTTOM_NAV_VISIBILITY_EVENT,
        handleBottomNavVisibility
      );
    };
  }, []);

  /**
   * 다른 페이지로 이동했을 때
   * 숨김 상태가 남지 않도록 복구한다.
   */
  useEffect(() => {
    setIsBottomNavHidden(false);
  }, [pathname]);

  /**
   * 홈 화면에서는
   * 홈 버튼 자체를 보여주지 않는다.
   */
  const isHomePage =
    pathname === '/home';

  return (
    // 화면 높이를 고정하고 바깥 스크롤을 막는다.
    // 배경색은 화면마다 다르므로 여기서 지정하지 않는다.
    <div className="relative h-[100svh] flex flex-col overflow-hidden">
      {/*
        공통 홈 버튼

        - 짧게 누르면 /home 이동
        - 드래그해서 위치 변경 가능
        - 위치는 localStorage에 저장
        - BottomNav 영역으로 이동 불가
        - /home에서는 숨김
        - 보스전 집중 모드에서는 숨김
      */}
      <HomeButton
        hidden={
          isBottomNavHidden ||
          isHomePage
        }
      />

      {/* min-h-0이 없으면 자식 크기만큼 늘어나 하단 바를 밀어낸다 */}
      <main className="flex-1 min-h-0 w-full">
        {children}
      </main>

      <BottomNav
        hidden={isBottomNavHidden}
      />
    </div>
  );
}