import Link from "next/link";
import { cn } from "@/lib/utils";
import { LOGO_HERO, LOGO_MARK } from "@/components/brand/logo-data";

export function BrandLogo({
  href = "/home",
  size = "header",
  className,
  priority = false,
  src,
}: {
  href?: string | null;
  size?: "header" | "hero";
  className?: string;
  priority?: boolean;
  /** Optional image URL override (e.g. `/brand/spoodly-logo-mark.png`). */
  src?: string;
}) {
  const asset = size === "hero" ? LOGO_HERO : LOGO_MARK;
  const image = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src ?? asset.src}
      alt="Spoodly Space"
      width={asset.width}
      height={asset.height}
      decoding="async"
      // eslint-disable-next-line react/no-unknown-property
      fetchPriority={priority ? "high" : "auto"}
      className={cn(
        "h-auto w-full select-none",
        size === "hero" ? "max-w-[48rem] sm:max-w-[54rem]" : "max-w-[7.5rem]",
        className,
      )}
    />
  );

  if (!href) {
    return (
      <div className={cn(size === "hero" && "mx-auto flex justify-center")}>
        {image}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--cream)]",
        size === "hero" && "mx-auto",
      )}
      aria-label="Spoodly Space home"
    >
      {image}
    </Link>
  );
}
