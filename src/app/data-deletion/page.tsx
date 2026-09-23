import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/db';
import { LegalPageShell } from '@/components/legal/legal-page-shell';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Data deletion | Spoodly Space', robots: { index: false, follow: false }, referrer: 'no-referrer' };

export default async function DataDeletionPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  let receipt: { status: string } | null = null;
  let unavailable = false;
  if (code && /^[a-f0-9]{48}$/.test(code)) {
    try { receipt = await prisma.facebookDeletionRequest.findUnique({ where: { confirmationCode: code }, select: { status: true } }); }
    catch { unavailable = true; }
  }
  return <LegalPageShell title="Data deletion" intro="Manage your sign-in connections or request removal of Facebook-provided information.">
    {code ? <section role="status">
      <h2>{receipt?.status === 'completed' ? 'Deletion completed' : receipt ? 'Request received' : unavailable ? 'Status temporarily unavailable' : 'Request not found'}</h2>
      {receipt?.status === 'completed' ? <p>The Facebook-provided data covered by this request has been removed. Your independently entered spoods, photos, and care history were retained.</p> : receipt ? <>
        <p>Your request is awaiting review. It has not been marked completed. We will remove Facebook-provided information while preserving your independently entered spoods, photos, and care history.</p>
        {receipt.status === 'needs_sign_in_method' ? <p>Facebook was your only usable sign-in method when this request arrived. Connect another method in <Link href="/settings">Settings</Link>, or contact support for help establishing access, before the connection can be removed.</p> : null}
        <p>Contact <a href="mailto:support@spoodlyspace.com">support@spoodlyspace.com</a> with your confirmation code for assistance. Keep this status link private.</p>
      </> : <p>{unavailable ? 'Please try again later.' : 'Check your confirmation link, or contact support with the confirmation code Facebook supplied.'}</p>}
    </section> : null}
    <section><h2>Disconnect a sign-in method</h2><p>Open <Link href="/settings">Settings → Sign-in methods</Link> to disconnect Google or Facebook. You must retain another connected, available provider or a verified email with a password. Disconnecting preserves your care journal and subscription; it does not delete your Google or Facebook account.</p></section>
    <section><h2>Facebook data deletion requests</h2><p>You can request deletion through Facebook’s app settings. Facebook sends us a signed request and provides a confirmation code and status link. Requests are reviewed because older accounts do not identify which profile fields came from Facebook. We do not delete independently entered spoods, photos, or care history as part of this request.</p></section>
    <section><h2>Delete your whole account</h2><p>For full Spoodly Space account deletion, email <a href="mailto:support@spoodlyspace.com">support@spoodlyspace.com</a> from the address on your account. We verify ownership before processing requests. Read our <Link href="/privacy#data-deletion">privacy policy</Link> for retention details.</p></section>
  </LegalPageShell>;
}
