/** Pure server-side helpers backing every admin list surface (plans, features,
 * user picker). Parsing and clamping live here so pages never hand-roll
 * pagination math and searches always reset to a valid page. */

export type ListQueryDefaults = { page?: number; pageSize?: number; search?: string };
export type ParsedListQuery = { page: number; pageSize: number; search: string; offset: number };

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : fallback;
}

/** Parse `page`/`pageSize`/`search` search params into a query the services can
 * hand to Prisma. Invalid or out-of-range values fall back to the defaults
 * (page 1, 20 per page, empty search); search is trimmed. */
export function parseListQuery(
  searchParams: Record<string, string | string[] | undefined>,
  defaults: ListQueryDefaults = {},
): ParsedListQuery {
  const page = positiveInt(firstValue(searchParams.page), defaults.page ?? 1);
  const pageSize = positiveInt(firstValue(searchParams.pageSize), defaults.pageSize ?? 20);
  const search = (firstValue(searchParams.search) ?? defaults.search ?? '').trim();
  return { page, pageSize, search, offset: (page - 1) * pageSize };
}

/** Clamp a page number to the valid range for `total` rows of `pageSize`.
 * Empty results always clamp to page 1 so filtered views never strand the user. */
export function clampPage(page: number, total: number, pageSize: number): number {
  const lastPage = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
  return Math.min(Math.max(1, page), lastPage);
}
