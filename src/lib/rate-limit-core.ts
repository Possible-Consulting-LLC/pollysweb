import { createHash } from "node:crypto";
import { isIP } from "node:net";

export type RateRule = { scope: string; identity: string; limit: number; windowMs: number };
export type Bucket = { key: string; limit: number; expiresAt: Date };
export type BucketStore = (bucket: Bucket) => Promise<boolean>;

/** Counters must be atomic and shared by every application instance. */
export async function consumeRateLimits(rules: RateRule[], store: BucketStore, now = Date.now()): Promise<boolean> {
  try {
    for (const rule of rules) {
      const window = Math.floor(now / rule.windowMs);
      const identity = createHash("sha256").update(rule.identity).digest("hex");
      const allowed = await store({
        key: `${rule.scope}:${identity}:${window}`,
        limit: rule.limit,
        expiresAt: new Date((window + 1) * rule.windowMs),
      });
      if (!allowed) return false;
    }
    return true;
  } catch {
    // No process-memory fallback: missing migration or unavailable DB blocks abuse-sensitive work.
    return false;
  }
}

/** Vercel overwrites this header. Self-hosting must explicitly configure a trusted proxy header. */
export function requestIp(headers: Pick<Headers, "get">, env: Record<string, string | undefined> = process.env): string {
  const header = env.VERCEL === "1" ? "x-vercel-forwarded-for" : env.RATE_LIMIT_TRUSTED_IP_HEADER;
  const value = header ? headers.get(header)?.split(",")[0]?.trim() : undefined;
  return value && isIP(value) ? value : "unknown";
}
