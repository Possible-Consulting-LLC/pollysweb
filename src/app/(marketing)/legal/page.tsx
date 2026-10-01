import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BookLock,
  Cookie,
  FileText,
  Gavel,
  Heart,
  LifeBuoy,
  Scale,
  ScrollText,
  ShieldCheck,
  Trash2,
  Users,
  Accessibility,
} from "lucide-react";
import { listLegalDocs } from "@/lib/content/legal";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Legal | Polly's Web",
  description: "Our policies, terms, and legal information — all in one place.",
};

const GRID_BLURBS: Record<string, string> = {
  "terms-of-service": "Rules for using Polly's Web.",
  "privacy-policy": "How we protect your information.",
  "cookie-policy": "Our use of cookies and similar technologies.",
  "community-guidelines": "Help keep our community kind and supportive.",
  "acceptable-use": "Permitted and prohibited uses of our platform.",
  copyright: "Our content, trademarks, and intellectual property.",
  disclaimer: "Important information and limitations.",
  "data-deletion": "How to request your data be deleted.",
  accessibility: "Our commitment to an inclusive experience.",
};

const GRID_ICONS: Record<string, typeof Scale> = {
  "terms-of-service": FileText,
  "privacy-policy": ShieldCheck,
  "cookie-policy": Cookie,
  "community-guidelines": Users,
  "acceptable-use": Gavel,
  copyright: Scale,
  disclaimer: ScrollText,
  "data-deletion": Trash2,
  accessibility: Accessibility,
};

export default function LegalHubPage() {
  const docs = listLegalDocs();
  const gridDocs = docs.filter((doc) => doc.slug !== "overview");

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--lavender)]/60 via-[var(--cream)] to-orange-100/60 px-6 py-12 sm:px-10">
        <span aria-hidden className="absolute -right-10 -top-14 h-48 w-48 rounded-full bg-[var(--lavender)]/60 blur-2xl" />
        <div className="relative grid items-center gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Legal</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold leading-tight tracking-[-0.02em] text-[var(--plum-deep)] sm:text-5xl">
              Transparency Builds a Brighter Web
              <Heart className="ml-2 inline h-7 w-7 text-orange-500" aria-hidden />
            </h1>
            <p className="mt-4 text-lg text-[var(--midnight)]/70">
              Our policies, terms, and legal information — all in one place.
            </p>
          </div>
          <div className="relative">
            <div
              role="img"
              aria-label="Illustration of a jumping spider resting on a leaf"
              className="flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-[var(--lavender)]/50 to-orange-100/70"
            >
              <span className="text-5xl" aria-hidden>
                🕷️
              </span>
              <span className="absolute bottom-3 right-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--midnight)]/40">
                Legal hero illustration
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="flex flex-col gap-4">
          <nav aria-label="Legal documents" className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 shadow-[0_8px_30px_var(--shadow)]">
            <ul className="space-y-1">
              {docs.map((doc) => (
                <li key={doc.slug}>
                  <Link
                    href={`/legal/${doc.slug}`}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-[var(--midnight)]/75 transition hover:bg-[var(--hover)] hover:text-[var(--plum)]"
                  >
                    <BookLock className="h-4 w-4 shrink-0 text-[var(--plum)]/70" aria-hidden />
                    {doc.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-5">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-pink-100">
              <LifeBuoy className="h-5 w-5 text-pink-500" aria-hidden />
            </span>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">Questions?</h2>
            <p className="mt-1 text-sm text-[var(--midnight)]/65">
              If you have any questions about our policies, please contact us.
            </p>
            <Link
              href="/contact"
              className="mt-4 inline-flex items-center justify-center rounded-full border border-[var(--plum)]/30 px-4 py-2 text-sm font-bold text-[var(--plum)] transition hover:bg-[var(--hover)]"
            >
              Contact Us <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden />
            </Link>
          </div>
        </aside>

        <div>
          <section aria-label="Our commitment" className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)] sm:p-8">
            <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">Our Commitment</h2>
            <p className="mt-3 leading-7 text-[var(--midnight)]/70">
              At {BRAND.name}, we believe in a safe, supportive, and transparent experience for all spood lovers. These
              legal policies outline how we collect and use information, your rights and responsibilities, and our
              commitment to your privacy and trust.
            </p>
            <p className="mt-3 leading-7 text-[var(--midnight)]/70">
              We encourage you to review the following documents. If you have any questions, we&apos;re always here to
              help.
            </p>
          </section>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {gridDocs.map((doc) => {
              const Icon = GRID_ICONS[doc.slug] ?? FileText;
              return (
                <Link
                  key={doc.slug}
                  href={`/legal/${doc.slug}`}
                  className="group flex flex-col rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)] transition hover:border-[var(--plum)]/25"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-[var(--lavender)]/70 text-[var(--plum)]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-base font-bold text-[var(--midnight)]">
                    {doc.title}
                  </h3>
                  <p className="mt-1 flex-1 text-sm text-[var(--midnight)]/60">{GRID_BLURBS[doc.slug]}</p>
                  <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--plum)] transition group-hover:gap-2">
                    Read <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}