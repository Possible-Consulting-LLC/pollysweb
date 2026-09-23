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
  // Staging is a separate Vercel project whose stable deployment also has
  // VERCEL_ENV=production. Only the public site's domains permit crawling.
  const hostname = new URL(request.url).hostname;
  const isPublicSite = hostname === "spoodlyspace.com" || hostname === "www.spoodlyspace.com";
  return new Response(isPublicSite ? publicRules : "User-agent: *\nDisallow: /\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
