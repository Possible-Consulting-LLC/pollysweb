import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function userCredentialSource(user: { id: string; passwordHash: string | null; authVersion: string; emailChangeVersion?: string | null; adminVersion?: string | null }): string {
  const source = user.passwordHash ?? `oauth:${user.id}:${user.authVersion}`;
  const emailSource = user.emailChangeVersion ? `${source}:email:${user.emailChangeVersion}` : source;
  return user.adminVersion ? `${emailSource}:admin:${user.adminVersion}` : emailSource;
}

export function emailChangeCredentialSnapshot(user: { id: string; passwordHash: string | null; authVersion: string; emailChangeVersion?: string | null; adminVersion?: string | null }): string {
  return createHash("sha256").update(`email-change-credentials:${userCredentialSource(user)}`).digest("hex");
}

export function credentialFingerprint(passwordHash: string, secret: string): string {
  return createHmac("sha256", secret).update(`session-credentials:${passwordHash}`).digest("hex");
}

export function matchesCredentialFingerprint(value: unknown, passwordHash: string, secret: string): boolean {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) return false;
  return timingSafeEqual(Buffer.from(value, "hex"), Buffer.from(credentialFingerprint(passwordHash, secret), "hex"));
}
