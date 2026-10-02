import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";
import { listBlogPosts } from "@/lib/content/blog";

export const metadata: Metadata = {
  title: "Blog | Polly's Web",
  description: "Care tips, product news, and stories from the spood keeper community.",
};

const TAG_ART: Record<string, { gradient: string; emoji: string }> = {
  welcome: { gradient: "from-[var(--lavender)]/70 via-[var(--cream)] to-orange-100/70", emoji: "🧡" },
  news: { gradient: "from-[var(--lavender)]/70 via-[var(--cream)] to-orange-100/70", emoji: "🧡" },
  beginners: { gradient: "from-emerald-100/90 via-[var(--cream)] to-lime-50", emoji: "🕷️" },
  care: { gradient: "from-emerald-100/90 via-[var(--cream)] to-lime-50", emoji: "🕷️" },
  feeding: { gradient: "from-orange-100/90 via-[var(--cream)] to-amber-50", emoji: "🍴" },
};

function artFor(tags: string[]): { gradient: string; emoji: string } {
  for (const tag of tags) {
    if (TAG_ART[tag]) return TAG_ART[tag];
  }
  return { gradient: "from-[var(--lavender)]/60 via-[var(--cream)] to-orange-100/60", emoji: "🕸️" };
}

export default function BlogIndexPage() {
  const posts = listBlogPosts();
  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-12 sm:px-8">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-[var(--plum)]">The spood journal</p>
        <h1 className="mt-3 font-[family-name:var(--font-display)] text-5xl font-bold tracking-[-0.02em] text-[var(--plum-deep)] sm:text-6xl">
          Blog
        </h1>
        <p className="mt-4 text-lg text-[var(--midnight)]/65">
          Care tips, product news, and stories from the spood keeper community.
        </p>
      </div>

      {featured ? (
        <Link
          href={`/blog/${featured.slug}`}
          className="group mt-12 grid overflow-hidden rounded-[2rem] border border-[var(--plum)]/10 bg-[var(--card-solid)] shadow-[0_12px_40px_var(--shadow)] transition hover:border-[var(--plum)]/25 lg:grid-cols-[1fr_1.2fr]"
        >
          <span
            aria-hidden
            className={`flex min-h-44 items-center justify-center bg-gradient-to-br text-5xl ${artFor(featured.tags).gradient}`}
          >
            {artFor(featured.tags).emoji}
          </span>
          <span className="flex flex-col justify-center p-6 sm:p-8">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-[var(--lavender)]/70 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[var(--plum)]">
              Featured
            </span>
            <span className="mt-3 font-[family-name:var(--font-display)] text-3xl font-bold text-[var(--midnight)]">
              {featured.title}
            </span>
            <span className="mt-2 leading-7 text-[var(--midnight)]/65">{featured.excerpt}</span>
            <span className="mt-4 inline-flex items-center gap-4 text-sm text-[var(--midnight)]/55">
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="h-4 w-4" aria-hidden />
                {featured.date}
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-[var(--plum)] transition group-hover:gap-2">
                Read Post <ArrowRight className="h-4 w-4" aria-hidden />
              </span>
            </span>
          </span>
        </Link>
      ) : null}

      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {rest.map((post) => {
          const art = artFor(post.tags);
          return (
            <Link
              key={post.slug}
              href={`/blog/${post.slug}`}
              className="group flex flex-col overflow-hidden rounded-3xl border border-[var(--plum)]/10 bg-[var(--card-solid)] shadow-[0_8px_30px_var(--shadow)] transition hover:border-[var(--plum)]/25"
            >
              <span aria-hidden className={`flex h-28 items-center justify-center bg-gradient-to-br text-3xl ${art.gradient}`}>
                {art.emoji}
              </span>
              <span className="flex flex-1 flex-col p-5">
                <span className="font-[family-name:var(--font-display)] text-lg font-bold text-[var(--midnight)]">
                  {post.title}
                </span>
                <span className="mt-2 flex-1 text-sm leading-6 text-[var(--midnight)]/65">{post.excerpt}</span>
                <span className="mt-4 inline-flex items-center justify-between text-sm text-[var(--midnight)]/55">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" aria-hidden />
                    {post.date}
                  </span>
                  <span className="inline-flex items-center gap-1 font-bold text-[var(--plum)] transition group-hover:gap-2">
                    Read <ArrowRight className="h-4 w-4" aria-hidden />
                  </span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}