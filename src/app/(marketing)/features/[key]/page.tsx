import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowRight, Clock, Sparkles } from "lucide-react";
import { prisma } from "@/lib/db";
import { BRAND } from "@/lib/brand";
import { getSessionUser } from "@/lib/session";
import { resolveUserFeatureGate } from "@/lib/features/gate";

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ key: string }>;
};

/** A database outage reads as an unknown feature (not found), never a 500. */
async function readFeature(key: string) {
  try {
    return await prisma.feature.findUnique({ where: { key } });
  } catch (error) {
    console.error("feature-page", key, error);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { key } = await params;
  const feature = await readFeature(key);
  if (!feature) {
    return { title: `Feature | ${BRAND.name}` };
  }
  return {
    title: `${feature.name} | ${BRAND.name}`,
    description: feature.description,
  };
}

export default async function FeatureDetailPage({ params }: Props) {
  const { key } = await params;
  const [feature, user] = await Promise.all([readFeature(key), getSessionUser()]);

  if (!feature) {
    notFound();
  }
  const entitled = feature.active && user?.id ? (await resolveUserFeatureGate(user.id, key)) === "entitled" : false;

  if (!feature.active) {
    return (
      <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
        <div className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card-solid)] p-8 sm:p-12 shadow-sm text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-[var(--lavender)]/70 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--plum-deep)]">
            <Clock className="h-4 w-4" aria-hidden />
            Coming soon
          </div>
          <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--plum-deep)] sm:text-5xl">
            {feature.name}
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--midnight)]/70">
            {feature.description}
          </p>
          <div className="mt-8">
            <p className="text-sm font-medium text-[var(--midnight)]/60">
              This feature is currently in active development and will be available soon on {BRAND.name}.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
      <div className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card-solid)] p-8 sm:p-12 shadow-sm text-center">
        <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-orange-100 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-orange-700">
          <Sparkles className="h-4 w-4" aria-hidden />
          Plan Feature
        </div>
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-4xl font-bold tracking-tight text-[var(--plum-deep)] sm:text-5xl">
          {feature.name}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg leading-relaxed text-[var(--midnight)]/70">
          {feature.description}
        </p>
        <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
          {entitled ? (
            <Link
              href="/home"
              className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--plum)] px-8 py-3.5 text-base font-bold text-[var(--on-accent)] transition hover:opacity-90"
            >
              Included in your plan — back to your spoods
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-orange-500 px-8 py-3.5 text-base font-bold text-white shadow-[0_10px_28px_rgba(249,115,22,0.35)] transition hover:bg-orange-600"
          >
            See Plans &amp; Pricing
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          )}
        </div>
      </div>
    </div>
  );
}
