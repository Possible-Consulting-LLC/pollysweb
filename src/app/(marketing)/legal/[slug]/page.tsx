import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, FileText } from "lucide-react";
import { getLegalDoc, listLegalDocs } from "@/lib/content/legal";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listLegalDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) return { title: "Legal | Polly's Web" };
  return {
    title: `${doc.title} | Polly's Web`,
    description: `${doc.title} for Polly's Web — the jumping spider care journal.`,
  };
}

export default async function LegalDocPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const doc = getLegalDoc(slug);
  if (!doc) notFound();

  const docs = listLegalDocs();
  const index = docs.findIndex((entry) => entry.slug === doc.slug);
  const prev = index > 0 ? docs[index - 1] : null;
  const next = index < docs.length - 1 ? docs[index + 1] : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-10 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[var(--midnight)]/60">
        <Link href="/legal" className="font-semibold transition hover:text-[var(--plum)]">
          Legal
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span aria-current="page" className="font-semibold text-[var(--plum)]">
          {doc.title}
        </span>
      </nav>

      <div className="mt-6 grid gap-8 lg:grid-cols-[240px_1fr_200px]">
        <aside>
          <nav aria-label="Legal documents" className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-3 shadow-[0_8px_30px_var(--shadow)] lg:sticky lg:top-24">
            <ul className="space-y-1">
              {docs.map((entry) => (
                <li key={entry.slug}>
                  <Link
                    href={`/legal/${entry.slug}`}
                    aria-current={entry.slug === doc.slug ? "page" : undefined}
                    className={
                      entry.slug === doc.slug
                        ? "flex items-center gap-2.5 rounded-xl bg-[var(--lavender)]/70 px-3 py-2 text-sm font-bold text-[var(--plum)]"
                        : "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold text-[var(--midnight)]/70 transition hover:bg-[var(--hover)] hover:text-[var(--plum)]"
                    }
                  >
                    <FileText className="h-4 w-4 shrink-0" aria-hidden />
                    {entry.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </aside>

        <article>
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold tracking-[-0.02em] text-[var(--midnight)] sm:text-5xl">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-[var(--midnight)]/55">Last updated: {doc.lastUpdated}</p>
          <div
            className="content-prose mt-8"
            dangerouslySetInnerHTML={{ __html: doc.html }}
          />
          <nav aria-label="More legal documents" className="mt-12 grid gap-3 border-t border-[var(--plum)]/10 pt-6 sm:grid-cols-2">
            {prev ? (
              <Link href={`/legal/${prev.slug}`} className="rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 transition hover:border-[var(--plum)]/25">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--midnight)]/50">
                  <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Previous
                </span>
                <span className="mt-1 block font-bold text-[var(--plum)]">{prev.title}</span>
              </Link>
            ) : (
              <span aria-hidden className="hidden sm:block" />
            )}
            {next ? (
              <Link href={`/legal/${next.slug}`} className="rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 text-right transition hover:border-[var(--plum)]/25 sm:col-start-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--midnight)]/50">
                  Next <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="mt-1 block font-bold text-[var(--plum)]">{next.title}</span>
              </Link>
            ) : null}
          </nav>
        </article>

        {doc.toc.length >= 2 ? (
          <aside>
            <nav aria-label="In this article" className="rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-4 lg:sticky lg:top-24">
              <h2 className="text-xs font-bold uppercase tracking-[0.18em] text-[var(--midnight)]/50">In This Article</h2>
              <ol className="mt-3 space-y-2 text-sm">
                {doc.toc.map((entry) => (
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