export default function AppLoading() {
  return (
    <div
      className="animate-pulse space-y-4 pt-2"
      aria-busy="true"
      aria-label="Loading"
    >
      <div className="space-y-2">
        <div className="h-3 w-28 rounded-full bg-[var(--plum)]/15" />
        <div className="h-8 w-2/3 max-w-xs rounded-2xl bg-[var(--plum)]/10" />
        <div className="h-4 w-48 rounded-full bg-[var(--plum)]/10" />
      </div>
      <div className="h-28 rounded-3xl bg-[var(--card)] ring-1 ring-[var(--plum)]/10" />
      <div className="h-28 rounded-3xl bg-[var(--card)] ring-1 ring-[var(--plum)]/10" />
      <div className="h-20 rounded-3xl bg-[var(--card)] ring-1 ring-[var(--plum)]/10" />
    </div>
  );
}
