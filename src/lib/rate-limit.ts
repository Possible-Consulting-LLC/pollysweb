import { headers } from "next/headers";
import { prisma } from "./db";
import { consumeRateLimits, requestIp, type RateRule } from "./rate-limit-core";

export const RATE_LIMIT_MESSAGE = "Too many attempts, or this service is temporarily unavailable. Please try again later.";

type Action = "admin-delete" | "login" | "register" | "verify-email" | "email-change" | "feedback" | "upload" | "password" | "care";
const QUOTAS: Record<Action, { account: number; ip: number; windowMs: number }> = {
  "admin-delete": { account: 20, ip: 60, windowMs: 15 * 60_000 },
  login: { account: 10, ip: 60, windowMs: 15 * 60_000 },
  register: { account: 3, ip: 10, windowMs: 60 * 60_000 },
  "verify-email": { account: 3, ip: 30, windowMs: 60 * 60_000 },
  "email-change": { account: 3, ip: 30, windowMs: 60 * 60_000 },
  feedback: { account: 5, ip: 20, windowMs: 60 * 60_000 },
  upload: { account: 50, ip: 150, windowMs: 24 * 60 * 60_000 },
  password: { account: 5, ip: 20, windowMs: 15 * 60_000 },
  care: { account: 120, ip: 400, windowMs: 24 * 60 * 60_000 },
};

export async function allowAction(action: Action, identity: string, requestHeaders?: Pick<Headers, "get">): Promise<boolean> {
  const ip = requestIp(requestHeaders ?? await headers());
  const quota = QUOTAS[action];
  const rules: RateRule[] = [
    { scope: `${action}:ip`, identity: ip, limit: quota.ip, windowMs: quota.windowMs },
    { scope: `${action}:account`, identity, limit: quota.account, windowMs: quota.windowMs },
  ];
  return consumeRateLimits(rules, async ({ key, limit, expiresAt }) => {
    // PostgreSQL locks the conflicting row before evaluating the count predicate.
    // This single statement cannot oversubscribe a bucket under parallel requests.
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("id", "count", "expiresAt") VALUES (${key}, 1, ${expiresAt})
      ON CONFLICT ("id") DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      WHERE "RateLimitBucket"."count" < ${limit}
      RETURNING "count"
    `;
    // Bounded cleanup keeps past windows from growing indefinitely. Cleanup failure
    // does not undo the consumed counter or permit an otherwise blocked request.
    try {
      await prisma.$executeRaw`
        DELETE FROM "RateLimitBucket" WHERE "id" IN (
          SELECT "id" FROM "RateLimitBucket" WHERE "expiresAt" < NOW() - INTERVAL '1 day'
          ORDER BY "expiresAt" LIMIT 100
        )
      `;
    } catch { /* Expired rows can be removed on the next request. */ }
    return rows.length === 1;
  });
}
