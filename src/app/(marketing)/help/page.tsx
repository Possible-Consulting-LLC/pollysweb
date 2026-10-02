import type { Metadata } from "next";
import { HelpCenter } from "@/components/marketing/help-center";

export const metadata: Metadata = {
  title: "Help Center | Polly's Web",
  description: "Find answers, get support, and keep your spoods happy.",
};

export default function HelpPage() {
  return <HelpCenter />;
}