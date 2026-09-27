/** Pure helpers shared by the admin list surfaces (features catalog, plan
 * editor matrix). No React, no server deps — safe for every test loader. */

/** Build a list URL preserving search and page; `open` is dropped by pagers
 * so paging always folds the accordion. */
export const listHref = (basePath: string, search: string, page: number, open?: string) =>
  `${basePath}?${new URLSearchParams({ ...(search ? { search } : {}), page: String(page),
    ...(open ? { open } : {}) })}`;

/** 'spoods' → 'Spoods'. */
export const categoryLabel = (category: string) =>
  category.charAt(0).toUpperCase() + category.slice(1);
