import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth';
import OnboardingClient from './OnboardingClient';    

// TODO: "게임 내 기본 화면"이 확정되면 이 경로만 수정하면 됩니다
const HOME_PATH = '/scans';

export default async function HomePage() {
  const userId = await getCurrentUserId();

  // 유효한 세션이 있으면(=DB에 유저가 존재하면) 바로 게임 화면으로
  if (userId !== null) {
    redirect(HOME_PATH);
  }

  // 세션이 없으면 온보딩(인트로 → 닉네임) 화면
  return <OnboardingClient />;
}