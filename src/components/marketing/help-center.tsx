"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  Bug,
  ChevronDown,
  Crown,
  Heart,
  House,
  Image as ImageIcon,
  List,
  Mail,
  MessageCircle,
  Search,
  Settings,
  Users,
} from "lucide-react";
import { BRAND } from "@/lib/brand";
import { SpiderGlyph, SpiderWebGlyph } from "@/components/marketing/spider-glyph";
import { HeroArtPanel } from "@/components/marketing/hero-art";

type Topic = {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  iconClass: string;
  title: string;
  body: string;
  href: string;
};

const topics: Topic[] = [
  {
    icon: SpiderGlyph,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Getting Started",
    body: "Create an account, add your first spood, and explore the basics.",
    href: "/register",
  },
  {
    icon: Heart,
    iconClass: "text-pink-500 bg-pink-100",
    title: "Spood Care",
    body: "Feeding, hydration, molts, handling, and general care tips.",
    href: "/care-guides",
  },
  {
    icon: House,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Enclosures",
    body: "Setup guides, enclosure types, and environment tips.",
    href: "/care-guides/habitat",
  },
  {
    icon: ImageIcon,
    iconClass: "text-green-600 bg-green-100",
    title: "Photos & Memories",
    body: "Add photos, organize galleries, and track special moments.",
    href: "/features",
  },
  {
    icon: List,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Features & Tools",
    body: "Activity logs, QR codes, bulk updates, and more.",
    href: "/features",
  },
  {
    icon: Crown,
    iconClass: "text-amber-500 bg-amber-100",
    title: "Plans & Billing",
    body: "Compare plans, manage your subscription, and payment help.",
    href: "/pricing",
  },
  {
    icon: Settings,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Account Settings",
    body: "Update your profile, notifications, and privacy preferences.",
    href: "/login",
  },
  {
    icon: Users,
    iconClass: "text-pink-500 bg-pink-100",
    title: "Community",
    body: "Join the conversation, share tips, and connect with other spood lovers.",
    href: "/register",
  },
];

const faqs = [
  {
    question: "Is Polly's Web free to use?",
    answer:
      "Yes! The free plan includes the core care journal — spood profiles, feeding and hydration logs, molt tracking, and photos. No card required. Paid plans add more room and extras for keepers with bigger collections.",
  },
  {
    question: "How many spoods can I add?",
    answer:
      "That depends on your plan. The free plan comfortably covers a starter collection, and paid plans raise the cap for keepers with more jumpers. You can see the current limits for each plan on the pricing page.",
  },
  {
    question: "What information should I track?",
    answer:
      "The essentials: feedings (what was offered and whether it was taken), hydration, molts, handling sessions, cleaning routines, health notes, and enclosure details. Photos and observations fill in the story. Consistent logging is what turns notes into patterns.",
  },
  {
    question: "Can I print QR codes for my spoods?",
    answer:
      "Not yet — QR codes are on our roadmap as a quick way to pull up a spood's profile and care status. In the meantime, your care log in the app is always one tap away.",
  },
  {
    question: "Can I share my spood's profile?",
    answer:
      "Not yet. Spood profiles are private today — only you can see them. Profile sharing is planned for a future update, and we'll announce it here and on the blog when it arrives.",
  },
  {
    question: "How do I upgrade to a Pro plan?",
    answer:
      "Sign in, open Settings, and choose Manage subscription to see plan options and upgrade. Your spoods, logs, and photos carry over automatically — upgrading only adds room and features.",
  },
];

const popularSearches = ["feeding", "molting", "habitat", "billing", "QR codes"];

export function HelpCenter({ heroArt }: { heroArt: boolean }) {
  const [query, setQuery] = useState("");
  const normalized = query.trim().toLowerCase();

  const filteredFaqs = useMemo(
    () =>
      faqs.filter(
        (faq) =>
          normalized.length === 0 ||
          faq.question.toLowerCase().includes(normalized) ||
          faq.answer.toLowerCase().includes(normalized),
      ),
    [normalized],
  );

  return (
    <>
      {/* Hero with search */}
      <section className="bg-gradient-to-br from-[var(--lavender)]/55 via-[var(--cream)] to-orange-100/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-10 px-5 py-14 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Help Center</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
              We&apos;re here to help!
            </h1>
            <p className="mt-4 text-lg text-[var(--midnight)]/70">
              Find answers, get support, and keep your spoods happy.
            </p>
            <div
              role="search"
              className="mt-7 flex max-w-xl items-center gap-2 rounded-full border border-[var(--plum)]/15 bg-[var(--card-solid)] p-2 pl-5 shadow-[0_8px_30px_var(--shadow)]"
            >
              <Search className="h-5 w-5 shrink-0 text-[var(--midnight)]/45" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search for help… (e.g. feeding, molts, billing)"
                aria-label="Search help topics"
                className="w-full min-w-0 bg-transparent text-[var(--midnight)] placeholder:text-[var(--midnight)]/40 focus:outline-none"
              />
              <a
                href="#faq"
                className="shrink-0 rounded-full bg-[var(--plum)] px-5 py-2.5 text-sm font-bold text-[var(--on-accent)] transition hover:bg-[var(--plum-deep)]"
              >
                Search
              </a>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[var(--midnight)]/60">
              <span className="font-semibold">Popular searches:</span>
              {popularSearches.map((term) => (
                <button
                  key={term}
                  type="button"
                  onClick={() => {
                    setQuery(term);
                    document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="rounded-full bg-[var(--lavender)]/60 px-3 py-1.5 text-xs font-bold text-[var(--plum)] transition hover:bg-[var(--lavender)]"
                >
                  {term}
                </button>
              ))}
            </div>
          </div>
          <div className="relative">
          <HeroArtPanel artExists={heroArt} label="Help hero illustration" />
        </div>
        </div>
      </section>

      {/* Topics */}
      <section aria-label="Browse help topics" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <div className="flex items-center justify-between gap-4">
          <h2 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
            <SpiderWebGlyph className="h-6 w-6 text-[var(--plum)]" aria-hidden />
            Browse Help Topics
          </h2>
          <Link
            href="/blog"
            className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-[var(--plum)] transition hover:gap-2"
          >
            View All Articles →
          </Link>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {topics.map(({ icon: Icon, iconClass, title, body, href }) => (
            <Link
              key={title}
              href={href}
              className="group flex items-start gap-3 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 shadow-[0_8px_30px_var(--shadow)] transition hover:border-[var(--plum)]/25"
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
                <Icon className="h-6 w-6" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block font-[family-name:var(--font-display)] text-base font-bold text-[var(--midnight)]">
                  {title}
                </span>
                <span className="mt-1 block text-sm leading-6 text-[var(--midnight)]/60">{body}</span>
              </span>
              <span aria-hidden className="ml-auto mt-1 shrink-0 text-[var(--plum)]/50 transition group-hover:translate-x-0.5 group-hover:text-[var(--plum)]">
                ›
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* FAQ + still need help */}
      <section aria-label="Frequently asked questions" id="faq" className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)]">
            <h2 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
              <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--plum)] text-[var(--on-accent)]">?</span>
              Frequently Asked Questions
            </h2>
            <div className="mt-5 space-y-3">
              {filteredFaqs.length === 0 ? (
                <p className="rounded-2xl bg-[var(--hover)] p-4 text-sm text-[var(--midnight)]/70">
                  No answers matched &ldquo;{query}&rdquo;. Try a different word, or{" "}
                  <Link href="/contact" className="font-bold text-[var(--plum)] underline">
                    contact us
                  </Link>{" "}
                  and we&apos;ll help directly.
                </p>
              ) : (
                filteredFaqs.map((faq) => (
                  <details
                    key={faq.question}
                    className="group rounded-2xl border border-[var(--plum)]/10 bg-[var(--card)] px-5 py-4"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-[var(--midnight)] [&::-webkit-details-marker]:hidden">
                      {faq.question}
                      <ChevronDown className="h-5 w-5 shrink-0 text-[var(--plum)] transition group-open:rotate-180" aria-hidden />
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-[var(--midnight)]/70">{faq.answer}</p>
                  </details>
                ))
              )}
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)]">
              <h2 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
                <MessageCircle className="h-6 w-6 text-[var(--plum)]" aria-hidden />
                Still Need Help?
              </h2>
              <p className="mt-3 text-[var(--midnight)]/65">
                Can&apos;t find what you&apos;re looking for? We&apos;d love to hear from you!
              </p>
              <Link
                href="/contact"
                className="mt-5 flex items-center justify-center gap-2 rounded-full bg-[var(--plum)] px-5 py-3 text-sm font-bold text-[var(--on-accent)] transition hover:bg-[var(--plum-deep)]"
              >
                <Mail className="h-4 w-4" aria-hidden />
                Contact Support
              </Link>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-4 text-center">
                <BookOpen className="mx-auto h-6 w-6 text-[var(--plum)]" aria-hidden />
                <h3 className="mt-2 text-sm font-bold text-[var(--midnight)]">Submit a Feature Request</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--midnight)]/60">
                  Have an idea? We&apos;re always looking for ways to improve!
                </p>
              </div>
              <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-4 text-center">
                <Bug className="mx-auto h-6 w-6 text-[var(--plum)]" aria-hidden />
                <h3 className="mt-2 text-sm font-bold text-[var(--midnight)]">Report a Bug</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--midnight)]/60">
                  Found something not working as expected?
                </p>
              </div>
              <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-4 text-center">
                <Users className="mx-auto h-6 w-6 text-[var(--plum)]" aria-hidden />
                <h3 className="mt-2 text-sm font-bold text-[var(--midnight)]">Join Our Community</h3>
                <p className="mt-1 text-xs leading-5 text-[var(--midnight)]/60">
                  Get help, share experiences, and meet other spood lovers.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section aria-label="Get started" className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative grid items-center gap-8 lg:grid-cols-[1.3fr_0.7fr]">
            <div className="flex flex-col items-center gap-6 text-center lg:flex-row lg:text-left">
              <div
                role="img"
                aria-label="Illustration of a jumping spider"
                className="hidden h-24 w-24 shrink-0 place-items-center rounded-3xl bg-white/10 text-4xl lg:grid"
              >
                🕷️
              </div>
              <div>
                <p
                  aria-hidden
                  className="font-[family-name:var(--font-display)] text-base italic text-[var(--lavender)]"
                >
                  Happy Spoods, Happier You!
                </p>
                <h2 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                  New to {BRAND.name}?
                </h2>
                <p className="mt-2 max-w-lg text-sm text-[var(--on-panel)]/75 sm:text-base">
                  Join a growing community of spood lovers and get the tools you need to track, learn, and care — all
                  in one place.
                </p>
                <div className="mt-5 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
                  <Link
                    href="/register"
                    className="inline-flex items-center justify-center rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
                  >
                    Create a Free Account
                  </Link>
                  <Link
                    href="/features"
                    className="inline-flex items-center justify-center rounded-full border border-white/25 bg-white/10 px-6 py-3 text-sm font-bold text-[var(--on-panel)] transition hover:bg-white/20"
                  >
                    Explore Features
                  </Link>
                </div>
              </div>
            </div>
            <ul className="mx-auto space-y-3 text-sm lg:mx-0">
              {[
                { icon: Heart, label: "Track care & milestones" },
                { icon: SpiderWebGlyph, label: "Access expert guides" },
                { icon: Users, label: "Join our community" },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="inline-flex items-center gap-3">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-white/10">
                    <Icon className="h-4.5 w-4.5 text-[var(--lavender)]" aria-hidden />
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  );
}