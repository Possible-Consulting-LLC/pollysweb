import test from "node:test";
import assert from "node:assert/strict";
import { consumeRateLimits, requestIp, type Bucket } from "../rate-limit-core";

test("shared store enforces quota across concurrent callers and window resets", async () => {
  const counts = new Map<string, number>();
  const store = async (bucket: Bucket) => {
    const count = counts.get(bucket.key) ?? 0;
    if (count >= bucket.limit) return false;
    counts.set(bucket.key, count + 1);
    return true;
  };
  const rules = [{ scope: "login", identity: "account@example.com", limit: 3, windowMs: 1000 }];
  const results = await Promise.all(Array.from({ length: 20 }, () => consumeRateLimits(rules, store, 100)));
  assert.equal(results.filter(Boolean).length, 3);
  assert.equal(await consumeRateLimits(rules, store, 1100), true);
  assert.equal([...counts.keys()].some((key) => key.includes("account@example.com")), false);
});
test("limiter rejects if either account or IP bucket is exhausted and fails closed", async () => {
  const rules = [{ scope: "account", identity: "a", limit: 2, windowMs: 1000 }, { scope: "ip", identity: "b", limit: 2, windowMs: 1000 }];
  let calls = 0;
  assert.equal(await consumeRateLimits(rules, async () => ++calls === 1, 100), false);
  assert.equal(await consumeRateLimits(rules, async () => { throw new Error("storage unavailable"); }, 100), false);
});
test("IP identity ignores spoofable forwarded headers unless a trusted platform is configured", () => {
  const headers = new Headers({ "x-forwarded-for": "attacker", "x-vercel-forwarded-for": "203.0.113.1" });
  assert.equal(requestIp(headers, {}), "unknown");
  assert.equal(requestIp(headers, { VERCEL: "1" }), "203.0.113.1");
});
