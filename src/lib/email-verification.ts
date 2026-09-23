import { createHash, randomBytes } from "node:crypto";
import { isStaging } from "./staging-guard";

const GRACE_MS = 7 * 24 * 60 * 60_000;
export const CHALLENGE_MS = 30 * 60_000;

export function createVerificationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function verificationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function canUsePasswordAccount(
  user: { passwordHash: string | null; emailVerified: Date | null },
  now: Date,
  activation?: string,
): boolean {
  if (!user.passwordHash || user.emailVerified) return true;
  if (!activation) return true;
  return now.getTime() < activationDeadline(activation).getTime();
}

function activationDeadline(activation: string): Date {
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(activation)) {
    throw new Error("Invalid email verification activation timestamp.");
  }
  const started = Date.parse(activation);
  if (!Number.isFinite(started)) throw new Error("Invalid email verification activation timestamp.");
  return new Date(started + GRACE_MS);
}

export function legacyVerificationDeadline(
  user: { passwordHash: string | null; emailVerified: Date | null },
  now: Date,
  activation?: string,
): Date | null {
  if (!user.passwordHash || user.emailVerified || !activation) return null;
  const deadline = activationDeadline(activation);
  return now < deadline ? deadline : null;
}

type Environment = Record<string, string | undefined>;
export function verificationMailConfig(env: Environment): {
  key: string;
  from: string;
  origin: string;
  allowed: (email: string) => boolean;
} | null {
  const key = env.EMAIL_RESEND_API_KEY?.trim();
  const from = env.EMAIL_FROM_EMAIL?.trim();
  const originRaw = env.EMAIL_VERIFICATION_ORIGIN?.trim() ?? env.AUTH_URL?.trim();
  if (!key || !from || !originRaw || /[\r\n]/.test(from)) return null;
  let origin: URL;
  try { origin = new URL(originRaw); } catch { return null; }
  if ((origin.protocol !== "https:" && !(origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) ||
      origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) return null;
  const staging = isStaging(env);
  const allowlist = (env.EMAIL_ALLOWED_RECIPIENTS ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  if (staging && allowlist.length === 0) return null;
  return { key, from, origin: origin.origin, allowed: (email) => !staging || allowlist.includes(email.toLowerCase()) };
}

export function verificationLink(origin: string, token: string): string {
  const url = new URL("/verify-email", origin);
  url.searchParams.set("token", token);
  return url.toString();
}
