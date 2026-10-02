import { verificationMailConfig } from "./email-verification";
import { isStaging } from "./staging-guard";

type Environment = Record<string, string | undefined>;

export function feedbackMailConfig(env: Environment): { key: string; from: string; to: string } | null {
  if (isStaging(env)) {
    const verification = verificationMailConfig(env);
    const to = env.FEEDBACK_TO_EMAIL?.trim();
    if (!verification || !to || !verification.allowed(to)) return null;
    return { key: verification.key, from: verification.from, to };
  }

  const key = env.RESEND_API_KEY?.trim();
  if (!key) return null;
  return {
    key,
    from: env.RESEND_FROM_EMAIL || "Polly's Web <onboarding@resend.dev>",
    to: env.FEEDBACK_TO_EMAIL || "support@pollysweb.com",
  };
}
