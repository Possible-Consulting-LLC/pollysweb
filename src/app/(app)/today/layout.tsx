import type { ReactNode } from "react";

export default function HomeHubLayout({ children }: { children: ReactNode }) {
  // Immersive hub — escape the padded app shell + bottom nav.
  return (
    <div className="fixed inset-0 z-[100] flex isolate flex-col bg-[var(--cream)] text-[var(--midnight)]">
      {children}
    </div>
  );
}
