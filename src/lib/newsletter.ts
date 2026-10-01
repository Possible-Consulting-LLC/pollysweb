import { z } from "zod";

const emailSchema = z.email();

/** Pure input validation shared by tests and the newsletter action: accepts a
 * single candidate email, lowercases it, and rejects everything else. */
export function validateNewsletterInput(raw: unknown): { email: string } | { error: string } {
  if (typeof raw !== "string") return { error: "Please enter your email address." };
  const parsed = emailSchema.safeParse(raw.trim());
  if (!parsed.success) return { error: "Please enter a valid email address." };
  return { email: parsed.data.toLowerCase() };
}