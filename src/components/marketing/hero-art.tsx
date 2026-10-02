import Image from "next/image";

/** The home-style hero art panel: renders the exported home hero asset when
 * present, else the labeled gradient placeholder. Pages pass `artExists`
 * (computed server-side via fs) so this component stays client-safe. */
export function HeroArtPanel({ artExists, label }: { artExists: boolean; label?: string }) {
  if (!artExists) {
    return (
      <div
        role="img"
        aria-label={label ?? "Illustration of the Polly's Web mascot with jumping spiders"}
        className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[2rem] bg-gradient-to-br from-[var(--lavender)]/60 via-[var(--cream)] to-orange-100/70"
      >
        <span aria-hidden className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-[var(--lavender)]/50 blur-2xl" />
        <span aria-hidden className="absolute -bottom-12 -right-8 h-44 w-44 rounded-full bg-orange-200/60 blur-2xl" />
        <span aria-hidden className="text-6xl">🕷️</span>
        {label ? (
          <span aria-hidden className="absolute bottom-3 right-4 text-[10px] font-semibold uppercase tracking-widest text-[var(--midnight)]/40">
            {label}
          </span>
        ) : null}
      </div>
    );
  }
  return (
    <Image
      src="/images/home-hero.png"
      alt="Polly the mascot caring for her jumping spiders"
      width={1200}
      height={900}
      priority
      className="w-full rounded-[2rem]"
    />
  );
}