export const INTERACTION_METHODS = [
  "Watched in enclosure",
  "Followed an object",
  "Explored outside enclosure",
  "Voluntary handling",
  "Other",
] as const;

export function interactionNotes(method: string, other: string, notes: string): string {
  if (!(INTERACTION_METHODS as readonly string[]).includes(method)) {
    throw new Error("Choose a way you interacted.");
  }
  const how = method === "Other" ? other.trim() : method;
  if (!how) throw new Error("Describe how you interacted.");
  if (how.length > 120 || notes.trim().length > 1000) {
    throw new Error("Keep the interaction description concise.");
  }
  return `How: ${how}${notes.trim() ? `\n${notes.trim()}` : ""}`;
}
