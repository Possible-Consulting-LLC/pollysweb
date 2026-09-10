import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Camera,
  Check,
  Droplets,
  Heart,
  NotebookTabs,
  Sparkles,
  Utensils,
} from "lucide-react";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";

export const metadata: Metadata = {
  title: "Spoodly Space — Jumping spider care, all in one place",
  description:
    "Track feedings, hydration, molts, photos, and care notes for your jumping spiders in one calm, organized space.",
};

const features = [
  {
    icon: Utensils,
    title: "Log care in seconds",
    body: "Record feedings, hydration, observations, and enclosure maintenance while the details are fresh.",
  },
  {
    icon: Sparkles,
    title: "Navigate molts with confidence",
    body: "Track premolt signs, successful molts, instars, and recovery periods without relying on memory.",
  },
  {
    icon: Camera,
    title: "Keep every little chapter",
    body: "Build a photo gallery and timeline that tells each spood’s story as they grow.",
  },
  {
    icon: Activity,
    title: "See what needs attention",
    body: "A simple care dashboard surfaces the spoods that could use a check-in and keeps routine care visible.",
  },
];

const steps = [
  {
    number: "01",
    title: "Create each spood’s profile",
    body: "Add their name, species, sex, instar, arrival date, enclosure details, and favorite portrait.",
  },
  {
    number: "02",
    title: "Log moments as they happen",
    body: "A quick tap records meals, misting, molts, body condition, maintenance, and observations.",
  },
  {
    number: "03",
    title: "Let their history guide care",
    body: "Review recent activity and long-term patterns so you can make thoughtful decisions for every spider.",
  },
];

export default async function RootPage() {
  const user = await getSessionUser();
  if (user) redirect("/home");

  return (
    <main className="overflow-hidden">
      <nav
        aria-label="Primary navigation"
        className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8"
      >
        <Link
          href="/"
          className="inline-flex items-center gap-3 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
          aria-label="Spoodly Space home"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/spoodly-logo-mark.png"
            alt=""
            width={56}
            height={56}
            className="h-12 w-12 object-contain"
          />
          <span className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--midnight)]">
            Spoodly Space
          </span>
        </Link>
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] px-5 text-sm font-bold text-[var(--plum)] shadow-sm transition hover:border-[var(--plum)]/35 hover:bg-[var(--hover-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
        >
          Sign in
        </Link>
      </nav>

      <section className="relative mx-auto grid w-full max-w-6xl items-center gap-12 px-5 pb-20 pt-10 sm:px-8 sm:pt-16 lg:grid-cols-[1.08fr_0.92fr] lg:pb-28">
        <div className="relative z-10">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[var(--plum)]/15 bg-[var(--card)] px-4 py-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--plum)] shadow-sm">
            <Heart className="h-3.5 w-3.5 fill-[var(--gold)] text-[var(--plum)]" />
            Made for jumping spider keepers
          </div>
          <h1 className="max-w-3xl font-[family-name:var(--font-display)] text-5xl font-semibold leading-[1.03] tracking-[-0.04em] text-[var(--midnight)] sm:text-6xl lg:text-7xl">
            Thoughtful care for every{" "}
            <span className="text-[var(--plum)]">tiny personality.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--midnight)]/70 sm:text-xl">
            Spoodly Space is a calm, organized home for your jumping
            spiders’ care. Remember the meals, molts, mistings, photos, and
            little moments that make each one unique.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/register"
              className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--plum)] px-7 text-base font-bold text-[var(--on-accent)] shadow-[0_12px_30px_rgba(82,56,96,0.2)] transition hover:bg-[var(--plum-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2"
            >
              Create your space
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/login"
              className="inline-flex h-14 items-center justify-center rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] px-7 text-base font-bold text-[var(--midnight)] transition hover:bg-[var(--hover-strong)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
            >
              I already have an account
            </Link>
          </div>
          <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-[var(--midnight)]/60">
            {["Simple care logs", "Private by default", "Built for mobile"].map(
              (item) => (
                <span key={item} className="inline-flex items-center gap-1.5">
                  <Check className="h-4 w-4 text-[var(--plum)]" />
                  {item}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-md lg:max-w-none">
          <div
            aria-hidden
            className="absolute -inset-10 -z-10 rounded-full bg-[var(--lavender)]/45 blur-3xl"
          />
          <div className="rotate-[1.5deg] rounded-[2rem] border border-[var(--plum)]/15 bg-[var(--card-solid)] p-5 shadow-[0_24px_70px_rgba(30,36,66,0.14)] sm:p-7">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--plum)]/70">
                  Today in your web
                </p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--midnight)]">
                  Everyone’s care, at a glance
                </p>
              </div>
              <div className="rounded-2xl bg-[var(--lavender)] p-3 text-[var(--plum)]">
                <NotebookTabs className="h-6 w-6" />
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <div className="flex items-center gap-4 rounded-2xl border border-[var(--plum)]/10 bg-[var(--cream)]/70 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--gold)]/35 text-xl">
                  🕷️
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--midnight)]">Clementine</p>
                  <p className="text-sm text-[var(--midnight)]/55">
                    Last fed 4 days ago
                  </p>
                </div>
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  Check in
                </span>
              </div>
              <div className="flex items-center gap-4 rounded-2xl border border-[var(--plum)]/10 bg-[var(--cream)]/70 p-4">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--lavender)] text-xl">
                  ✦
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-[var(--midnight)]">Mochi</p>
                  <p className="text-sm text-[var(--midnight)]/55">
                    In premolt · resting cozy
                  </p>
                </div>
                <span className="rounded-full bg-[var(--lavender)] px-3 py-1 text-xs font-bold text-[var(--plum-deep)]">
                  Premolt
                </span>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[var(--plum)] p-4 text-[var(--on-accent)]">
                <Utensils className="h-5 w-5" />
                <p className="mt-5 text-sm font-bold">Log a feeding</p>
              </div>
              <div className="rounded-2xl bg-[var(--lavender)] p-4 text-[var(--midnight)]">
                <Droplets className="h-5 w-5 text-[var(--plum)]" />
                <p className="mt-5 text-sm font-bold">Log hydration</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[var(--plum)]/10 bg-[var(--card)]">
        <div className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--plum)]">
              Built around real care
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--midnight)] sm:text-5xl">
              Less remembering. More enjoying.
            </h2>
            <p className="mt-4 text-lg leading-8 text-[var(--midnight)]/65">
              Whether you care for your first jumper or a whole constellation,
              Spoodly Space keeps useful details close without turning care into
              paperwork.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, body }) => (
              <article
                key={title}
                className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)] sm:p-7"
              >
                <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--lavender)] text-[var(--plum)]">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--midnight)]">
                  {title}
                </h3>
                <p className="mt-2 leading-7 text-[var(--midnight)]/65">
                  {body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--plum)]">
              A simple rhythm
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight text-[var(--midnight)] sm:text-5xl">
              Your care routine, made visible.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--midnight)]/65">
              No complicated setup and no generic pet tracker. Just the details
              jumping spider keepers actually use.
            </p>
          </div>
          <ol className="space-y-4">
            {steps.map((step) => (
              <li
                key={step.number}
                className="grid gap-4 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-6 sm:grid-cols-[4rem_1fr] sm:items-start"
              >
                <span className="font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--plum)]/55">
                  {step.number}
                </span>
                <div>
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--midnight)]">
                    {step.title}
                  </h3>
                  <p className="mt-2 leading-7 text-[var(--midnight)]/65">
                    {step.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-28">
        <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[2.25rem] bg-[var(--panel)] px-6 py-14 text-center text-[var(--on-panel)] shadow-[0_24px_70px_rgba(30,36,66,0.18)] sm:px-12 sm:py-20">
          <div
            aria-hidden
            className="absolute -right-16 -top-20 h-64 w-64 rounded-full bg-[var(--plum)]/40 blur-3xl"
          />
          <div
            aria-hidden
            className="absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-[var(--gold)]/20 blur-3xl"
          />
          <div className="relative mx-auto max-w-2xl">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-[var(--gold)]">
              Make a little space for them
            </p>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight sm:text-5xl">
              Your spoods have stories worth remembering.
            </h2>
            <p className="mt-5 text-lg leading-8 text-[var(--on-panel)]/70">
              Start a care journal today, or sign in to pick up right where you
              left off.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex h-14 items-center justify-center gap-2 rounded-2xl bg-[var(--gold)] px-7 font-bold text-[var(--panel)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                Create an account
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/login"
                className="inline-flex h-14 items-center justify-center rounded-2xl border border-white/20 bg-white/10 px-7 font-bold text-[var(--on-panel)] transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-[var(--plum)]/10 px-5 py-8 sm:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 text-center text-sm text-[var(--midnight)]/55 sm:flex-row sm:items-center sm:justify-between sm:text-left">
          <p>© {new Date().getFullYear()} Spoodly Space</p>
          <p>A thoughtful corner of the web for jumping spider keepers.</p>
        </div>
      </footer>
    </main>
  );
}
