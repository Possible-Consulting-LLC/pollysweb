import { z } from "zod";
import { createContentLoader, CONTENT_ROOT } from "./loader";
import type { TocEntry } from "./markdown";

export { CONTENT_ROOT };

const legalFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  order: z.number().int(),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "lastUpdated must be YYYY-MM-DD"),
  draft: z.boolean().optional(),
});

type LegalFrontmatter = z.infer<typeof legalFrontmatterSchema>;

export type LegalDoc = LegalFrontmatter & { html: string; toc: TocEntry[] };

const loader = createContentLoader<LegalFrontmatter>({
  dirName: "legal",
  schema: legalFrontmatterSchema,
  sort: (a, b) => a.order - b.order,
});

export function listLegalDocs(root?: string): Array<Omit<LegalDoc, "html" | "toc" | "draft">> {
  return loader.list(root);
}

export function getLegalDoc(slug: string, root?: string): LegalDoc | null {
  return loader.get(slug, root);
}