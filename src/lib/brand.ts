// Single source of truth for brand identity across the public site and the app.
// Pages, emails, and metadata read from here; no hardcoded brand strings elsewhere.
export const BRAND = {
  name: "Polly's Web",
  tagline: "Happier, Healthier Spoods.",
  emails: {
    support: "support@pollysweb.com",
    bugs: "bugs@pollysweb.com",
    ideas: "ideas@pollysweb.com",
    partnerships: "partnerships@pollysweb.com",
  },
  // Empty value = hide the icon (until real profile URLs are supplied).
  social: {
    instagram: "",
    youtube: "",
    tiktok: "",
    facebook: "",
    pinterest: "",
  },
} as const;

export const BRAND_LOGO_SRC = "/brand/pollys-logo-mark.png";
// White-text variant for the dark footer (purple recolored, art preserved).
export const BRAND_LOGO_WHITE_SRC = "/brand/pollys-logo-white.png";

// Use a small optimized raster for browser/home-screen icons as well.
export const BRAND_ICON_SRC = `/_next/image?url=${encodeURIComponent(BRAND_LOGO_SRC)}&w=256&q=75`;