import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { legalFrontmatterSchema, parseFrontmatter, splitFrontmatter } from "./schema";
import { renderMarkdown, type TocEntry } from "./markdown";

export const CONTENT_ROOT = path.join(process.cwd(), "src", "content");
const LEGAL_DIR = path.join(CONTENT_ROOT, "legal");

export type LegalDoc = {
  title: string;
  slug: string;
  order: number;
  lastUpdated: string;
  html: string;
  toc: TocEntry[];
};

// Scanned + rendered once per content root per process, then memoized: the
// directory is repo-authored and changes only between builds. Drafts stay in
// the cache but never leave the loaders.
const cache = new Map<string, LegalDoc[]>();

function loadDocs(root: string): LegalDoc[] {
  const cached = cache.get(root);
  if (cached) return cached;
  const files = readdirSync(root).filter((name) => name.endsWith(".md")).sort();
  const docs: LegalDoc[] = [];
  const seen = new Map<string, string>();
  for (const fileName of files) {
    const raw = readFileSync(path.join(root, fileName), "utf8");
    const split = splitFrontmatter(raw);
    if (!split) throw new Error(`Missing frontmatter in ${fileName}`);
    const values = parseFrontmatter(split.frontmatter);
    const result = legalFrontmatterSchema.safeParse(values);
    if (!result.success) throw new Error(`Invalid frontmatter in ${fileName}: ${result.error.issues[0]?.message ?? "unknown"}`);
    const { html, toc } = renderMarkdown(split.body);
    const first = seen.get(result.data.slug);
    if (first) throw new Error(`Duplicate legal slug "${result.data.slug}" in ${root} (${first}, ${fileName})`);
    seen.set(result.data.slug, fileName);
    docs.push({ title: result.data.title, slug: result.data.slug, order: result.data.order, lastUpdated: result.data.lastUpdated, html, toc, draft: result.data.draft } as LegalDoc & { draft?: boolean });
  }
  const sorted = docs.sort((a, b) => a.order - b.order);
  cache.set(root, sorted);
  return sorted;
}

/** All legal docs (drafts excluded), sorted by their frontmatter order. */
export function listLegalDocs(root: string = LEGAL_DIR): Array<Omit<LegalDoc, "html" | "toc">> {
  return loadDocs(root)
    .filter((doc) => !(doc as { draft?: boolean }).draft)
    .map(({ title, slug, order, lastUpdated }) => ({ title, slug, order, lastUpdated }));
}

/** One legal doc by slug (drafts excluded), with rendered html + TOC. */
export function getLegalDoc(slug: string, root: string = LEGAL_DIR): LegalDoc | null {
  const doc = loadDocs(root).find((entry) => entry.slug === slug && !(entry as { draft?: boolean }).draft);
  if (!doc) return null;
  const { title, order, lastUpdated, html, toc } = doc;
  return { title, slug, order, lastUpdated, html, toc };
}