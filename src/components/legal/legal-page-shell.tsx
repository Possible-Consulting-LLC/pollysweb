import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand/logo";

export function LegalPageShell({
  title,
  intro,
  children,
}: {
  title: string;
  intro: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto min-h-dvh w-full max-w-4xl px-5 pb-16 pt-6 sm:px-8">
      <nav className="flex items-center justify-between gap-4" aria-label="Legal pages">
        <BrandLogo href="/" size="header" />
        <Link href="/" className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--plum)] hover:bg-[var(--hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]">
          Home
        </Link>
      </nav>

      <header className="mt-10 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] px-6 py-8 shadow-[0_8px_30px_var(--shadow)] sm:px-10 sm:py-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--plum)]">Spoodly Space</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold leading-tight text-[var(--midnight)] sm:text-5xl">{title}</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--midnight)]/75">{intro}</p>
        <p className="mt-4 text-sm text-[var(--midnight)]/60">Effective September 16, 2026</p>
      </header>

      <article className="mt-6 space-y-8 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] px-6 py-8 text-[var(--midnight)] shadow-[0_8px_30px_var(--shadow)] sm:px-10 sm:py-10 [&_a]:font-semibold [&_a]:text-[var(--plum)] [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-3 [&_h2]:font-[family-name:var(--font-display)] [&_h2]:text-2xl [&_h2]:font-semibold [&_p]:leading-7 [&_ul]:ml-5 [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:leading-7">
        {children}
      </article>

      <footer className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--plum)]/10 pt-6 text-sm text-[var(--midnight)]/65">
        <span>© {new Date().getFullYear()} Spoodly Space</span>
        <div className="flex gap-5">
          <Link href="/privacy" className="hover:text-[var(--plum)]">Privacy Policy</Link>
          <Link href="/terms" className="hover:text-[var(--plum)]">Terms &amp; Conditions</Link>
        </div>
      </footer>
    </main>
  );
}
