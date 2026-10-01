import Image from "next/image";
import Link from "next/link";
import { BRAND, BRAND_LOGO_WHITE_SRC } from "@/lib/brand";
import { NAV_ITEMS, FOOTER_LEGAL_SLUGS } from "./nav";

type SocialKey = keyof typeof BRAND.social;

/** Primitive-built glyph badges — lucide 1.41 ships no brand icons. Renders
 * only for platforms whose URL is configured; empty values stay hidden. */
const SOCIAL_GLYPHS: Record<SocialKey, { label: string; glyph: string }> = {
  instagram: { label: "Instagram", glyph: "IG" },
  youtube: { label: "YouTube", glyph: "YT" },
  tiktok: { label: "TikTok", glyph: "TT" },
  facebook: { label: "Facebook", glyph: "FB" },
  pinterest: { label: "Pinterest", glyph: "PIN" },
};

const SOCIAL_KEYS = Object.keys(SOCIAL_GLYPHS) as SocialKey[];

export function SiteFooter() {
  const socials = SOCIAL_KEYS.filter((key) => BRAND.social[key].length > 0);

  return (
    <footer className="bg-[#3b2166] text-[var(--on-panel)]">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Image src={BRAND_LOGO_WHITE_SRC} alt="Polly's Web" width={144} height={48} />
          <p className="mt-3 text-sm text-[var(--on-panel)]/70">{BRAND.tagline}</p>
          {socials.length > 0 ? (
            <ul className="mt-4 flex gap-2">
              {socials.map((key) => (
                <li key={key}>
                  <a
                    href={BRAND.social[key]}
                    aria-label={SOCIAL_GLYPHS[key].label}
                    className="flex h-9 min-w-9 items-center justify-center rounded-full border border-[var(--on-panel)]/25 px-2 text-[11px] font-bold tracking-wide transition hover:bg-[var(--on-panel)]/10"
                  >
                    {SOCIAL_GLYPHS[key].glyph}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <nav aria-label="Quick links">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--on-panel)]/60">Quick Links</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {NAV_ITEMS.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="transition hover:text-white">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-label="Legal">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--on-panel)]/60">Legal</h3>
          <ul className="mt-4 space-y-2 text-sm">
            {FOOTER_LEGAL_SLUGS.map((slug) => (
              <li key={slug}>
                <Link href={`/legal/${slug}`} className="transition hover:text-white">
                  {slugTitle(slug)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div data-slot="newsletter">
          <h3 className="text-sm font-bold uppercase tracking-wider text-[var(--on-panel)]/60">Join Our Spood Community</h3>
          <p className="mt-4 text-sm text-[var(--on-panel)]/70">Tips, photos, and friendly spood lovers!</p>
        </div>
      </div>

      <div className="border-t border-[var(--on-panel)]/15 py-5 text-center text-xs text-[var(--on-panel)]/60">
        © 2026 {BRAND.name}. All rights reserved.
      </div>
    </footer>
  );
}

function slugTitle(slug: string): string {
  const titles: Record<(typeof FOOTER_LEGAL_SLUGS)[number], string> = {
    "terms-of-service": "Terms of Service",
    "privacy-policy": "Privacy Policy",
    "cookie-policy": "Cookie Policy",
    "community-guidelines": "Community Guidelines",
    "acceptable-use": "Acceptable Use Policy",
    copyright: "Copyright & IP",
    disclaimer: "Disclaimer",
    "data-deletion": "Data Deletion",
    accessibility: "Accessibility",
  };
  return titles[slug as (typeof FOOTER_LEGAL_SLUGS)[number]];
}