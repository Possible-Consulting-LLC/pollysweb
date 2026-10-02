import type { Metadata } from "next";
import { existsSync } from "node:fs";
import path from "node:path";
import { HelpCenter } from "@/components/marketing/help-center";

export const metadata: Metadata = {
  title: "Help Center | Polly's Web",
  description: "Find answers, get support, and keep your spoods happy.",
};

export default function HelpPage() {
  return <HelpCenter heroArt={existsSync(path.join(process.cwd(), "public", "images", "home-hero.png"))} />;
}