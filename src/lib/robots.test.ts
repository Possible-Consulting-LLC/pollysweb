import assert from "node:assert/strict";
import { it } from "node:test";
import { GET } from "../app/robots.txt/route";

it("disallows all crawling on staging, preview aliases, and local hosts", async () => {
  for (const host of [
    "staging.spoodlyspace.com",
    "spoodly-space-staging.vercel.app",
    "spoodly-space-preview.vercel.app",
    "localhost:43123",
  ]) {
    const response = GET(new Request(`https://${host}/robots.txt`));
    assert.equal(await response.text(), "User-agent: *\nDisallow: /\n", host);
  }
});

it("allows public-site crawling while excluding app and API routes", async () => {
  for (const host of ["spoodlyspace.com", "www.spoodlyspace.com"]) {
    const response = GET(new Request(`https://${host}/robots.txt`));
    const body = await response.text();
    assert.match(body, /^Allow: \/$/m);
    assert.match(body, /^Disallow: \/spoods$/m);
    assert.match(body, /^Disallow: \/api\/$/m);
    assert.match(body, /^Allow: \/api\/brand\/$/m);
    assert.equal(response.headers.get("Content-Type"), "text/plain; charset=utf-8");
    assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
});
