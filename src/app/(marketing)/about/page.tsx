import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BookOpen,
  Check,
  Heart,
  Leaf,
  Star,
  Users,
} from "lucide-react";
import { BRAND, BRAND_LOGO_SRC } from "@/lib/brand";
import { existsSync } from "node:fs";
import path from "node:path";
import { HeroArtPanel } from "@/components/marketing/hero-art";
import { SpiderGlyph } from "@/components/marketing/spider-glyph";
import { LandingAppPreview } from "@/components/landing/app-preview";

export const metadata: Metadata = {
  title: "About | Polly's Web",
  description: "Helping jumping spider keepers care, learn, and connect — now the Polly's Web story.",
};

function hasHeroArt(): boolean {
  return existsSync(path.join(process.cwd(), "public", "images", "home-hero.png"));
}

const values = [
  {
    icon: Leaf,
    iconClass: "text-green-600 bg-green-50",
    title: "Thoughtful Care",
    body: "We believe every spood deserves a safe, healthy, and enriching home.",
  },
  {
    icon: BookOpen,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Clear Guidance",
    body: "We make reliable information easy to find and easy to understand.",
  },
  {
    icon: Users,
    iconClass: "text-pink-500 bg-pink-50",
    title: "Community First",
    body: "We bring spood lovers together to share, support, and celebrate.",
  },
  {
    icon: Star,
    iconClass: "text-orange-400 fill-orange-400 bg-orange-50",
    title: "Joyful Learning",
    body: "We believe caring for jumping spiders should be rewarding, fun, and full of wonder.",
  },
];

const differences = [
  "Beginner-friendly and easy to use",
  "Practical tools for real life spood care",
  "A supportive community that celebrates all keepers",
];

const team = [
  {
    title: "Spood Lovers",
    body: "Enthusiasts, keepers, and dreamers like you.",
    emoji: "🕷️",
    gradient: "from-[var(--lavender)]/70 to-purple-100",
  },
  {
    title: "Care Guide Writers",
    body: "Researching and sharing trusted information.",
    emoji: "📖",
    gradient: "from-orange-100 to-amber-100",
  },
  {
    title: "Community Builders",
    body: "Creating a welcoming space for all spood lovers.",
    emoji: "🌿",
    gradient: "from-emerald-100 to-lime-100",
  },
];

export default function AboutPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--lavender)]/55 via-[var(--cream)] to-orange-100/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">
              Same mission. Brighter days ahead.
            </p>
            <h1 className="mt-4 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
              About {BRAND.name}
              <Heart className="ml-2 inline h-8 w-8 text-orange-500" aria-hidden />
            </h1>
            <p className="mt-4 text-xl font-semibold text-[var(--midnight)]">
              Helping jumping spider keepers care, learn, and connect.
            </p>
            <p className="mt-3 max-w-xl text-lg leading-8 text-[var(--midnight)]/70">
              {BRAND.name} is a friendly, all-in-one platform for spood lovers. We provide simple tools, trusted
              guidance, and a supportive community to help you give your jumping spiders the best life possible.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] transition hover:bg-orange-600"
              >
                <Heart className="h-5 w-5 fill-white" aria-hidden />
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="/features"
                className="inline-flex items-center justify-center rounded-full border border-[var(--midnight)]/20 bg-[var(--card-solid)] px-7 py-3.5 text-base font-bold text-[var(--midnight)] transition hover:bg-[var(--hover)]"
              >
                Explore Features
              </Link>
            </div>
            <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[var(--midnight)]/70">
              <li className="inline-flex items-center gap-2">
                <SpiderGlyph className="h-4 w-4 text-[var(--plum)]" aria-hidden /> Built by spood lovers
              </li>
              <li className="inline-flex items-center gap-2">
                <Leaf className="h-4 w-4 text-green-600" aria-hidden /> Trusted care information
              </li>
              <li className="inline-flex items-center gap-2">
                <Heart className="h-4 w-4 fill-[var(--plum)] text-[var(--plum)]" aria-hidden /> A kinder, more connected community
              </li>
            </ul>
          </div>
          <div>
            <HeroArtPanel artExists={hasHeroArt()} label="About hero illustration" />
          </div>
        </div>
      </section>

      {/* Our story */}
      <section aria-label="Our story" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-8 rounded-[2rem] bg-[var(--lavender)]/30 p-6 sm:p-10 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Our story</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-4xl">
              Spoodly Space is now {BRAND.name}!
            </h2>
            <p className="mt-4 leading-7 text-[var(--midnight)]/70">
              We&apos;re so excited to share that Spoodly Space is joining the <strong>Proservability</strong> family
              and becoming <strong>{BRAND.name}</strong>. While our name is new, our mission remains the same — to
              help jumping spider keepers track care, learn confidently, and celebrate their spoods.
            </p>
            <p className="mt-3 leading-7 text-[var(--midnight)]/70">
              As part of Proservability, we&apos;re able to bring an even brighter future, with more resources, new
              features, and a growing community — all while staying true to what makes this community so special: a
              love for jumping spiders.
            </p>
          </div>
          <div className="relative">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-4">
              <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 text-center shadow-[0_8px_30px_var(--shadow)]">
                <Image src="/brand/spoodly-logo-mark.png" alt="Spoodly Space logo" width={96} height={96} className="mx-auto h-16 w-auto object-contain" />
                <p className="mt-2 text-sm font-bold text-[var(--midnight)]">Spoodly Space</p>
                <p className="mt-1 text-xs text-[var(--midnight)]/55">A special beginning</p>
              </div>
              <ArrowRight className="h-6 w-6 shrink-0 text-[var(--plum)]" aria-hidden />
              <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 text-center shadow-[0_8px_30px_var(--shadow)]">
                <Image src={BRAND_LOGO_SRC} alt="Polly's Web logo" width={120} height={96} className="mx-auto h-16 w-auto object-contain" />
                <p className="mt-2 text-sm font-bold text-[var(--midnight)]">{BRAND.name}</p>
                <p className="mt-1 text-xs text-[var(--midnight)]/55">A brighter future</p>
              </div>
            </div>
            <p
              aria-hidden
              className="mt-4 text-center font-[family-name:var(--font-display)] text-base italic text-[var(--plum)]/80"
            >
              A new chapter for the same spood-tacular mission ♡
            </p>
          </div>
        </div>
      </section>

      {/* Mission & values */}
      <section aria-label="Mission and values" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Our mission &amp; values</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-4xl">
              A Kinder, Happier Spood Community
            </h2>
          </div>
          <p className="text-[var(--midnight)]/65">
            Everything we do is guided by a simple belief: jumping spiders deserve thoughtful care, and spood lovers
            deserve a supportive, welcoming community.
          </p>
        </div>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {values.map(({ icon: Icon, iconClass, title, body }) => (
            <article key={title} className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]">
              <span className={`grid h-10 w-10 place-items-center rounded-2xl ${iconClass}`}>
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-[var(--midnight)]/65">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* What makes us different */}
      <section aria-label="What makes us different" className="border-y border-[var(--plum)]/10 bg-[var(--card)]">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-2">
          <div className="relative order-2 lg:order-1">
            <div
              role="img"
              aria-label="Illustration of the mascot hugging a heart"
              className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-pink-100/80 via-[var(--cream)] to-[var(--lavender)]/60"
            >
              <span className="text-6xl" aria-hidden>
                🧡
              </span>
              <span className="absolute bottom-3 right-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--midnight)]/40">
                Mascot illustration
              </span>
            </div>
            <p
              aria-hidden
              className="absolute -left-1 top-2 -rotate-6 font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]/80 sm:left-3"
            >
              Spood Love Brings Us Together ♡
            </p>
          </div>
          <div className="order-1 lg:order-2">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">What makes us different</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-4xl">
              Made by Spood Lovers, for Spood Lovers
            </h2>
            <p className="mt-4 leading-7 text-[var(--midnight)]/70">
              We know what it&apos;s like to fall in love with these amazing little creatures. {BRAND.name} is built
              by people who are passionate about jumping spiders and who want to make spood care less overwhelming
              and more joyful.
            </p>
            <ul className="mt-5 space-y-3">
              {differences.map((item) => (
                <li key={item} className="inline-flex items-start gap-2.5 text-[var(--midnight)]/75">
                  <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600" aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-8 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 shadow-[0_8px_30px_var(--shadow)]">
              <LandingAppPreview />
              <p className="mt-3 text-center font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]">
                &ldquo;Happier spoods, brighter days.&rdquo;
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Team */}
      <section aria-label="Team" className="mx-auto w-full max-w-6xl px-5 py-14 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">A small, passionate team</p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-4xl">
              Real People. A Shared Passion.
            </h2>
            <p className="mt-4 leading-7 text-[var(--midnight)]/70">
              {BRAND.name} is built by a small, dedicated team of spood lovers, care guide writers, community
              builders, and creatives who believe in a kinder, more informed world for jumping spider keepers.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {team.map(({ emoji, gradient, title, body }) => (
              <div key={title} className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 text-center shadow-[0_8px_30px_var(--shadow)]">
                <span aria-hidden className={`mx-auto grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br text-2xl ${gradient}`}>
                  {emoji}
                </span>
                <h3 className="mt-3 font-[family-name:var(--font-display)] text-base font-bold text-[var(--midnight)]">{title}</h3>
                <p className="mt-1 text-sm text-[var(--midnight)]/60">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section aria-label="Join" className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--lavender)]">Ready to be part of it?</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                Join the {BRAND.name} Community
              </h2>
              <p className="mt-1 text-sm text-[var(--on-panel)]/75 sm:text-base">
                Start your spood journey today and be part of a kinder, more connected world.
              </p>
            </div>
            <Link
              href="/register"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
            >
              <Heart className="h-5 w-5 fill-white" aria-hidden />
              Get Started Free
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}