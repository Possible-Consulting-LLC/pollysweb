"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function MarketingError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[marketing] render error", error);
  }, [error]);

  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-[var(--plum)]">Something went wrong</p>
      <h1 className="mt-3 font-serif text-4xl font-bold text-[var(--midnight)]">This page tangled its silk</h1>
      <p className="mt-3 text-[var(--midnight)]/70">An unexpected error occurred. You can retry, or head back home.</p>
      <div className="mt-8 flex gap-3">
        <button
          type="button"
          onClick={reset}
          className="rounded-full bg-[var(--plum)] px-5 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--plum-deep)]"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="rounded-full border border-[var(--plum)]/30 px-5 py-2.5 text-sm font-semibold text-[var(--plum)] transition hover:bg-[var(--hover)]"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}