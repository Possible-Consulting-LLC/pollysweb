import { z } from "zod";

/** Frontmatter in our content files is a controlled scalar subset of YAML
 * (single key/value lines; quote values that contain colons). A dedicated
 * parser would add deps for content we author ourselves — if content ever
 * needs richer YAML, swap this parser without changing the public interface. */
export const legalFrontmatterSchema = z.object({
  title: z.string().min(1),
  slug: z.string().min(1),
  order: z.number().int(),
  lastUpdated: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "lastUpdated must be YYYY-MM-DD"),
  draft: z.boolean().optional(),
});

export type LegalFrontmatter = z.infer<typeof legalFrontmatterSchema>;

export type LegalDocMeta = {
  title: string;
  slug: string;
  order: number;
  lastUpdated: string;
};

/** Parses the scalar subset: `key: value` lines, optional quoting, numbers,
 * true/false, and single-line inline arrays (`[a, b]`). Anything else is
 * rejected by the zod schemas downstream. */
export function parseFrontmatter(raw: string): Record<string, string | number | boolean | string[]> {
  const values: Record<string, string | number | boolean | string[]> = {};
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf(":");
    if (separator === -1) throw new Error(`Invalid frontmatter line: ${trimmed}`);
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    } else if (value.startsWith("[") && value.endsWith("]")) {
      values[key] = value
        .slice(1, -1)
        .split(",")
        .map((item) => item.trim().replace(/^["']|["']$/g, ""))
        .filter((item) => item.length > 0);
      continue;
    }
    if (value === "true") values[key] = true;
    else if (value === "false") values[key] = false;
    else if (/^-?\d+$/.test(value)) values[key] = Number(value);
    else values[key] = value;
  }
  return values;
}

/** Splits `---\n{frontmatter}\n---\n{body}` and returns both parts, or null
 * when no frontmatter block is present. */
export function splitFrontmatter(source: string): { frontmatter: string; body: string } | null {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(source);
  if (!match) return null;
  return { frontmatter: match[1], body: match[2] ?? "" };
}