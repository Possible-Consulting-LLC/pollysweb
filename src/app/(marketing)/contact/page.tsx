import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Bug,
  Heart,
  Leaf,
  Lightbulb,
  Mail,
  MessageCircle,
  MessageSquareHeart,
  Users,
} from "lucide-react";
import { SpiderWebGlyph } from "@/components/marketing/spider-glyph";
import { ContactForm } from "@/components/marketing/contact-form";

export const metadata: Metadata = {
  title: "Contact | Polly's Web",
  description: "Questions, suggestions, or just want to say hi? We're here for you (and your spoods)!",
};

const channels = [
  {
    icon: Mail,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Email Support",
    detail: "support@pollysweb.com",
    note: "Best for general questions and account support.",
  },
  {
    icon: MessageCircle,
    iconClass: "text-pink-500 bg-pink-100",
    title: "Community",
    detail: "Join our community",
    note: "Get help from other spood lovers and our team.",
    href: "/register",
  },
  {
    icon: Bug,
    iconClass: "text-[var(--plum)] bg-[var(--lavender)]/70",
    title: "Report a Bug",
    detail: "bugs@pollysweb.com",
    note: "Found something not working? Let us know!",
  },
  {
    icon: Lightbulb,
    iconClass: "text-amber-500 bg-amber-100",
    title: "Feature Requests",
    detail: "ideas@pollysweb.com",
    note: "Have an idea? We'd love to hear it!",
  },
  {
    icon: Heart,
    iconClass: "text-pink-500 bg-pink-100",
    title: "Partnerships & Media",
    detail: "partnerships@pollysweb.com",
    note: "Press, collaborations, or business inquiries.",
  },
];

export default function ContactPage() {
  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--lavender)]/55 via-[var(--cream)] to-orange-100/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-5 py-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">Get in touch</p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
              We&apos;d love to
              <br />
              hear from you!
              <Heart className="ml-2 inline h-8 w-8 text-orange-500" aria-hidden />
            </h1>
            <p className="mt-4 text-lg text-[var(--midnight)]/70">
              Questions, suggestions, or just want to say hi? We&apos;re here for you (and your spoods)!
            </p>
            <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-[var(--midnight)]/70">
              <li className="inline-flex items-center gap-2">
                <MessageSquareHeart className="h-4 w-4 text-[var(--plum)]" aria-hidden /> Real People, Real Answers
              </li>
              <li className="inline-flex items-center gap-2">
                <SpiderWebGlyph className="h-4 w-4 text-orange-400" aria-hidden /> Spood Friendly Support
              </li>
              <li className="inline-flex items-center gap-2">
                <Leaf className="h-4 w-4 text-green-600" aria-hidden /> Helping the Spood Community Grow
              </li>
            </ul>
          </div>
          <div className="relative">
            <div
              role="img"
              aria-label="Illustration of a friendly jumping spider"
              className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--lavender)]/60 via-[var(--cream)] to-green-100/60"
            >
              <span className="text-6xl" aria-hidden>
                🕷️
              </span>
              <span className="absolute bottom-3 right-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--midnight)]/40">
                Contact hero illustration
              </span>
            </div>
            <p
              aria-hidden
              className="absolute -right-1 top-2 rotate-6 font-[family-name:var(--font-display)] text-lg italic text-[var(--plum)]/80 sm:right-3"
            >
              Small Spoods, Brighter Days ♡
            </p>
          </div>
        </div>
      </section>

      {/* Form + channels */}
      <section aria-label="Contact options" className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)] sm:p-8">
            <h2 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
              <Mail className="h-6 w-6 text-[var(--plum)]" aria-hidden />
              Send Us a Message
            </h2>
            <p className="mt-2 text-sm text-[var(--midnight)]/65">
              Fill out the form below and we&apos;ll get back to you as soon as possible.
            </p>
            <div className="mt-6">
              <ContactForm />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_8px_30px_var(--shadow)] sm:p-8">
              <h2 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
                <Mail className="h-6 w-6 text-[var(--plum)]" aria-hidden />
                Other Ways to Reach Us
              </h2>
              <ul className="mt-5 divide-y divide-[var(--plum)]/10">
                {channels.map(({ icon: Icon, iconClass, title, detail, note, href }) => (
                  <li key={title} className="flex items-start gap-3 py-3.5">
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
                      <Icon className="h-5 w-5" aria-hidden />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-[family-name:var(--font-display)] text-base font-bold text-[var(--midnight)]">{title}</h3>
                      {href ? (
                        <Link href={href} className="text-sm font-semibold text-[var(--plum)] underline underline-offset-2">
                          {detail}
                        </Link>
                      ) : (
                        <a href={`mailto:${detail}`} className="text-sm font-semibold text-[var(--plum)] underline underline-offset-2">
                          {detail}
                        </a>
                      )}
                    </div>
                    <p className="hidden max-w-44 text-xs leading-5 text-[var(--midnight)]/55 sm:block">{note}</p>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-6">
              <h2 className="inline-flex items-center gap-2.5 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--plum)] text-[var(--on-accent)]">?</span>
                Need quick answers?
              </h2>
              <p className="mt-3 text-[var(--midnight)]/65">
                Our care guides cover the most common questions about feeding, molting, habitats, and more.
              </p>
              <Link
                href="/care-guides"
                className="mt-4 inline-flex items-center justify-center gap-2 rounded-full border border-[var(--plum)]/30 bg-[var(--card-solid)] px-5 py-2.5 text-sm font-bold text-[var(--plum)] transition hover:bg-[var(--hover)]"
              >
                Browse Care Guides
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Community banner */}
      <section aria-label="Community" className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                A Kind Community Makes a Brighter World
              </h2>
              <p className="mt-1 text-sm text-[var(--on-panel)]/75 sm:text-base">
                Whether you have a question, an idea, or just want to share your spood joy, we&apos;re always happy to
                hear from you!
              </p>
            </div>
            <Link
              href="/register"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-orange-500 px-6 py-3 text-sm font-bold text-white transition hover:bg-orange-600"
            >
              <Users className="h-4 w-4" aria-hidden />
              Join Our Community
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}