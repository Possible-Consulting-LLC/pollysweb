import { HubScene } from "@/components/home/hub-scene";

export default function TodayHubPage() {
  return (
    <main className="relative flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-[var(--cream)]">
      <p className="sr-only">
        Polly&apos;s Web sketch hub. Choose Home, My Spoods, Activities, or Add a
        Spood. Settings is the gear in the Home corner.
      </p>
      <div className="min-h-0 flex-1">
        <HubScene />
      </div>
    </main>
  );
}
