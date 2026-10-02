import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Heart, Sparkles } from "lucide-react";
import { listGuides, GUIDE_CATEGORIES } from "@/lib/content/care-guides";

const CARD_ART: Record<string, { gradient: string; emoji: string }> = {
  feeding: { gradient: "from-orange-100/90 to-amber-50", emoji: "🕷️" },
  water: { gradient: "from-sky-100/90 to-cyan-50", emoji: "💧" },
  molting: { gradient: "from-[var(--lavender)]/70 to-purple-50", emoji: "🌙" },
  handling: { gradient: "from-pink-100/90 to-rose-50", emoji: "🤍" },
  habitat: { gradient: "from-emerald-100/90 to-lime-50", emoji: "🏡" },
  cleaning: { gradient: "from-teal-100/90 to-cyan-50", emoji: "✨" },
  "life-stages": { gradient: "from-lime-100/90 to-green-50", emoji: "🌱" },
  health: { gradient: "from-red-100/90 to-orange-50", emoji: "➕" },
  "species-profiles": { gradient: "from-[var(--lavender)]/60 to-sky-50", emoji: "📚" },
};

export const metadata: Metadata = {
  title: "Care Guides | Polly's Web",
  description: "Easy-to-follow, expert-backed jumping spider care guides — from setup to species.",
};

const firstSteps = [
  {
    number: 1,
    title: "Set Up a Habitat",
    body: "Learn what your spood needs to feel at home.",
    href: "/care-guides/habitat",
  },
  {
    number: 2,
    title: "Learn Feeding Basics",
    body: "Find out what to feed and how often.",
    href: "/care-guides/feeding",
  },
  {
    number: 3,
    title: "Understand Molting",
    body: "Know what to expect and how to help.",
    href: "/care-guides/molting",
  },
];

const categoryIndex = new Map(GUIDE_CATEGORIES.map((category, index) => [category.key, index]));

export default function CareGuidesPage() {
  const guides = [...listGuides()].sort(
    (a, b) => (categoryIndex.get(a.category) ?? 99) - (categoryIndex.get(b.category) ?? 99),
  );

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--lavender)]/55 via-[var(--cream)] to-orange-100/50">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">
              Trusted guides. Happier spoods.
            </p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
              Care Guides for Every Step of the Spood Journey
              <Heart className="ml-2 inline h-8 w-8 text-orange-500" aria-hidden />
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--midnight)]/70">
              Easy-to-follow, expert-backed guides to help you give your jumping spiders the best care possible. From
              setup to species, we&apos;re here for every step of your spood journey.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="#guides"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] transition hover:bg-orange-600"
              >
                Browse Guides
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-full border border-[var(--midnight)]/20 bg-[var(--card-solid)] px-7 py-3.5 text-base font-bold text-[var(--midnight)] transition hover:bg-[var(--hover)]"
              >
                Start Free
              </Link>
            </div>
          </div>
          <div className="relative">
            <div
              role="img"
              aria-label="Illustration of the Polly's Web mascot with jumping spiders"
              className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--lavender)]/60 via-[var(--cream)] to-orange-100/70"
            >
              <span aria-hidden className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[var(--lavender)]/50 blur-2xl" />
              <span className="text-6xl" aria-hidden>
                🕷️
              </span>
              <span className="absolute bottom-3 right-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--midnight)]/40">
                Guides hero illustration
              </span>
            </div>
            <p
              aria-hidden
              className="absolute -right-1 top-2 rotate-6 font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]/80 sm:right-3"
            >
              Knowledge Creates Happier Spoods ♡
            </p>
          </div>
        </div>
      </section>

      {/* Guides grid */}
      <section id="guides" aria-label="Care guides" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Explore our guides</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-5xl">
            Everything You Need to Care for Happy, Healthy Jumpers
          </h2>
          <p className="mt-4 text-lg text-[var(--midnight)]/65">
            Clear, practical guides on all the essentials, written for spood lovers, by spood lovers.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {guides.map((guide) => {
            const art = CARD_ART[guide.category] ?? CARD_ART.feeding;
            return (
              <Link
                key={guide.slug}
                href={`/care-guides/${guide.slug}`}
                className="group flex flex-col overflow-hidden rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] shadow-[0_8px_30px_var(--shadow)] transition hover:border-[var(--plum)]/25"
              >
                <span aria-hidden className={`flex h-24 items-center justify-center bg-gradient-to-br text-3xl ${art.gradient}`}>
                  {art.emoji}
                </span>
                <span className="flex flex-1 flex-col p-5">
                  <span className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                    {guide.title}
                  </span>
                  <span className="mt-2 flex-1 text-sm leading-6 text-[var(--midnight)]/65">{guide.excerpt}</span>
                  <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--plum)] transition group-hover:gap-2">
                    Read Guide <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* Start here */}
      <section aria-label="New to jumping spiders" className="border-y border-[var(--plum)]/10 bg-[var(--card)]">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">New to jumping spiders?</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.02em] text-[var(--plum-deep)]">
              Start Here: Your First 3 Steps
            </h2>
            <p className="mt-4 max-w-md text-lg text-[var(--midnight)]/65">
              New to spoods? These beginner guides will help you get set up with confidence and start your journey on
              the right foot.
            </p>
            <Link
              href="/care-guides/feeding"
              className="mt-7 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--plum)] px-7 py-3.5 text-base font-bold text-[var(--on-accent)] shadow-[0_10px_28px_rgba(82,56,96,0.25)] transition hover:bg-[var(--plum-deep)]"
            >
              Start Learning
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
          <ol className="grid gap-4 sm:grid-cols-3">
            {firstSteps.map((step) => (
              <li key={step.number} className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--plum)] text-sm font-bold text-[var(--on-accent)]">
                  {step.number}
                </span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                  {step.title}
                </h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--midnight)]/60">{step.body}</p>
                <Link
                  href={step.href}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--plum)] transition hover:gap-2"
                >
                  Read Guide <ArrowRight className="h-4 w-4" aria-hidden />
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Community banner */}
      <section aria-label="Community" className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--lavender)]/25">
                <Sparkles className="h-6 w-6 text-[var(--lavender)]" aria-hidden />
              </span>
              <div>
                <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                  Learn Together. Care Better.
                </h2>
                <p className="mt-1 text-sm text-[var(--on-panel)]/75 sm:text-base">
                  Join a community of spood lovers, save your care notes, and get support every step of the way.
                </p>
              </div>
            </div>
            <Link
              href="/register"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
            >
              Get Started
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}