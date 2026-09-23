/** Inspect verification state for one test inbox in the isolated staging DB. */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { assertStagingEnvironment } from "../src/lib/staging-guard.ts";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
dotenv.config({ path: resolve(root, ".env.local"), override: true, quiet: true });
if (process.env.SPOODLY_ENV !== "staging") throw new Error("Staging marker is required.");
assertStagingEnvironment(process.env);
const email = (process.argv[2] || "").trim().toLowerCase();
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Provide one test email address.");
const prisma = new PrismaClient();
try {
  const [account, challenge] = await Promise.all([
    prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, passwordHash: true, emailVerified: true },
    }),
    prisma.pendingEmailVerification.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      orderBy: { createdAt: "desc" },
      select: { purpose: true, createdAt: true, expiresAt: true, consumedAt: true },
    }),
  ]);
  console.log(JSON.stringify({
    accountExists: Boolean(account),
    passwordAccount: Boolean(account?.passwordHash),
    emailVerified: Boolean(account?.emailVerified),
    latestChallenge: challenge ? {
      purpose: challenge.purpose,
      createdAt: challenge.createdAt.toISOString(),
      expiresAt: challenge.expiresAt.toISOString(),
      consumed: Boolean(challenge.consumedAt),
    } : null,
  }));
} finally {
  await prisma.$disconnect();
}
