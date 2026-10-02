import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  Camera,
  ClipboardList,
  Cross,
  Droplet,
  Heart,
  House,
  Leaf,
  Moon,
  PawPrint,
  Sparkles,
  Sprout,
  Users,
  Utensils,
} from "lucide-react";
import { BRAND } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Features | Polly's Web",
  description: "Everything Polly's Web gives you to care for, track, and celebrate your jumping spiders.",
};

const features = [
  {
    icon: ClipboardList,
    iconClass: "text-pink-500 bg-pink-50",
    art: "from-pink-100/80 to-rose-50",
    title: "Spood Profiles",
    body: "Track important details like species, sex, life stage, hatch date, and more.",
    href: "/register",
  },
  {
    icon: Utensils,
    iconClass: "text-orange-500 bg-orange-50",
    art: "from-orange-100/80 to-amber-50",
    title: "Feeding Tracking",
    body: "Log feedings, prey type, quantity, and outcomes so you can spot patterns.",
    href: "/care-guides/feeding",
  },
  {
    icon: Droplet,
    iconClass: "text-sky-500 bg-sky-50",
    art: "from-sky-100/80 to-cyan-50",
    title: "Hydration Tracking",
    body: "Track hydration methods and keep your spood happy and healthy.",
    href: "/care-guides/water",
  },
  {
    icon: Moon,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    art: "from-[var(--lavender)]/60 to-purple-50",
    title: "Molts & Growth",
    body: "Log molts, track growth milestones, and celebrate every stage.",
    href: "/care-guides/molting",
  },
  {
    icon: House,
    iconClass: "text-green-600 bg-green-50",
    art: "from-emerald-100/80 to-lime-50",
    title: "Enclosure Details",
    body: "Keep notes on enclosures, decor, substrate, and environment.",
    href: "/care-guides/habitat",
  },
  {
    icon: Heart,
    iconClass: "text-pink-500 bg-pink-50",
    art: "from-pink-100/80 to-rose-50",
    title: "Handling Notes",
    body: "Track handling sessions and build a positive relationship.",
    href: "/care-guides/handling",
  },
  {
    icon: Sparkles,
    iconClass: "text-amber-500 bg-amber-50",
    art: "from-amber-100/80 to-yellow-50",
    title: "Cleaning Log",
    body: "Stay on top of cleaning schedules and enclosure maintenance.",
    href: "/care-guides/cleaning",
  },
  {
    icon: Sprout,
    iconClass: "text-green-600 bg-green-50",
    art: "from-lime-100/80 to-green-50",
    title: "Life Stages",
    body: "From sling to adult, track their journey and learn what to expect.",
    href: "/care-guides/life-stages",
  },
  {
    icon: Cross,
    iconClass: "text-red-500 bg-red-50",
    art: "from-red-100/80 to-orange-50",
    title: "Health Tracking",
    body: "Log health notes, keep an eye on changes, and have important info handy.",
    href: "/care-guides/health",
  },
  {
    icon: BookOpen,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    art: "from-[var(--lavender)]/50 to-sky-50",
    title: "Species Profiles",
    body: "Explore care info for different jumper species with trusted guidance.",
    href: "/care-guides/species-profiles",
  },
  {
    icon: Camera,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    art: "from-[var(--lavender)]/60 to-indigo-50",
    title: "Photos & History",
    body: "Capture memories and build a visual timeline of your spood's life.",
    href: "/register",
  },
  {
    icon: BarChart3,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    art: "from-[var(--lavender)]/60 to-sky-50",
    title: "Dashboards & Insights",
    body: "Get a clear view of care, activity, and important dates all in one place.",
    href: "/register",
  },
];

export default function FeaturesPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--lavender)]/55 via-[var(--cream)] to-orange-100/40">
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 sm:px-8">
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[var(--midnight)]/55">
            <Link href="/" className="font-semibold transition hover:text-[var(--plum)]">
              Home
            </Link>
            <span aria-hidden>›</span>
            <span aria-current="page" className="font-semibold text-[var(--plum)]">
              Features
            </span>
          </nav>
        </div>
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
              All the Tools
              <br />
              for Happy Spoods
              <Heart className="ml-2 inline h-8 w-8 text-orange-500" aria-hidden />
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--midnight)]/70">
              {BRAND.name} gives you everything you need to care for, track, and celebrate your jumping spiders.
              Simple, helpful, and made by spood lovers — for spood lovers.
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
                href="/pricing"
                className="inline-flex items-center justify-center rounded-full border border-[var(--midnight)]/20 bg-[var(--card-solid)] px-7 py-3.5 text-base font-bold text-[var(--midnight)] transition hover:bg-[var(--hover)]"
              >
                View Pricing
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
                Features hero illustration
              </span>
            </div>
            <p
              aria-hidden
              className="absolute -right-1 top-2 rotate-6 font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]/80 sm:right-3"
            >
              Small Creatures, Big Joy ♡
            </p>
          </div>
        </div>
      </section>

      {/* Trust row */}
      <section aria-label="Why keepers choose Polly's Web" className="border-y border-[var(--plum)]/10 bg-[var(--card)]">
        <ul className="mx-auto grid w-full max-w-4xl gap-4 px-5 py-6 text-center text-sm font-semibold text-[var(--midnight)]/75 sm:grid-cols-4 sm:px-8">
          <li className="inline-flex items-center justify-center gap-2">
            <PawPrint className="h-4 w-4 text-[var(--plum)]" aria-hidden /> Easy to use
          </li>
          <li className="inline-flex items-center justify-center gap-2">
            <Heart className="h-4 w-4 fill-[var(--plum)] text-[var(--plum)]" aria-hidden /> Built by spood lovers
          </li>
          <li className="inline-flex items-center justify-center gap-2">
            <Leaf className="h-4 w-4 text-green-600" aria-hidden /> Trusted care information
          </li>
          <li className="inline-flex items-center justify-center gap-2">
            <Users className="h-4 w-4 text-[var(--plum)]" aria-hidden /> A supportive community
          </li>
        </ul>
      </section>

      {/* Feature grid */}
      <section aria-label="Features" className="mx-auto w-full max-w-6xl px-5 py-16 sm:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Features</p>
          <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-5xl">
            Everything You Need in One Place
          </h2>
          <p className="mt-4 text-lg text-[var(--midnight)]/65">
            From daily care to lifelong memories, {BRAND.name} helps you give your jumpers the best life possible.
          </p>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {features.map(({ icon: Icon, iconClass, art, title, body, href }) => (
            <Link
              key={title}
              href={href}
              className="group flex flex-col overflow-hidden rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] shadow-[0_8px_30px_var(--shadow)] transition hover:border-[var(--plum)]/25"
            >
              <span className="flex flex-1 flex-col p-5">
                <span className={`grid h-10 w-10 place-items-center rounded-2xl ${iconClass}`}>
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="mt-3 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                  {title}
                </span>
                <span className="mt-1.5 flex-1 text-sm leading-6 text-[var(--midnight)]/65">{body}</span>
                <span className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--plum)] transition group-hover:gap-2">
                  Learn More <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </span>
              <span aria-hidden className={`flex h-16 items-end justify-center bg-gradient-to-t text-2xl ${art}`}>
                <span className="mb-2">{title === "Molts & Growth" ? "🦗" : title === "Hydration Tracking" ? "💧" : "🕸️"}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* CTA banner */}
      <section aria-label="Get started" className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--lavender)]">Ready to join?</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                Start Your Spood Journey Today
              </h2>
              <p className="mt-1 text-sm text-[var(--on-panel)]/75 sm:text-base">
                It&apos;s free to get started, and there&apos;s a plan for every spood lover.
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