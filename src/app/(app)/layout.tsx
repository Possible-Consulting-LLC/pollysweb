import { BottomNav } from "@/components/layout/nav";
import { requireUser } from "@/lib/session";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-24 pt-6 sm:max-w-2xl sm:px-6">
      {children}
      <BottomNav />
    </div>
  );
}
