import assert from "node:assert/strict";
import { it } from "node:test";
import { isPublicSiteHost, wwwTwin } from "./public-site";

it("allows the canonical origin host and its www twin, nobody else", () => {
  const env = { AUTH_URL: "https://example.com", VERCEL_PROJECT_ID: undefined };
  assert.equal(isPublicSiteHost(env, "example.com"), true);
  assert.equal(isPublicSiteHost(env, "www.example.com"), true);
  assert.equal(isPublicSiteHost(env, "other.example.com"), false);
  assert.equal(isPublicSiteHost(env, "spoodly-space-preview.vercel.app"), false);
});

it("falls back to NEXTAUTH_URL when AUTH_URL is absent", () => {
  const env = { AUTH_URL: undefined, NEXTAUTH_URL: "https://www.example.com", VERCEL_PROJECT_ID: undefined };
  assert.equal(isPublicSiteHost(env, "www.example.com"), true);
  assert.equal(isPublicSiteHost(env, "example.com"), true);
});

it("disallows on staging even when the request host matches the canonical origin", () => {
  const env = { SPOODLY_ENV: "staging", AUTH_URL: "https://staging.example" };
  assert.equal(isPublicSiteHost(env, "staging.example"), false);
  const envById = { SPOODLY_ENV: "production", VERCEL_PROJECT_ID: "prj_WrjgdWSnmp1RV5C0qz9vPckFj2pO", AUTH_URL: "https://staging.example" };
  assert.equal(isPublicSiteHost(envById, "staging.example"), false);
});

it("disallows when the canonical origin is missing, empty, or malformed", () => {
  assert.equal(isPublicSiteHost({}, "example.com"), false);
  assert.equal(isPublicSiteHost({ AUTH_URL: "" }, "example.com"), false);
  assert.equal(isPublicSiteHost({ AUTH_URL: "not a url" }, "example.com"), false);
});

it("compares hostnames case-insensitively and ignores the canonical port", () => {
  const env = { AUTH_URL: "https://EXAMPLE.com:8443", VERCEL_PROJECT_ID: undefined };
  assert.equal(isPublicSiteHost(env, "example.com"), true);
  assert.equal(isPublicSiteHost(env, "www.example.com"), true);
});

it("derives the apex/www twin by one www label", () => {
  assert.equal(wwwTwin("example.com"), "www.example.com");
  assert.equal(wwwTwin("www.example.com"), "example.com");
  assert.equal(wwwTwin("www.sub.example.com"), "sub.example.com");
});
