import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  ChevronRight,
  Clock,
  Cross,
  Droplet,
  Heart,
  Moon,
  Sparkles,
  Sprout,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import { getGuide, listGuides, GUIDE_CATEGORIES } from "@/lib/content/care-guides";

type Params = { slug: string };

const GUIDE_ICONS: Record<string, LucideIcon> = {
  utensils: Utensils,
  droplet: Droplet,
  moon: Moon,
  heart: Heart,
  sparkles: Sparkles,
  sprout: Sprout,
  cross: Cross,
  "book-open": BookOpen,
};

const CATEGORY_LABELS = new Map(GUIDE_CATEGORIES.map((category) => [category.key, category.label]));

export function generateStaticParams(): Params[] {
  return listGuides().map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) return { title: "Care Guides | Polly's Web" };
  return { title: `${guide.title} | Polly's Web`, description: guide.excerpt };
}

export default async function GuideArticlePage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const guide = getGuide(slug);
  if (!guide) notFound();

  const guides = listGuides();
  const index = guides.findIndex((entry) => entry.slug === guide.slug);
  const prev = index > 0 ? guides[index - 1] : null;
  const next = index < guides.length - 1 ? guides[index + 1] : null;
  const Icon = GUIDE_ICONS[guide.icon] ?? BookOpen;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[var(--midnight)]/60">
        <Link href="/care-guides" className="font-semibold transition hover:text-[var(--plum)]">
          Care Guides
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span aria-current="page" className="font-semibold text-[var(--plum)]">
          {guide.title}
        </span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_220px]">
        <article>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--lavender)]/70 px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-[var(--plum)]">
              <Icon className="h-3.5 w-3.5" aria-hidden />
              {CATEGORY_LABELS.get(guide.category)}
            </span>
            <span className="inline-flex items-center gap-1.5 text-sm text-[var(--midnight)]/55">
              <Clock className="h-4 w-4" aria-hidden />
              {guide.readingTime} min read
            </span>
          </div>
          <h1 className="mt-4 font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-5xl">
            {guide.title}
          </h1>
          <p className="mt-3 max-w-2xl text-lg text-[var(--midnight)]/65">{guide.excerpt}</p>
          <div
            className="content-prose mt-8"
            dangerouslySetInnerHTML={{ __html: guide.html }}
          />
          <nav aria-label="More guides" className="mt-12 grid gap-3 border-t border-[var(--plum)]/10 pt-6 sm:grid-cols-2">
            {prev ? (
              <Link href={`/care-guides/${prev.slug}`} className="rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 transition hover:border-[var(--plum)]/25">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--midnight)]/50">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Previous
                </span>
                <span className="mt-1 block font-bold text-[var(--plum)]">{prev.title}</span>
              </Link>
            ) : (
              <span aria-hidden className="hidden sm:block" />
            )}
            {next ? (
              <Link href={`/care-guides/${next.slug}`} className="rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 text-right transition hover:border-[var(--plum)]/25 sm:col-start-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--midnight)]/50">
                  Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="mt-1 block font-bold text-[var(--plum)]">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        </article>

        {guide.toc.length >= 2 ? (
          <aside>
            <nav aria-label="In this guide" className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-4 lg:sticky lg:top-24">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--midnight)]/50">In This Guide</h2>
              <ol className="mt-3 space-y-2 text-sm">
                {guide.toc.map((entry) => (
                  <li key={entry.id} className={entry.level === 3 ? "pl-3" : undefined}>
                    <a href={`#${entry.id}`} className="text-[var(--midnight)]/70 transition hover:text-[var(--plum)]">
                      {entry.text}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </aside>
        ) : null}
      </div>
    </div>
  );
}