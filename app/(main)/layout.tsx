import BottomNav from '@/components/BottomNav';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100svh] flex flex-col bg-[#F2F0E8] pb-16">
      {/* 본문 콘텐츠 */}
      <main className="flex-1 flex flex-col min-h-0">
        {children}
      </main>

      {/* 공통 하단 네비게이션 바 */}
      <BottomNav />
    </div>
  );
}