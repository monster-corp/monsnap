import { redirect } from 'next/navigation';
import { getCurrentUserId } from '@/lib/auth';
import OnboardingClient from './OnboardingClient';

const EXISTING_USER_PATH = '/home';

export default async function HomePage() {
  const userId = await getCurrentUserId();

  if (userId !== null) {
    redirect(EXISTING_USER_PATH);
  }

  return <OnboardingClient />;
}