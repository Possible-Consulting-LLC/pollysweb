import { createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { z } from "zod";

const PASSWORD_HASH_VERSION = "spoodly-password-v2$";

export const newPasswordSchema = z.string()
  .refine((password) => Array.from(password).length >= 15, "Password must be at least 15 characters.")
  .refine((password) => Array.from(password).length <= 128, "Password must be no more than 128 characters.");

export function validatePasswordChange(currentPassword: string, newPassword: string, confirmPassword: string): string | null {
  if (currentPassword.length < 6) return "Enter your current password.";
  const parsed = newPasswordSchema.safeParse(newPassword);
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Enter a valid new password.";
  if (newPassword !== confirmPassword) return "New passwords don’t match.";
  if (currentPassword === newPassword) return "Pick a new password that’s different from the current one.";
  return null;
}

function prehash(password: string): string {
  return createHash("sha256")
    .update("spoodly-space-password-v2\0", "utf8")
    .update(password, "utf8")
    .digest("hex");
}

export async function hashNewPassword(password: string): Promise<string> {
  return PASSWORD_HASH_VERSION + await bcrypt.hash(prehash(password), 10);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (storedHash.startsWith(PASSWORD_HASH_VERSION)) {
    return bcrypt.compare(prehash(password), storedHash.slice(PASSWORD_HASH_VERSION.length));
  }
  return bcrypt.compare(password, storedHash);
}
