import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter, splitFrontmatter } from "./schema";
import { renderMarkdown, type TocEntry } from "./markdown";
import type { ZodType } from "zod";

export const CONTENT_ROOT = path.join(process.cwd(), "src", "content");

export type ContentDoc<Frontmatter> = Frontmatter & { html: string; toc: TocEntry[] };
export type ContentMeta<Frontmatter> = Omit<ContentDoc<Frontmatter>, "html" | "toc" | "draft">;

type LoaderConfig<Frontmatter extends { slug: string; draft?: boolean }> = {
  /** Domain directory under src/content, e.g. "legal". */
  dirName: string;
  schema: ZodType<Frontmatter>;
  /** Deterministic ordering for listings; defaults to alphabetical by slug. */
  sort?: (a: Frontmatter, b: Frontmatter) => number;
};

type Stored<Frontmatter extends { slug: string; draft?: boolean }> = { frontmatter: Frontmatter; html: string; toc: TocEntry[] };

/** Builds the standard filesystem content loader for one domain: memoized
 * scan + zod-validated frontmatter + rendered markdown. Drafts stay cached
 * but never leave the loader. Malformed frontmatter and duplicate slugs
 * throw with filenames named so bad content fails the build. */
export function createContentLoader<Frontmatter extends { slug: string; draft?: boolean }>(config: LoaderConfig<Frontmatter>) {
  const defaultDir = path.join(CONTENT_ROOT, config.dirName);
  const cache = new Map<string, Stored<Frontmatter>[]>();

  function load(dir: string): Stored<Frontmatter>[] {
    const cached = cache.get(dir);
    if (cached) return cached;
    const files = readdirSync(dir).filter((name) => name.endsWith(".md")).sort();
    const stored: Stored<Frontmatter>[] = [];
    const seen = new Map<string, string>();
    for (const fileName of files) {
      const raw = readFileSync(path.join(dir, fileName), "utf8");
      const split = splitFrontmatter(raw);
      if (!split) throw new Error(`Missing frontmatter in ${fileName}`);
      const values = parseFrontmatter(split.frontmatter);
      const result = config.schema.safeParse(values);
      if (!result.success) throw new Error(`Invalid frontmatter in ${fileName}: ${result.error.issues[0]?.message ?? "unknown"}`);
      const first = seen.get(result.data.slug);
      if (first) throw new Error(`Duplicate slug "${result.data.slug}" in ${dir} (${first}, ${fileName})`);
      seen.set(result.data.slug, fileName);
      const { html, toc } = renderMarkdown(split.body);
      stored.push({ frontmatter: result.data, html, toc });
    }
    const sorted = config.sort ? stored.sort((a, b) => config.sort!(a.frontmatter, b.frontmatter)) : stored.sort((a, b) => a.frontmatter.slug.localeCompare(b.frontmatter.slug));
    cache.set(dir, sorted);
    return sorted;
  }

  function isDraft(entry: Stored<Frontmatter>): boolean {
    return entry.frontmatter.draft === true;
  }

  return {
    list(root?: string): Array<ContentMeta<Frontmatter>> {
      return load(root ?? defaultDir)
        .filter((entry) => !isDraft(entry))
        .map(({ frontmatter }) => {
          const { draft: _draft, ...meta } = frontmatter;
          void _draft;
          // TS cannot distribute Omit over an unresolved generic; the runtime
          // shape (frontmatter minus draft) is exactly ContentMeta.
          return meta as ContentMeta<Frontmatter>;
        });
    },
    get(slug: string, root?: string): ContentDoc<Frontmatter> | null {
      const entry = load(root ?? defaultDir).find((candidate) => candidate.frontmatter.slug === slug && !isDraft(candidate));
      if (!entry) return null;
      const { draft: _draft, ...frontmatter } = entry.frontmatter;
      void _draft;
      return { ...frontmatter, html: entry.html, toc: entry.toc } as ContentDoc<Frontmatter>;
    },
  };
}