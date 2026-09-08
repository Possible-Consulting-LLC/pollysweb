import { BottomNav } from "@/components/layout/nav";
import { BrandLogo } from "@/components/brand/logo";
import { FeedbackButton } from "@/components/feedback/feedback-button";
import { TimezoneSync } from "@/components/layout/timezone-sync";
import { requireUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-24 pt-4 sm:max-w-2xl sm:px-6">
      <TimezoneSync />
      <div className="mb-3 flex items-center justify-start">
        <BrandLogo href="/home" size="header" priority />
      </div>
      {children}
      <FeedbackButton />
      <BottomNav />
    </div>
  );
}
