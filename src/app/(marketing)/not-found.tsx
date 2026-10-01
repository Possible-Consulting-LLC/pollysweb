import Link from "next/link";

export default function MarketingNotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-bold uppercase tracking-widest text-[var(--plum)]">Lost in the web</p>
      <h1 className="mt-3 font-serif text-4xl font-bold text-[var(--midnight)]">We couldn&apos;t find that page</h1>
      <p className="mt-3 text-[var(--midnight)]/70">
        The silk must have shifted. Try the home page, or reach out and we&apos;ll help you find your way.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href="/"
          className="rounded-full bg-[var(--plum)] px-5 py-2.5 text-sm font-semibold text-[var(--on-accent)] transition hover:bg-[var(--plum-deep)]"
        >
          Back to Home
        </Link>
        <Link
          href="/contact"
          className="rounded-full border border-[var(--plum)]/30 px-5 py-2.5 text-sm font-semibold text-[var(--plum)] transition hover:bg-[var(--hover)]"
        >
          Contact Us
        </Link>
      </div>
    </div>
  );
}