import { Resend } from "resend";
import { verificationLink, verificationMailConfig } from "./email-verification";

export function emailDeliveryAvailable(email: string): boolean {
  const config = verificationMailConfig(process.env);
  return Boolean(config?.allowed(email));
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const config = verificationMailConfig(process.env);
  if (!config) throw new Error("Email verification delivery is unavailable.");
  const url = verificationLink(config.origin, token);
  await deliver(email, "Verify your Polly's Web email", `Use this link to verify your email. It expires in 30 minutes:\n\n${url}\n\nIf you did not request this, you can ignore this email.`);
}

export async function sendEmailChangeConfirmation(email: string, token: string): Promise<void> {
  const config = verificationMailConfig(process.env);
  if (!config) throw new Error("Email change delivery is unavailable.");
  const url = verificationLink(config.origin, token);
  await deliver(email, "Confirm your new Polly's Web email", `Confirm this as your new Polly's Web email within 30 minutes:\n\n${url}\n\nYour current login email stays active until you confirm. If you did not request this, ignore this email.`);
}

export async function sendEmailChangeNotice(oldEmail: string, newEmail: string): Promise<void> {
  await deliver(oldEmail, "Polly's Web email change requested", `Someone requested to change the email on your Polly's Web account to ${newEmail}. Your current address remains active unless the new inbox confirms the change. If this was not you, change your password or contact support.`);
}

async function deliver(email: string, subject: string, text: string): Promise<void> {
  const config = verificationMailConfig(process.env);
  if (!config || !config.allowed(email)) throw new Error("Email verification delivery is unavailable.");
  const resend = new Resend(config.key);
  const { error } = await resend.emails.send({
    from: config.from,
    to: email,
    subject,
    text,
  });
  if (error) {
    // Keep the public response generic while retaining a useful, redacted
    // provider diagnostic for staging configuration problems.
    console.error("[verify-email] delivery provider rejected request", {
      name: error.name,
      statusCode: error.statusCode,
      message: error.message
        .replaceAll(config.key, "[key]")
        .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
        .slice(0, 300),
    });
    throw new Error("Email verification delivery failed.");
  }
}
