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
  images: {
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    localPatterns: [
      { pathname: "/spoods/**" },
      { pathname: "/uploads/**" },
    ],
  },
};

export default nextConfig;
