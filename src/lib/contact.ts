import { z } from "zod";
import { BRAND } from "@/lib/brand";

export const CONTACT_TOPICS = ["support", "bugs", "ideas", "partnerships"] as const;

export type ContactTopic = (typeof CONTACT_TOPICS)[number];

/** Public contact topics route to the brand inboxes from the brand constants. */
export function contactTargetFor(topic: ContactTopic): string {
  return BRAND.emails[topic];
}

export const TOPIC_LABELS: Record<ContactTopic, string> = {
  support: "General support",
  bugs: "Report a bug",
  ideas: "Feature request",
  partnerships: "Partnerships & media",
};

const contactSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  topic: z.enum(CONTACT_TOPICS),
  message: z
    .string()
    .trim()
    .min(10, "Tell us a little more (at least 10 characters).")
    .max(2000),
});

export type ContactInput = z.infer<typeof contactSchema>;

/** Pure input validation shared by tests and the contact action. */
export function validateContactInput(raw: unknown): ContactInput | { error: string } {
  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Please check the form and try again." };
  return {
    name: parsed.data.name,
    email: parsed.data.email.toLowerCase(),
    topic: parsed.data.topic,
    message: parsed.data.message,
  };
}