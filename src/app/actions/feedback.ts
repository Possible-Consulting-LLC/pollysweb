"use server";

import { MaintenanceError } from '@/lib/admin/maintenance-policy';
import { guardMaintenance } from '@/lib/admin/maintenance-access';
import { withMutation } from '@/lib/mutation-boundary';

import { allowAction, RATE_LIMIT_MESSAGE } from "@/lib/rate-limit";
import { headers } from "next/headers";
import { Resend } from "resend";
import { z } from "zod";
import { getActionUser } from "@/lib/session";
import { isStaging } from "@/lib/staging-guard";
import { feedbackMailConfig } from "@/lib/feedback-delivery";

const feedbackSchema = z.object({
  category: z.enum(["feedback", "bug", "idea", "other"]),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters).")
    .max(4000),
});

const CATEGORY_LABELS: Record<
  z.infer<typeof feedbackSchema>["category"],
  string
> = {
  feedback: "Feedback",
  bug: "Bug report",
  idea: "Idea",
  other: "Other",
};

function asTrimmed(value: FormDataEntryValue | null, max = 500) {
  return String(value ?? "")
    .trim()
    .slice(0, max);
}

function firstHeaderValue(value: string | null): string {
  if (!value) return "";
  return value.split(",")[0]?.trim() || "";
}

async function collectRequestDiagnostics(formData: FormData) {
  const headerStore = await headers();
  const forwardedFor = firstHeaderValue(headerStore.get("x-forwarded-for"));
  const realIp = firstHeaderValue(headerStore.get("x-real-ip"));
  const vercelIp = firstHeaderValue(headerStore.get("x-vercel-forwarded-for"));
  const ip = forwardedFor || realIp || vercelIp || "";

  return {
    ip: ip || "unknown",
    userAgentHeader: headerStore.get("user-agent") || "",
    acceptLanguage: headerStore.get("accept-language") || "",
    secChUa: headerStore.get("sec-ch-ua") || "",
    secChUaMobile: headerStore.get("sec-ch-ua-mobile") || "",
    secChUaPlatform: headerStore.get("sec-ch-ua-platform") || "",
    vercelCountry: headerStore.get("x-vercel-ip-country") || "",
    vercelRegion: headerStore.get("x-vercel-ip-country-region") || "",
    vercelCity: headerStore.get("x-vercel-ip-city") || "",
    clientUserAgent: asTrimmed(formData.get("userAgent"), 800),
    platform: asTrimmed(formData.get("platform")),
    language: asTrimmed(formData.get("language")),
    languages: asTrimmed(formData.get("languages"), 300),
    timezone: asTrimmed(formData.get("timezone")),
    screen: asTrimmed(formData.get("screen")),
    viewport: asTrimmed(formData.get("viewport")),
    devicePixelRatio: asTrimmed(formData.get("devicePixelRatio"), 20),
    touchPoints: asTrimmed(formData.get("touchPoints"), 20),
    online: asTrimmed(formData.get("online"), 20),
    pageUrl: asTrimmed(formData.get("pageUrl"), 1000),
    pathname: asTrimmed(formData.get("pathname"), 300),
    referrer: asTrimmed(formData.get("referrer"), 1000),
  };
}

function formatDiagnostics(
  diagnostics: Awaited<ReturnType<typeof collectRequestDiagnostics>>,
) {
  const lines = [
    "— Environment (for debugging; not shown to the keeper) —",
    `IP: ${diagnostics.ip || "—"}`,
    `Location: ${[diagnostics.vercelCity, diagnostics.vercelRegion, diagnostics.vercelCountry]
      .filter(Boolean)
      .join(", ") || "—"
    }`,
    `User-Agent (client): ${diagnostics.clientUserAgent || "—"}`,
    `User-Agent (request): ${diagnostics.userAgentHeader || "—"}`,
    `Platform: ${diagnostics.platform || "—"}`,
    `Client Hints: ${[
      diagnostics.secChUa,
      diagnostics.secChUaMobile && `mobile=${diagnostics.secChUaMobile}`,
      diagnostics.secChUaPlatform && `platform=${diagnostics.secChUaPlatform}`,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
    }`,
    `Language: ${diagnostics.language || "—"}`,
    `Languages: ${diagnostics.languages || "—"}`,
    `Accept-Language: ${diagnostics.acceptLanguage || "—"}`,
    `Timezone: ${diagnostics.timezone || "—"}`,
    `Screen: ${diagnostics.screen || "—"}`,
    `Viewport: ${diagnostics.viewport || "—"}`,
    `Device pixel ratio: ${diagnostics.devicePixelRatio || "—"}`,
    `Touch points: ${diagnostics.touchPoints || "—"}`,
    `Online: ${diagnostics.online || "—"}`,
    `Page URL: ${diagnostics.pageUrl || "—"}`,
    `Pathname: ${diagnostics.pathname || "—"}`,
    `Referrer: ${diagnostics.referrer || "—"}`,
  ];
  return lines.join("\n");
}

export async function submitFeedbackAction(
  _prev: { error?: string; success?: string; } | undefined,
  formData: FormData,
): Promise<{ error?: string; success?: string; }> {
  return withMutation(formData, 'data', 'submitfeedbackaction', async () => {
    const mail = feedbackMailConfig(process.env);
    if (isStaging() && !mail) return { error: "Feedback email isn’t configured for staging." };
    const user = await getActionUser();
    if (!user?.id) return { error: "Please sign in again." };

    const parsed = feedbackSchema.safeParse({
      category: formData.get("category"),
      message: formData.get("message"),
    });
    if (!parsed.success) {
      return { error: parsed.error.issues[0]?.message ?? "Invalid feedback." };
    }

    if (!await allowAction("feedback", user.id)) return { error: RATE_LIMIT_MESSAGE };

    if (!mail) {
      return {
        error:
          "Feedback email isn’t configured yet. Add RESEND_API_KEY on Vercel, then try again.",
      };
    }

    const { key, to, from } = mail;
    const category = CATEGORY_LABELS[parsed.data.category];
    const replyTo = user.email || undefined;
    const diagnostics = await collectRequestDiagnostics(formData);

    try {
      const resend = new Resend(key);
      await guardMaintenance('write');
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
          "",
          formatDiagnostics(diagnostics),
        ].join("\n"),
      });

      if (error) {
        console.error("[feedback] resend error", error);
        return { error: "Couldn’t send that just now. Please try again in a moment." };
      }

      return { success: "Thanks — your note is on its way." };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      console.error("[feedback] failed", error);
      return { error: "Couldn’t send that just now. Please try again in a moment." };
    }

  });
}
