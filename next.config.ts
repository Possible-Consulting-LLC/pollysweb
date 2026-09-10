import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  experimental: {
    // Match addSpiderPhoto's 5MB cap (plus a little FormData overhead).
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
