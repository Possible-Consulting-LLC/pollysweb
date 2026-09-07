"use server";

import { Resend } from "resend";
import { z } from "zod";
import { getActionUser } from "@/lib/session";

const feedbackSchema = z.object({
  category: z.enum(["feedback", "bug", "idea", "other"]),
  message: z.string().trim().min(10, "Tell us a little more (at least 10 characters).").max(4000),
});

const CATEGORY_LABELS: Record<z.infer<typeof feedbackSchema>["category"], string> = {
  feedback: "Feedback",
  bug: "Bug report",
  idea: "Idea",
  other: "Other",
};

export async function submitFeedbackAction(
  _prev: { error?: string; success?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string }> {
  const user = await getActionUser();
  if (!user?.id) return { error: "Please sign in again." };

  const parsed = feedbackSchema.safeParse({
    category: formData.get("category"),
    message: formData.get("message"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid feedback." };
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return {
      error:
        "Feedback email isn’t configured yet. Add RESEND_API_KEY on Vercel, then try again.",
    };
  }

  const to = process.env.FEEDBACK_TO_EMAIL || "hello@beccapossible.com";
  const from =
    process.env.RESEND_FROM_EMAIL || "Spoodly Space <onboarding@resend.dev>";
  const category = CATEGORY_LABELS[parsed.data.category];
  const replyTo = user.email || undefined;

  try {
    const resend = new Resend(apiKey);
    const { error } = await resend.emails.send({
      from,
      to: [to],
      replyTo,
      subject: `[Spoodly ${category}] from ${user.name || user.email || "keeper"}`,
      text: [
        `Category: ${category}`,
        `From: ${user.name || "—"} <${user.email || "unknown"}>`,
        `User ID: ${user.id}`,
        `Sent: ${new Date().toISOString()}`,
        "",
        parsed.data.message,
      ].join("\n"),
    });

    if (error) {
      console.error("[feedback] resend error", error);
      return { error: "Couldn’t send that just now. Please try again in a moment." };
    }

    return { success: "Thanks — your note is on its way." };
  } catch (error) {
    console.error("[feedback] failed", error);
    return { error: "Couldn’t send that just now. Please try again in a moment." };
  }
}
