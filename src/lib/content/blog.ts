import path from "node:path";
import { z } from "zod";
import { createContentLoader, CONTENT_ROOT } from "./loader";
import type { TocEntry } from "./markdown";

export { CONTENT_ROOT };

const blogFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD"),
  excerpt: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  cover: z.string().min(1).optional(),
  draft: z.boolean().optional(),
});

type BlogFrontmatter = z.infer<typeof blogFrontmatterSchema>;

export type BlogPost = BlogFrontmatter & { html: string; toc: TocEntry[] };

const loader = createContentLoader<BlogFrontmatter>({
  dirName: "blog",
  schema: blogFrontmatterSchema,
  sort: (a, b) => b.date.localeCompare(a.date),
});

export function listBlogPosts(root?: string): Array<Omit<BlogPost, "html" | "toc" | "draft">> {
  return loader.list(root);
}

export function getBlogPost(slug: string, root?: string): BlogPost | null {
  return loader.get(slug, root);
}

export const BLOG_DIR = path.join(CONTENT_ROOT, "blog");