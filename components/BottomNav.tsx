'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, Ghost, BookOpen, CheckSquare, Swords } from 'lucide-react';

// 요청하신 순서대로 정의: 촬영 -> 내 몬스터 -> 도감 -> 미션 -> 배틀
const NAV_ITEMS = [
  {
    label: '촬영',
    href: '/scans',
    icon: Camera,
  },
  {
    label: '내 몬스터',
    href: '/my-monsters', // 또는 설정하신 가방/내 몬스터 경로
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

export default function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#EAEFEA] px-2 py-2 select-none shadow-[0_-4px_16px_rgba(0,0,0,0.03)]">
      <div className="max-w-md mx-auto flex items-center justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex-1 flex flex-col items-center justify-center py-1 transition-all relative ${
                isActive ? 'text-[#1F4B3C]' : 'text-[#8A9A8E] hover:text-[#5B6D5F]'
              }`}
            >
              <div className="relative">
                <Icon size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              </div>
              <span className={`text-[10px] mt-1 tracking-tight ${isActive ? 'font-black' : 'font-medium'}`}>
                {item.label}
              </span>

              {/* 활성화 표시 점 */}
              {isActive && (
                <span className="w-1 h-1 bg-[#1F4B3C] rounded-full absolute -bottom-1" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
