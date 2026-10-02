"use server";

import { Resend } from "resend";
import { withMutation } from "@/lib/mutation-boundary";
import { guardMaintenance } from "@/lib/admin/maintenance-access";
import { allowAction, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { feedbackMailConfig } from "@/lib/feedback-delivery";
import { contactTargetFor, validateContactInput, TOPIC_LABELS, type ContactTopic } from "@/lib/contact";
import type { MutationFailure } from "@/lib/mutation-failure";

export type ContactResult = { ok: boolean; message: string };

export async function sendContactMessage(
  _prev: ContactResult | MutationFailure | undefined,
  formData: FormData,
): Promise<ContactResult | MutationFailure> {
  return withMutation(formData, "public-identity", "contact-message", async () => {
    const validated = validateContactInput({
      name: formData.get("name"),
      email: formData.get("email"),
      topic: formData.get("topic"),
      message: formData.get("message"),
    });
    if ("error" in validated) return { ok: false, message: validated.error };

    const { name, email, topic, message } = validated;
    if (!await allowAction("contact", email)) return { ok: false, message: RATE_LIMIT_MESSAGE };

    const mail = feedbackMailConfig(process.env);
    if (!mail) {
      return { ok: false, message: "Email isn't configured on this deploy yet. Please email us directly and we'll sort it out." };
    }

    try {
      await guardMaintenance("write");
      const replyTo = email;
      const subject = `[Contact · ${TOPIC_LABELS[topic]}] ${name}`;
      const text = [
        `Topic: ${TOPIC_LABELS[topic]} (→ ${contactTargetFor(topic as ContactTopic)})`,
        `From: ${name} <${email}>`,
        `Sent: ${new Date().toISOString()}`,
        "",
        message,
      ].join("\n");

      const resend = new Resend(mail.key);
      const { error } = await resend.emails.send({
        from: mail.from,
        to: [contactTargetFor(topic as ContactTopic)],
        replyTo,
        subject,
        text,
      });
      if (error) throw new Error(error.message);
      return { ok: true, message: "Message sent! We typically respond within 1–2 business days." };
    } catch (error) {
      console.error("[contact] send failed", error);
      return { ok: false, message: "We couldn't send your message just now. Please try again, or email us directly." };
    }
  });
}