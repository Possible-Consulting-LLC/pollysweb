import Link from 'next/link';
/** No auth/state reads: must render even when the database is unavailable. */
export default function MaintenancePage() {
  return <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-5 px-6 py-12">
    <h1 className="font-[family-name:var(--font-display)] text-4xl">We’ll be back soon</h1>
    <p>Polly&apos;s Web is temporarily unavailable. Please leave any unsaved entries open and try again after the site reopens.</p>
    <Link href="/" className="underline">Check again</Link>
    <Link href="/login" className="underline">Administrator sign in</Link>
    <nav className="flex gap-4 text-sm"><Link href="/legal/privacy-policy">Privacy</Link><Link href="/legal/terms-of-service">Terms</Link><Link href="/legal/data-deletion">Data deletion</Link></nav>
  </main>;
}
