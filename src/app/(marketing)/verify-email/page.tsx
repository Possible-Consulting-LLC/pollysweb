import { guardMaintenance } from '@/lib/admin/maintenance-access';
import { redirect } from 'next/navigation';
import { VerifyEmailForm } from "@/components/auth/forms";
import { lookupEmailChallenge } from "@/lib/email-challenge";

export const metadata = { robots: { index: false, follow: false } };

export default async function VerifyEmailPage({ searchParams }: { searchParams?: Promise<{ token?: string }> }) {
  try { await guardMaintenance('read'); } catch { redirect('/maintenance'); }
  const { token } = searchParams ? await searchParams : {};
  const challenge = token ? await lookupEmailChallenge(token) : null;
  return <><meta name="referrer" content="no-referrer" /><VerifyEmailForm token={challenge ? token : undefined} purpose={challenge?.purpose} /></>;
}
