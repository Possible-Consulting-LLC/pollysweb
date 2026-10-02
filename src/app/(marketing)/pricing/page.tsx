import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, Heart, Puzzle } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { effectiveSubscriptionWhere } from "@/lib/admin/legacy-entitlements";
import { prisma } from "@/lib/db";
import { loadPublicPricing } from "@/lib/public-pricing-server";
import { PlanCards } from "@/components/marketing/plan-cards";
import { BRAND } from "@/lib/brand";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing | Polly's Web",
  description: "Simple pricing for every spood parent — free to start, flexible as you grow.",
};

const addOns = [
  {
    icon: <span aria-hidden className="text-2xl">🧬</span>,
    title: "Breeder Add-On",
    price: "+$4.99/mo or $49.99/yr",
    features: ["Lineage tracking", "Selling tools", "Breeder workflows"],
  },
  {
    icon: <span aria-hidden className="text-2xl">🏡</span>,
    title: "Merchant Add-On",
    price: "+$2.99/mo or $29.99/yr",
    features: ["Enclosure décor inspiration", "Shopping tools", "Wishlist tools"],
  },
];

const faqs = [
  {
    question: "Can I change plans later?",
    answer:
      "Yes. Upgrade or adjust your plan any time from Settings → Manage subscription. Your spoods, logs, and photos always carry over — changing plans never affects your data.",
  },
  {
    question: "Do annual plans save money?",
    answer:
      "Yes — annual billing works out to free months compared with paying monthly, shown as a green badge on each card. Yearly pricing is the default view; switch to Monthly to see month-to-month rates.",
  },
  {
    question: "Is there a free plan?",
    answer:
      "There is! The free plan includes the core care journal — spood profiles, feeding and hydration logs, and molt tracking. No card required to start.",
  },
  {
    question: "What are add-ons?",
    answer:
      "Add-ons are optional extras that sit on top of your plan for specialized keeping — like breeder lineage tools or merchant tools for selling goods. They're coming soon, and we'll announce them here and on the blog.",
  },
];

export default async function PricingPage() {
  const user = await getSessionUser();
  const plans = await loadPublicPricing();
  let currentPlanId: string | null = null;
  if (user?.id) {
    const subscription = await prisma.userSubscription.findFirst({
      where: { userId: user.id, ...effectiveSubscriptionWhere() },
      orderBy: { startedAt: "desc" },
      select: { planId: true },
    });
    currentPlanId = subscription?.planId ?? null;
  }

  const featureRows = Array.from(
    new Map(plans.flatMap((plan) => plan.features).map((feature) => [feature.name, feature])).values(),
  );

  return (
    <>
      {/* Hero */}
      <section className="bg-gradient-to-br from-[var(--lavender)]/55 via-[var(--cream)] to-orange-100/40">
        <div className="mx-auto grid w-full max-w-6xl items-center gap-8 px-5 pt-12 pb-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">
              Simple plans. Happier spoods.
            </p>
            <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-bold leading-[1.05] tracking-[-0.03em] text-[var(--plum-deep)] sm:text-6xl">
              Simple Pricing for Every Spood Parent.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-[var(--midnight)]/70">
              Whether you have one spood or a whole crew, {BRAND.name} has a plan that fits your journey. Affordable,
              flexible, and built to grow with you.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-7 py-3.5 text-base font-bold text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] transition hover:bg-orange-600"
              >
                <Heart className="h-5 w-5 fill-white" aria-hidden />
                Get Started Free
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
              <Link
                href="#plans"
                className="inline-flex items-center justify-center rounded-full border border-[var(--midnight)]/20 bg-[var(--card-solid)] px-7 py-3.5 text-base font-bold text-[var(--midnight)] transition hover:bg-[var(--hover)]"
              >
                Compare Plans
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
                Pricing hero illustration
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

      {/* Plan cards */}
      <section id="plans" aria-label="Plans" className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
        <PlanCards plans={plans} isAuthed={Boolean(user?.id)} currentPlanId={currentPlanId} />
      </section>

      {/* Future add-ons */}
      <section aria-label="Future add-ons" className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="grid gap-4 rounded-[2rem] bg-[var(--lavender)]/25 p-6 sm:p-8 lg:grid-cols-[0.8fr_1fr_1fr]">
          <div>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--lavender)]/70 text-[var(--plum)]">
              <Puzzle className="h-5 w-5" aria-hidden />
            </span>
            <h2 className="mt-3 font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
              Future Add-Ons
            </h2>
            <p className="mt-2 text-sm leading-6 text-[var(--midnight)]/65">
              Even more tools for special journeys. These add-ons are coming soon!
            </p>
          </div>
          {addOns.map((addOn) => (
            <article key={addOn.title} className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-5 shadow-[0_8px_30px_var(--shadow)]">
              <div className="flex items-start justify-between gap-3">
                <span aria-hidden>{addOn.icon}</span>
                <span className="rounded-full bg-[var(--lavender)]/70 px-2.5 py-1 text-xs font-bold text-[var(--plum)]">
                  Coming Soon
                </span>
              </div>
              <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                {addOn.title}
              </h3>
              <p className="text-sm font-bold text-[var(--plum)]">{addOn.price}</p>
              <ul className="mt-3 space-y-1.5 text-sm text-[var(--midnight)]/70">
                {addOn.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2">
                    <span aria-hidden className="text-green-600">✓</span>
                    {feature}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section aria-label="Compare plans" className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="rounded-[2rem] border border-[var(--plum)]/10 bg-[var(--card-solid)] p-6 shadow-[0_12px_40px_var(--shadow)] sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--lavender)]/70 text-[var(--plum)]">
              <BarChart3 className="h-5 w-5" aria-hidden />
            </span>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)] sm:text-3xl">
                Compare What&apos;s Included
              </h2>
              <p className="mt-1 text-[var(--midnight)]/60">See which plan is right for you.</p>
            </div>
          </div>

          {plans.length === 0 ? (
            <p className="mt-6 rounded-2xl bg-[var(--hover)] p-4 text-sm text-[var(--midnight)]/70">
              Plans are being set up right now — please check back soon, or{" "}
              <Link href="/contact" className="font-bold text-[var(--plum)] underline">
                contact us
              </Link>{" "}
              and we&apos;ll help you get started.
            </p>
          ) : (
            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-128 text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--plum)]/15">
                    <th scope="col" className="py-3 pr-4 font-bold text-[var(--midnight)]">Feature</th>
                    {plans.map((plan) => (
                      <th key={plan.id} scope="col" className="py-3 px-3 text-center font-bold text-[var(--midnight)]">
                        {plan.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-[var(--plum)]/10">
                    <th scope="row" className="py-3 pr-4 font-semibold text-[var(--midnight)]/80">Active spoods</th>
                    {plans.map((plan) => (
                      <td key={plan.id} className="px-3 py-3 text-center text-[var(--midnight)]/75">
                        {plan.maxSpiders === null ? "Unlimited" : plan.maxSpiders}
                      </td>
                    ))}
                  </tr>
                  {featureRows.map((feature) => (
                    <tr key={feature.name} className="border-b border-[var(--plum)]/10">
                      <th scope="row" className="py-3 pr-4 font-semibold text-[var(--midnight)]/80">{feature.name}</th>
                      {plans.map((plan) => {
                        const included = plan.features.some((entry) => entry.name === feature.name);
                        return (
                          <td key={plan.id} className="px-3 py-3 text-center">
                            {included ? (
                              <span aria-label={`${feature.name} included in ${plan.name}`} className="inline-block text-green-600">✓</span>
                            ) : (
                              <span aria-label={`${feature.name} not in ${plan.name}`} className="text-[var(--midnight)]/35">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* FAQ */}
      <section aria-label="Billing questions" className="mx-auto w-full max-w-6xl px-5 pb-12 sm:px-8">
        <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div className="inline-flex items-center gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[var(--plum)] text-xl font-bold text-[var(--on-accent)]">?</span>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
                Frequently Asked Questions
              </h2>
              <p className="mt-1 text-sm text-[var(--midnight)]/60">Quick answers to help you choose with confidence.</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {faqs.map((faq) => (
              <details key={faq.question} className="group rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-bold text-[var(--midnight)] [&::-webkit-details-marker]:hidden">
                  {faq.question}
                  <span aria-hidden className="text-[var(--plum)] transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-6 text-[var(--midnight)]/70">{faq.answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA banner */}
      <section aria-label="Get started" className="mx-auto w-full max-w-6xl px-5 pb-16 sm:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-[#3b2166] px-6 py-10 text-[var(--on-panel)] shadow-[0_20px_60px_rgba(59,33,102,0.35)] sm:px-12">
          <span aria-hidden className="absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/5 blur-2xl" />
          <div className="relative flex flex-col items-center gap-6 text-center lg:flex-row lg:justify-between lg:text-left">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--lavender)]">Ready when you are.</p>
              <h2 className="mt-2 font-[family-name:var(--font-display)] text-2xl font-bold sm:text-3xl">
                Start with one spood. Grow at your own pace.
              </h2>
              <p className="mt-1 text-sm text-[var(--on-panel)]/75 sm:text-base">
                A kinder, more connected spood community is just a click away.
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