import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, CalendarDays, ChevronRight, Tag } from "lucide-react";
import { getBlogPost, listBlogPosts } from "@/lib/content/blog";
import { NewsletterForm } from "@/components/marketing/newsletter-form";

type Params = { slug: string };

export function generateStaticParams(): Params[] {
  return listBlogPosts().map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) return { title: "Blog | Polly's Web" };
  return { title: `${post.title} | Polly's Web`, description: post.excerpt };
}

export default async function BlogPostPage({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) notFound();

  const posts = listBlogPosts();
  const index = posts.findIndex((entry) => entry.slug === post.slug);
  const newer = index > 0 ? posts[index - 1] : null;
  const older = index < posts.length - 1 ? posts[index + 1] : null;

  return (
    <div className="mx-auto w-full max-w-4xl px-5 py-10 sm:px-8">
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-sm text-[var(--midnight)]/60">
        <Link href="/blog" className="font-semibold transition hover:text-[var(--plum)]">
          Blog
        </Link>
        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
        <span aria-current="page" className="truncate font-semibold text-[var(--plum)]">
          {post.title}
        </span>
      </nav>

      <article>
        <header className="mt-6">
          <h1 className="font-[family-name:var(--font-display)] text-4xl font-bold leading-tight tracking-[-0.02em] text-[var(--midnight)] sm:text-5xl">
            {post.title}
          </h1>
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm text-[var(--midnight)]/55">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4" aria-hidden />
              {post.date}
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Tag className="h-4 w-4" aria-hidden />
              {post.tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[var(--lavender)]/60 px-3 py-1 text-xs font-bold text-[var(--plum)]">
                  {tag}
                </span>
              ))}
            </span>
          </div>
        </header>

        <div
          className="content-prose mt-8"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />

        <div className="mt-12 rounded-3xl border border-[var(--plum)]/10 bg-[var(--card)] p-6 sm:p-8">
          <h2 className="font-[family-name:var(--font-display)] text-2xl font-bold text-[var(--midnight)]">
            Join Our Spood Community
          </h2>
          <p className="mt-2 text-[var(--midnight)]/65">
            Tips, photos, and friendly spood lovers — straight to your inbox.
          </p>
          <NewsletterForm />
        </div>

        <nav aria-label="More posts" className="mt-12 grid gap-3 border-t border-[var(--plum)]/10 pt-6 sm:grid-cols-2">
          {older ? (
            <Link href={`/blog/${older.slug}`} className="rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 transition hover:border-[var(--plum)]/25">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--midnight)]/50">
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden /> Older post
              </span>
              <span className="mt-1 block font-bold text-[var(--plum)]">{older.title}</span>
            </Link>
          ) : (
            <span aria-hidden className="hidden sm:block" />
          )}
          {newer ? (
            <Link href={`/blog/${newer.slug}`} className="rounded-2xl border border-[var(--plum)]/10 bg-[var(--card-solid)] p-4 text-right transition hover:border-[var(--plum)]/25 sm:col-start-2">
              <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--midnight)]/50">
                Newer post <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </span>
              <span className="mt-1 block font-bold text-[var(--plum)]">{newer.title}</span>
            </Link>
          ) : null}
        </nav>
      </article>
    </div>
  );
}