'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Camera,
  Ghost,
  BookOpen,
  CheckSquare,
  Swords,
} from 'lucide-react';

// 회의에서 정한 순서.
// 촬영 / 내 몬스터 / 도감 / 미션 / 배틀
const NAV_ITEMS = [
  {
    label: '촬영',
    href: '/scans',
    icon: Camera,
  },
  {
    label: '내 몬스터',
    href: '/my-monsters',
    icon: Ghost,
  },
  {
    label: '도감',
    href: '/collections',
    icon: BookOpen,
  },
  {
    label: '미션',
    href: '/missions',
    icon: CheckSquare,
  },
  {
    label: '배틀',
    href: '/bosses',
    icon: Swords,
  },
];

type BottomNavProps = {
  hidden?: boolean;
};

export default function BottomNav({
  hidden = false,
}: BottomNavProps) {
  const pathname = usePathname();

  /**
   * 보스전 집중 모드 등에서
   * BottomNav를 명시적으로 숨긴다.
   */
  if (hidden) {
    return null;
  }

  return (
    // layout이 flex column이므로 fixed 없이 shrink-0으로 자리를 차지한다.
    // 아래 여백은 아이폰 홈 인디케이터에 가리지 않도록 safe-area만큼 더한다.
    <nav className="shrink-0 w-full bg-white/95 backdrop-blur-md border-t border-[#EAEFEA] px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))] select-none shadow-[0_-4px_16px_rgba(0,0,0,0.03)] [-webkit-tap-highlight-color:transparent]">
      <div className="max-w-md mx-auto flex items-stretch">
        {NAV_ITEMS.map(
          ({ label, href, icon: Icon }) => {
            // 하위 경로에서도 해당 탭이 활성으로 보이게 한다.
            const isActive =
              pathname === href ||
              pathname.startsWith(
                `${href}/`
              );

            return (
              <Link
                key={href}
                href={href}
                className={`flex-1 flex flex-col items-center justify-center gap-1 py-1 transition-colors ${
                  isActive
                    ? 'text-[#1F4B3C]'
                    : 'text-[#8A9A8E]'
                }`}
              >
                <Icon
                  size={20}
                  strokeWidth={
                    isActive ? 2.3 : 1.8
                  }
                />

                <span
                  className={`text-[10px] leading-none tracking-tight ${
                    isActive
                      ? 'font-black'
                      : 'font-medium'
                  }`}
                >
                  {label}
                </span>
              </Link>
            );
          }
        )}
      </div>
    </nav>
  );
}