import path from "node:path";
import { z } from "zod";
import { createContentLoader, CONTENT_ROOT } from "./loader";
import type { TocEntry } from "./markdown";

export { CONTENT_ROOT };

export const GUIDE_CATEGORIES = [
  { key: "feeding", label: "Feeding" },
  { key: "water", label: "Water" },
  { key: "molting", label: "Molting" },
  { key: "handling", label: "Handling" },
  { key: "cleaning", label: "Cleaning" },
  { key: "life-stages", label: "Life Stages" },
  { key: "health", label: "Health" },
  { key: "species-profiles", label: "Species Profiles" },
] as const;

export type GuideCategory = (typeof GUIDE_CATEGORIES)[number]["key"];

const guideCategoryKeys = GUIDE_CATEGORIES.map((category) => category.key) as [GuideCategory, ...GuideCategory[]];

const guideFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  category: z.enum(guideCategoryKeys),
  icon: z.string().min(1),
  readingTime: z.number().int().min(1),
  excerpt: z.string().min(1),
  draft: z.boolean().optional(),
});

type GuideFrontmatter = z.infer<typeof guideFrontmatterSchema>;

export type GuideDoc = GuideFrontmatter & { html: string; toc: TocEntry[] };

const loader = createContentLoader<GuideFrontmatter>({
  dirName: "guides",
  schema: guideFrontmatterSchema,
});

export function listGuides(root?: string): Array<Omit<GuideDoc, "html" | "toc" | "draft">> {
  return loader.list(root);
}

export function getGuide(slug: string, root?: string): GuideDoc | null {
  return loader.get(slug, root);
}

export const GUIDES_DIR = path.join(CONTENT_ROOT, "guides");