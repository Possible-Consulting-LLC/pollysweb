import type { MetadataRoute } from "next";

const ROUTES = [
  "", // home
  "/features",
  "/care-guides",
  "/blog",
  "/pricing",
  "/about",
  "/contact",
  "/login",
  "/register",
];

// Legal documents mirror the hub's doc list.
const LEGAL_SLUGS = [
  "overview",
  "terms-of-service",
  "privacy-policy",
  "cookie-policy",
  "community-guidelines",
  "acceptable-use",
  "copyright",
  "disclaimer",
  "data-deletion",
  "accessibility",
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    ...ROUTES.map((route) => ({ url: `https://www.pollysweb.com${route}`, lastModified: now })),
    ...LEGAL_SLUGS.map((slug) => ({ url: `https://www.pollysweb.com/legal/${slug}`, lastModified: now })),
    // /help is intentionally excluded: the page exists but is unlisted until
    // its content pass (see plan ledger).
  ];
}