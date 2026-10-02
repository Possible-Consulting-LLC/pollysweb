import type { ReactNode } from "react";
import Link from "next/link";
import { FeatureGate } from "@/components/features/feature-gate";
import { resolveUserFeatureGate, type FeatureGateState } from "@/lib/features/gate";
import { getSessionUser } from "@/lib/session";

/** Dense quarter-web from the top-left corner — pencil-sketch style. */
function CornerWeb({ className }: { className?: string }) {
  const rays = [8, 22, 36, 50, 64, 78, 92, 106, 120, 134, 148, 162, 176];
  const rings = [28, 48, 72, 98, 128, 160];
  return (
    <svg
      viewBox="0 0 220 220"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {rays.map((deg, i) => {
        const rad = (deg * Math.PI) / 180;
        const len = 205;
        return (
          <line
            key={`r-${deg}`}
            x1="0"
            y1="0"
            x2={Math.cos(rad) * len}
            y2={Math.sin(rad) * len}
            strokeWidth={i % 3 === 0 ? 1.55 : 1.15}
            opacity={0.42 + (i % 4) * 0.04}
          />
        );
      })}
      {rings.map((r, i) => {
        // Slightly wobbly arcs (hand-drawn feel) instead of perfect circles.
        const wobble = 3 + (i % 3);
        const d = [
          `M ${r} 0`,
          `Q ${r + wobble} ${r * 0.35} ${r * 0.92} ${r * 0.55}`,
          `Q ${r * 0.7} ${r * 0.85} ${r * 0.5} ${r}`,
          `Q ${r * 0.28} ${r + wobble * 0.4} 0 ${r}`,
        ].join(" ");
        return (
          <path
            key={`ring-${r}`}
            d={d}
            strokeWidth={1.2}
            opacity={0.38 + i * 0.04}
          />
        );
      })}
    </svg>
  );
}

/** Full circular web with imperfect rings like the sketch. */
function RoundWeb({ className }: { className?: string }) {
  const rays = 16;
  const rings = [22, 38, 54, 70, 86];
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      aria-hidden
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
    >
      {Array.from({ length: rays }, (_, i) => {
        const deg = (i * 360) / rays;
        const rad = (deg * Math.PI) / 180;
        return (
          <line
            key={deg}
            x1="100"
            y1="100"
            x2={100 + Math.cos(rad) * 92}
            y2={100 + Math.sin(rad) * 92}
            strokeWidth={1.2}
            opacity={0.4}
          />
        );
      })}
      {rings.map((r, i) => {
        const pts: string[] = [];
        const steps = 24;
        for (let s = 0; s <= steps; s++) {
          const t = (s / steps) * Math.PI * 2;
          const jitter = 1.2 * Math.sin(s * 1.7 + i);
          const x = 100 + Math.cos(t) * (r + jitter);
          const y = 100 + Math.sin(t) * (r + jitter * 0.8);
          pts.push(`${s === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`);
        }
        pts.push("Z");
        return (
          <path
            key={r}
            d={pts.join(" ")}
            strokeWidth={1.25}
            opacity={0.42}
          />
        );
      })}
    </svg>
  );
}

/** Plus woven from irregular silk strands. */
function SilkPlus({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden fill="none">
      <g stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        {/* Vertical silk bundle */}
        <path d="M48 12 C46 28 47 40 50 50 C53 40 54 28 52 12" strokeWidth="3.2" />
        <path d="M50 12 C52 30 51 42 50 50 C49 42 48 30 50 12" strokeWidth="2.2" opacity="0.7" />
        <path d="M48 88 C46 72 47 60 50 50 C53 60 54 72 52 88" strokeWidth="3.2" />
        <path d="M50 88 C52 70 51 58 50 50 C49 58 48 70 50 88" strokeWidth="2.2" opacity="0.7" />
        {/* Horizontal silk bundle */}
        <path d="M12 48 C28 46 40 47 50 50 C40 53 28 54 12 52" strokeWidth="3.2" />
        <path d="M12 50 C30 52 42 51 50 50 C42 49 30 48 12 50" strokeWidth="2.2" opacity="0.7" />
        <path d="M88 48 C72 46 60 47 50 50 C60 53 72 54 88 52" strokeWidth="3.2" />
        <path d="M88 50 C70 52 58 51 50 50 C58 49 70 48 88 50" strokeWidth="2.2" opacity="0.7" />
        {/* Fuzzy knot at center */}
        <circle cx="50" cy="50" r="5" strokeWidth="2" />
        <path d="M44 46 Q50 42 56 46" strokeWidth="1.4" opacity="0.55" />
        <path d="M44 54 Q50 58 56 54" strokeWidth="1.4" opacity="0.55" />
      </g>
    </svg>
  );
}

/**
 * Sketch doodle spider: round body, two big eyes, stick legs —
 * matches the pencil drawing more than a polished mascot.
 */
function SketchSpood({
  className,
  facing = "front",
}: {
  className?: string;
  facing?: "front" | "side";
}) {
  if (facing === "side") {
    return (
      <svg viewBox="0 0 72 44" className={className} aria-hidden>
        <g
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinecap="round"
        >
          <path d="M28 18 C18 10 12 6 7 2" />
          <path d="M28 22 C16 14 10 10 5 7" />
          <path d="M30 26 C16 24 8 22 2 24" />
          <path d="M32 30 C18 34 10 38 4 42" />
          <path d="M48 16 C56 8 62 5 67 3" />
          <path d="M48 20 C58 12 64 10 69 8" />
          <path d="M50 26 C60 24 66 26 71 28" />
          <path d="M48 32 C58 36 64 40 69 43" />
        </g>
        <circle cx="40" cy="24" r="13" fill="currentColor" />
        <circle cx="48" cy="18" r="7.5" fill="currentColor" />
        <circle cx="50" cy="17" r="3" fill="var(--cream)" />
        <circle cx="51" cy="16.2" r="1.1" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 70 52" className={className} aria-hidden>
      <g
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      >
        <path d="M22 24 C12 14 8 8 4 3" />
        <path d="M20 28 C10 20 6 14 2 10" />
        <path d="M20 32 C9 30 4 28 0 29" />
        <path d="M24 38 C12 42 6 46 2 50" />
        <path d="M48 24 C58 14 62 8 66 3" />
        <path d="M50 28 C60 20 64 14 68 10" />
        <path d="M50 32 C61 30 66 28 70 29" />
        <path d="M46 38 C58 42 64 46 68 50" />
      </g>
      {/* One round body (sketch style) */}
      <circle cx="35" cy="30" r="14" fill="currentColor" />
      {/* Two big eyes sitting on top of the body */}
      <circle cx="27" cy="22" r="8" fill="currentColor" />
      <circle cx="43" cy="22" r="8" fill="currentColor" />
      <circle cx="27" cy="22" r="3.6" fill="var(--cream)" />
      <circle cx="43" cy="22" r="3.6" fill="var(--cream)" />
      <circle cx="28.2" cy="21" r="1.3" fill="currentColor" />
      <circle cx="44.2" cy="21" r="1.3" fill="currentColor" />
    </svg>
  );
}

function BubbleLabel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`hub-bubble ${className ?? ""}`}>
      {children}
    </span>
  );
}

function CornerGear({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden>
      {/* Rays like the sketch */}
      <g stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.55">
        <line x1="24" y1="2" x2="24" y2="8" />
        <line x1="24" y1="40" x2="24" y2="46" />
        <line x1="2" y1="24" x2="8" y2="24" />
        <line x1="40" y1="24" x2="46" y2="24" />
        <line x1="7" y1="7" x2="11" y2="11" />
        <line x1="37" y1="37" x2="41" y2="41" />
        <line x1="37" y1="7" x2="41" y2="3" />
        <line x1="7" y1="41" x2="11" y2="37" />
      </g>
      <circle
        cx="24"
        cy="24"
        r="9"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      />
      <circle cx="24" cy="24" r="3.2" fill="currentColor" />
      <path
        d="M24 11 L26.2 15.8 L31.5 14.2 L29.8 19.5 L34.5 22 L29.8 24.5 L31.5 29.8 L26.2 28.2 L24 33 L21.8 28.2 L16.5 29.8 L18.2 24.5 L13.5 22 L18.2 19.5 L16.5 14.2 L21.8 15.8 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export async function HubScene({ addSpoodState }: { addSpoodState?: FeatureGateState } = {}) {
  let state = addSpoodState;
  if (!state) {
    const user = await getSessionUser();
    state = user?.id ? await resolveUserFeatureGate(user.id, "spood.create") : "upsell";
  }
  return <HubSceneView addSpoodState={state} />;
}

export function HubSceneView({ addSpoodState }: { addSpoodState: FeatureGateState }) {
  return (
    <div className="hub-scene relative grid h-full min-h-0 grid-cols-2 grid-rows-2 bg-[var(--cream)]">
      {/* Home — corner web + bubble word + crawler (sketch quadrant) */}
      <div className="hub-tile relative overflow-hidden border-b border-r border-[var(--midnight)]/12">
        <CornerWeb className="pointer-events-none absolute -left-1 -top-1 h-[135%] w-[135%] text-[var(--midnight)]/55" />
        <Link
          href="/settings"
          className="absolute left-2 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full text-[var(--midnight)]/70 transition hover:text-[var(--plum)]"
          aria-label="Settings"
        >
          <CornerGear className="h-9 w-9" />
        </Link>
        <Link
          href="/home"
          className="absolute inset-0 z-10 flex items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--plum)]"
        >
          <BubbleLabel className="hub-bubble-diagonal -rotate-[18deg] text-[clamp(2.6rem,9vw,4.75rem)]">
            Home
          </BubbleLabel>
        </Link>
        <div
          className="hub-crawl pointer-events-none absolute left-[40%] top-[18%] z-[5] h-[68%] w-14 origin-top rotate-[32deg] sm:left-[42%] sm:top-[14%]"
          aria-hidden
        >
          <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-[var(--midnight)]/35" />
          <div className="hub-crawl-spood absolute left-1/2 top-0 -translate-x-1/2">
            <SketchSpood className="h-9 w-12 -rotate-[32deg] text-[var(--midnight)] sm:h-11 sm:w-14" />
          </div>
        </div>
      </div>

      {/* My Spoods — title + three hangers on silk */}
      <Link
        href="/spoods"
        className="hub-tile group relative overflow-hidden border-b border-[var(--midnight)]/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--plum)]"
      >
        <div className="relative z-10 px-4 pt-8 sm:px-7 sm:pt-10">
          <BubbleLabel className="block text-[clamp(1.9rem,6.8vw,3.5rem)] leading-[0.92]">
            My
          </BubbleLabel>
          <BubbleLabel className="block text-[clamp(1.9rem,6.8vw,3.5rem)] leading-[0.92]">
            Spoods
          </BubbleLabel>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-3 top-[42%] sm:inset-x-6 sm:bottom-5">
          {[
            { left: "18%", silk: "3.75rem" },
            { left: "50%", silk: "5.75rem" },
            { left: "82%", silk: "3.1rem" },
          ].map((pos, i) => (
            <div
              key={i}
              className="absolute top-0 -translate-x-1/2"
              style={{ left: pos.left }}
            >
              <div className={`hub-bop hub-bop-${i} flex flex-col items-center`}>
                <div
                  className="w-px bg-[var(--midnight)]/40"
                  style={{ height: pos.silk }}
                />
                <SketchSpood className="h-8 w-11 shrink-0 text-[var(--midnight)] sm:h-10 sm:w-14" />
              </div>
            </div>
          ))}
        </div>
      </Link>

      {/* Activities — circular web with silk + (clickable graphic) */}
      <Link
        href="/activity"
        className="hub-tile group relative overflow-hidden border-r border-[var(--midnight)]/12 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--plum)]"
        aria-label="Activities"
      >
        <RoundWeb className="pointer-events-none absolute left-1/2 top-1/2 h-[92%] w-[92%] -translate-x-1/2 -translate-y-1/2 text-[var(--midnight)]/50 transition duration-500 group-hover:text-[var(--midnight)]/70" />
        <div className="relative z-10 flex h-full flex-col items-center justify-center gap-1">
          <SilkPlus className="hub-silk-plus h-16 w-16 text-[var(--midnight)] sm:h-24 sm:w-24" />
          <span className="sr-only">Activities</span>
        </div>
      </Link>

      {/* Add a Spood — bubble title + walking doodle */}
      <div className={addSpoodState === "entitled" ? "contents" : "hub-tile flex items-center justify-center p-4 text-center text-[var(--midnight)]"}>
        <FeatureGate state={addSpoodState} featureKey="spood.create" name="Adding a Spood">
          <Link
            href="/spoods/new"
            className="hub-tile group relative overflow-hidden focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-[var(--plum)]"
          >
            <div className="relative z-10 flex h-full flex-col items-start justify-center px-4 sm:px-7">
              <BubbleLabel className="block text-[clamp(1.75rem,6.2vw,3.25rem)] leading-[0.92]">
                Add a
              </BubbleLabel>
              <BubbleLabel className="block text-[clamp(1.75rem,6.2vw,3.25rem)] leading-[0.92]">
                Spood
              </BubbleLabel>
            </div>
            <div className="hub-walk-track pointer-events-none absolute bottom-5 left-0 right-0 h-11 sm:bottom-7 sm:h-12">
              <div className="absolute inset-x-5 top-1/2 -translate-y-1/2 border-t border-dashed border-[var(--midnight)]/35 sm:inset-x-8" />
              <div className="hub-walk-spood absolute bottom-0">
                <SketchSpood
                  facing="side"
                  className="h-8 w-12 text-[var(--midnight)] sm:h-10 sm:w-14"
                />
              </div>
            </div>
          </Link>
        </FeatureGate>
      </div>
    </div>
  );
}
