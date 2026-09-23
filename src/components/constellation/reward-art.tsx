import {
  Camera, Eye, Heart, House, MoonStar, MoveRight, Orbit,
  Route, Sparkles, Star, Telescope,
} from "lucide-react";
const symbols = {
  camera: Camera, eye: Eye, heart: Heart, house: House,
  "move-right": MoveRight, orbit: Orbit, route: Route,
  sparkle: Sparkles, sparkles: Sparkles, stars: Star,
  "moon-star": MoonStar, telescope: Telescope,
};

export function Art({ symbol, earned }: { symbol: keyof typeof symbols; earned: boolean }) {
  const Icon = symbols[symbol];
  return (
    <span aria-hidden className={`relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full ${earned
      ? "bg-[radial-gradient(circle_at_30%_25%,var(--gold),var(--plum)_75%)] text-[var(--on-accent)] shadow-lg shadow-[var(--plum)]/20"
      : "bg-[var(--lavender)]/50 text-[var(--midnight)]/45"}`}>
      <span className="absolute left-3 top-3 text-xs">✦</span>
      <span className="absolute bottom-3 right-3 text-sm">✧</span>
      <Icon className="relative h-10 w-10" strokeWidth={1.5} />
    </span>
  );
}
