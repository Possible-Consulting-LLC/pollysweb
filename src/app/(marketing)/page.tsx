import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CalendarDays,
  Camera,
  Heart,
  Leaf,
  Megaphone,
  Star,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";
import { existsSync } from "node:fs";
import path from "node:path";
import { getSessionUser } from "@/lib/session";
import { BRAND } from "@/lib/brand";
import { LandingAppPreview } from "@/components/landing/app-preview";
import { HeroArtPanel } from "@/components/marketing/hero-art";
import { SpiderGlyph } from "@/components/marketing/spider-glyph";

function hasHeroArt(): boolean {
  return existsSync(path.join(process.cwd(), "public", "images", "home-hero.png"));
}

export const metadata: Metadata = {
  title: "Polly's Web — Jumping spider care, all in one place",
  description:
    "Track jumping spider care, keep each spood's story, and celebrate shared care streaks and little milestones.",
};

const featureCards = [
  {
    icon: CalendarDays,
    iconClass: "text-orange-500 bg-orange-50",
    title: "Care Logs",
    body: "Track feedings, hydration, cleaning, handling and more.",
    link: "Keep Great Records",
  },
  {
    icon: Leaf,
    iconClass: "text-green-600 bg-green-50",
    title: "Molts & Growth",
    body: "Log molts and watch your spood's journey unfold.",
    link: "Track Progress",
  },
  {
    icon: Camera,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/60",
    title: "Photos & History",
    body: "Capture memories and build a visual timeline.",
    link: "Save the Moments",
  },
  {
    icon: BarChart3,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/60",
    title: "Dashboards",
    body: "Get a clear view of care, activity, and important dates.",
    link: "See the Big Picture",
  },
  {
    icon: BookOpen,
    iconClass: "text-orange-500 bg-orange-50",
    title: "Care Guides",
    body: "Trusted, easy-to-follow guides for happy, healthy jumpers.",
    link: "Learn & Grow",
  },
];

const valueProps = [
  {
    icon: Users,
    iconClass: "text-[var(--plum)]",
    title: "A Growing Community",
    body: "Spood lovers from around the world",
  },
  {
    icon: Star,
    iconClass: "text-[var(--plum)] fill-[var(--plum)]",
    title: "Happier, Healthier Spoods",
    body: "Better care. Brighter days.",
  },
  {
    icon: BookOpen,
    iconClass: "text-[var(--midnight)]",
    title: "Trusted Care Information",
    body: "Easy, reliable, and beginner-friendly",
  },
  {
    icon: Heart,
    iconClass: "text-orange-400 fill-orange-400",
    title: "Built with Love",
    body: "For spood keepers, by spood keepers",
  },
];

export default async function MarketingHomePage() {
  const user = await getSessionUser();
  if (user) redirect("/home");

  return (
    <>
      {/* Rebrand announcement */}
      <section
        aria-label="Announcement"
        className="mx-auto mt-6 w-full max-w-6xl rounded-2xl bg-[var(--lavender)]/45 px-5 py-4 sm:px-8"
      >
        <div className="flex flex-col items-center gap-3 text-center sm:flex-row sm:justify-center sm:gap-6 sm:text-left">
          <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] text-[var(--plum)]">
            <Megaphone className="h-5 w-5" aria-hidden />
            Coming Soon
          </p>
          <span aria-hidden className="hidden h-8 w-px bg-[var(--plum)]/20 sm:block" />
          <div>
            <p className="text-sm font-bold text-[var(--midnight)]">
              Polly&apos;s Web is joining the Proservability family!
            </p>
            <p className="text-sm text-[var(--midnight)]/70">
              A new name, the same spood-tacular care, and an even brighter future.
              <Heart className="ml-1 inline h-4 w-4 text-orange-500" aria-hidden />
            </p>
          </div>
        </div>
      </section>

      {/* Hero */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 pb-16 pt-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">
            Thoughtful care. Amazing jumpers.
          </p>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.02] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
            A Happier Home
            <br />
            for Every Spood
            <Heart className="ml-2 inline h-9 w-9 text-orange-500" aria-hidden />
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--midnight)]/70">
            {BRAND.name} helps you track, understand, and celebrate your jumping
            spiders with simple tools, helpful guides, and a supportive community.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-13 items-center justify-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] transition hover:bg-orange-600"
            >
              <Heart className="h-5 w-5 fill-white" aria-hidden />
              Get Started Free
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
            <Link
              href="/features"
              className="inline-flex items-center justify-center rounded-full border border-[var(--midnight)]/20 bg-[var(--card-solid)] px-7 py-3.5 text-base font-bold text-[var(--midnight)] transition hover:bg-[var(--hover)]"
            >
              See Features
            </Link>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[var(--midnight)]/70">
            <li className="inline-flex items-center gap-2">
              <Heart className="h-4 w-4 text-[var(--plum)]" aria-hidden /> Easy to use
            </li>
            <li className="inline-flex items-center gap-2">
              <SpiderGlyph className="h-4 w-4 text-[var(--plum)]" aria-hidden /> Built by spood lovers
            </li>
            <li className="inline-flex items-center gap-2">
              <Leaf className="h-4 w-4 text-green-600" aria-hidden /> Thoughtful care guides
            </li>
          </ul>
        </div>
        <div className="relative">
          <HeroArtPanel artExists={hasHeroArt()} />
        </div>
      </section>

      {/* Feature cards */}
      <section aria-label="Features" className="border-y border-[var(--plum)]/10 bg-[var(--card)]">
        <div className="mx-auto grid w-full max-w-6xl gap-4 px-5 py-14 sm:grid-cols-2 sm:px-8 lg:grid-cols-5">
          {featureCards.map(({ icon: Icon, iconClass, title, body, link }) => (
            <article
              key={title}
              className="flex flex-col rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-2xl ${iconClass}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-4 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                {title}
              </h3>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--midnight)]/65">{body}</p>
              <Link
                href="/features"
                className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[var(--plum)] transition hover:gap-2"
              >
                {link} <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* App preview */}
      <section className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-16 sm:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">
            Simple tools. Healthy, happy spoods.
          </p>
          <h2 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-bold leading-tight tracking-[-0.02em] text-[var(--plum-deep)] sm:text-5xl">
            Make Spood Care Easy (and More Fun)
          </h2>
          <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--midnight)]/70">
            Whether you&apos;re a first-time keeper or a seasoned spood parent,{" "}
            {BRAND.name} gives you everything you need to stay organized, learn
            more, and give your jumpers the best life possible.
          </p>
          <Link
            href="/features"
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[var(--plum)] px-7 py-3.5 text-base font-bold text-[var(--on-accent)] shadow-[0_10px_28px_rgba(82,56,96,0.25)] transition hover:bg-[var(--plum-deep)]"
          >
            Explore All Features
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>
        <div className="relative">
          <LandingAppPreview />
          <p
            aria-hidden
            className="absolute -right-2 top-0 rotate-6 font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]/80 sm:right-2"
          >
            Track, Learn, Care, Repeat ♡
          </p>
        </div>
      </section>

      {/* Community banner */}
      <section className="mx-auto w-full max-w-6xl px-5 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <span aria-hidden className="absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-[var(--lavender)]/15 blur-2xl" />
          <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div className="flex items-center gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-pink-500/25">
                <Heart className="h-6 w-6 fill-pink-400 text-pink-400" aria-hidden />
              </span>
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                  A Kinder, More Connected Spood Community
                </h3>
                <p className="mt-1 text-sm text-[var(--on-panel)]/75 sm:text-base">
                  Tips, support, and shared spood love — because spood keeping is better together.
                </p>
              </div>
            </div>
            <Link
              href="/register"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#3b2166] transition hover:bg-white/90"
            >
              Get Started
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>

      {/* Value props */}
      <section aria-label="Why Polly's Web" className="mx-auto grid w-full max-w-6xl gap-8 px-5 py-16 text-center sm:grid-cols-2 sm:px-8 lg:grid-cols-4">
        {valueProps.map(({ icon: Icon, iconClass, title, body }) => (
          <div key={title} className="flex flex-col items-center">
            <Icon className={`h-8 w-8 ${iconClass}`} aria-hidden />
            <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--midnight)]/60">{body}</p>
          </div>
        ))}
      </section>

      <div className="border-t border-[var(--plum)]/10 px-5 py-8 text-center sm:px-8">
        <p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]/70">
          <Heart className="h-4 w-4 fill-pink-400 text-pink-400" aria-hidden />
          Small Spoods. A Brighter World.
        </p>
      </div>
    </>
  );
}