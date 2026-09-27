/** Pure helpers shared by the admin list surfaces (features catalog, plan
 * editor matrix). No React, no server deps — safe for every test loader. */

/** Build a list URL preserving search and page; `open` is dropped by pagers
 * so paging always folds the accordion. */
export const listHref = (basePath: string, search: string, page: number, open?: string) =>
  `${basePath}?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page),
    ...(open ? { open } : {}) })}`;

/** S13d: a list holding less than one page of rows renders NO search input
 * (owner ruling: "we also shouldn't show a search box when there's only a few
 * options — less than a page worth"). The pager hides under the same condition
 * (S12); the S13c select pair and the counter stay regardless of list size.
 * `total` is the COMMITTED list size — never the narrowed match count, so a
 * live query can never hide its own input (a hidden input simply never fires
 * onType; the narrowing machinery keeps working). */
export const searchHiddenFor = (total: number, pageSize: number): boolean =>
  total < Math.max(1, pageSize);

/** 'spoods' → 'Spoods'. */
export const categoryLabel = (category: string) =>
  category.charAt(0).toUpperCase() + category.slice(1);

/** Mockup-parity class constants (Task 7): every color comes from a theme
 * token so both themes render correctly by construction. */
export const counterChipClass =
  'shrink-0 whitespace-nowrap rounded-full bg-[var(--gold)] px-3 py-1.5 text-xs font-bold text-[var(--panel)]';
/** Tinted pill (identity badges): lavender ground. */
export const badgeTintClass =
  'rounded-full bg-[var(--lavender)] px-2.5 py-0.5 text-[10.5px] font-bold tracking-wide text-[var(--midnight)]';
/** On/positive pill: hover ground + plum-tinted border. */
export const badgeOnClass =
  'rounded-full border border-[var(--plum)]/30 bg-[var(--hover)] px-2.5 py-0.5 text-[10.5px] font-bold tracking-wide text-[var(--plum)]';
/** Off/negative pill: dashed lavender border, muted. */
export const badgeOffClass =
  'rounded-full border border-dashed border-[var(--lavender-deep)] px-2.5 py-0.5 text-[10.5px] font-bold tracking-wide opacity-45';
