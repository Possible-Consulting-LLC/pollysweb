import Image from "next/image";
import {
  Award,
  History,
  Home,
  Icon,
  Settings,
  Sparkles,
} from "lucide-react";
import { spider } from "@lucide/lab";
import { BRAND_LOGO_SRC } from "@/lib/brand";

const actions = ["Fed", "Hydration", "Molt", "Observation", "Play"];
const navigation = [
  { label: "Home", icon: Home, active: true },
  { label: "My Spoods", icon: null, active: false },
  { label: "Journey", icon: Award, active: false },
  { label: "Activity", icon: History, active: false },
  { label: "Settings", icon: Settings, active: false },
];

/** Static, clearly labeled product illustration; it never reads a keeper's data. */
export function LandingAppPreview() {
  return (
    <div
      data-theme="midnight"
      role="img"
      aria-label="Illustrative Midnight theme preview of the Home page, showing a shared care streak, a spood needing misting while molting, quick log actions, and the Journey tab."
      className="overflow-hidden rounded-[2rem] border border-[var(--lavender)]/30 bg-[var(--cream)] text-[var(--midnight)] shadow-[0_24px_70px_rgba(30,36,66,0.24)]"
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <Image sizes="64px" src={BRAND_LOGO_SRC} alt="" width={80} height={80} className="h-16 w-16 object-contain" />
          <span className="rounded-full border border-[var(--plum)]/25 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-[var(--midnight)]/75">
            Illustrative preview
          </span>
        </div>

        <p className="mt-3 font-[family-name:var(--font-display)] text-[1.65rem] leading-tight text-[var(--midnight)]">
          Good morning, keeper.
        </p>
        <p className="mt-1 text-xs text-[var(--midnight)]/70">Here’s what your little corner needs today.</p>

        <div className="mt-5 flex items-center gap-3 rounded-2xl bg-[var(--panel)] p-3.5 text-[var(--on-panel)]">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--gold)]/20 text-[var(--gold)]">
            <Sparkles className="h-6 w-6" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold">Care Constellation</p>
            <p className="font-[family-name:var(--font-display)] text-lg leading-tight">3 days together</p>
            <p className="text-[11px] text-[var(--on-panel)]/75">Today is still open for your care review.</p>
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-2">
          <div>
            <p className="font-[family-name:var(--font-display)] text-xl leading-none">Needs attention</p>
            <p className="mt-1 text-xs text-[var(--midnight)]/70">1 spood could use a moment</p>
          </div>
          <span className="shrink-0 rounded-xl bg-[var(--plum)] px-3 py-2 text-xs font-bold text-[var(--on-accent)]">
            Add a Spood
          </span>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--plum)]/20 bg-[var(--card)] p-3.5">
          <div className="flex gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/spoods/defaults/star.svg" alt="" width={56} height={56} className="h-14 w-14 shrink-0 rounded-xl bg-[var(--lavender)] object-cover" />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <p className="font-[family-name:var(--font-display)] text-lg leading-none">Nova</p>
                <div className="flex gap-1">
                  <span className="rounded-full bg-[var(--lavender)] px-2 py-0.5 text-[10px] font-bold">Molting</span>
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold text-amber-950">Mist today</span>
                </div>
              </div>
              <p className="mt-1 text-[11px] text-[var(--midnight)]/70">Female · Regal Jumping Spider · i7</p>
              <p className="mt-2 text-xs text-[var(--midnight)]">Nova could use a little mist today.</p>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5 text-[10px]">
            {[
              ["Last fed", "4 days ago"],
              ["Last hydrated", "yesterday"],
              ["Last molt", "18 days ago"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-[var(--cream-deep)]/60 px-2 py-1.5">
                <p className="text-[var(--midnight)]/65">{label}</p>
                <p className="font-semibold text-[var(--midnight)]">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-5 gap-1">
            {actions.map((action) => (
              <span key={action} className="rounded-lg bg-[var(--lavender)] px-0.5 py-2 text-center text-[9px] font-semibold leading-tight text-[var(--midnight)]">
                {action}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 border-t border-[var(--plum)]/20 bg-[var(--cream)] px-1.5 py-2">
        {navigation.map(({ label, icon: NavIcon, active }) => (
          <div key={label} className="flex min-w-0 flex-col items-center gap-1 text-center text-[9px] text-[var(--midnight)]/75">
            <span className={`flex h-7 w-7 items-center justify-center rounded-xl ${active ? "bg-[var(--lavender)] text-[var(--plum)]" : ""}`}>
              {NavIcon ? <NavIcon className="h-4 w-4" aria-hidden /> : <Icon iconNode={spider} className="h-4 w-4" aria-hidden />}
            </span>
            <span>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
