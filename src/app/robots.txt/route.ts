import { isPublicSiteHost } from "@/lib/public-site";

const publicRules = `User-agent: *
Allow: /
Allow: /api/brand/
Disallow: /api/
Disallow: /login
Disallow: /register
Disallow: /home
Disallow: /today
Disallow: /spoods
Disallow: /activity
Disallow: /settings
Disallow: /upgrade
Disallow: /uploads/
`;

export const dynamic = "force-dynamic";

export function GET(request: Request) {
  // Staging deploys as VERCEL_ENV=production; public-ness is not staging and request host
  // matches the configured canonical origin or its www twin.
  const isPublicSite = isPublicSiteHost(process.env, new URL(request.url).hostname);
  return new Response(isPublicSite ? publicRules : "User-agent: *\nDisallow: /\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
