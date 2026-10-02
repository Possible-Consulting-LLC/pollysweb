// Shared navigation data for the public marketing chrome. The header, the
// mobile drawer, and the footer all read from here so link order and targets
// can never drift between surfaces.

export type NavKey = "features" | "care-guides" | "blog" | "pricing" | "about" | "contact";

export const NAV_ITEMS: Array<{ key: NavKey; label: string; href: string }> = [
  { key: "features", label: "Features", href: "/features" },
  { key: "care-guides", label: "Care Guides", href: "/care-guides" },
  { key: "blog", label: "Blog", href: "/blog" },
  { key: "pricing", label: "Pricing", href: "/pricing" },
  { key: "about", label: "About", href: "/about" },
  { key: "contact", label: "Contact", href: "/contact" },
];

// The help center lives at /help but stays out of navigation and (later) the
// sitemap until its content pass is done — reachable by direct URL only.

// The five documents shown in the footer's Legal column (per review: the full
// set lives on the legal hub; the footer carries the essentials only).
export const FOOTER_LEGAL_SLUGS = [
  "terms-of-service",
  "privacy-policy",
  "cookie-policy",
  "community-guidelines",
  "acceptable-use",
] as const;

/** Resolves a pathname to the nav item that owns it: exact href or a path
 * nested under it. Home (and anything unowned) returns null. */
export function activeNavKey(pathname: string): NavKey | null {
  for (const item of NAV_ITEMS) {
    if (pathname === item.href || pathname.startsWith(`${item.href}/`)) return item.key;
  }
  return null;
}