import type { NextConfig } from "next";
import { assertStagingEnvironment, isStaging } from "./src/lib/staging-guard";

assertStagingEnvironment();

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    // Framework ceiling only; Vercel's 4.5MB request cap still applies.
    // Photo inputs enforce 4MB before submission to leave room for form data.
    serverActions: {
      bodySizeLimit: "6mb",
    },
  },
  // Keep legacy brand URLs pointed at the canonical logo asset.
  async rewrites() {
    return [
      {
        source: "/brand/spoodly-logo.png",
        destination: "/brand/spoodly-logo-mark.png",
      },
      {
        source: "/brand/spoodly-logo-hero.png",
        destination: "/brand/spoodly-logo-mark.png",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      ...(isStaging() ? [{
        source: "/:path*",
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" }],
      }] : []),
      {
        source: "/brand/spoodly-logo-mark.png",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=86400",
          },
        ],
      },
    ];
  },
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    localPatterns: [
      { pathname: "/spoods/**" },
      { pathname: "/uploads/**" },
      { pathname: "/brand/**" },
      { pathname: "/api/brand/**" },
    ],
  },
};

export default nextConfig;
