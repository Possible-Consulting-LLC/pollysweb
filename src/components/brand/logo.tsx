import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

const MARK = {
  src: "/brand/spoodly-logo-mark.png",
  width: 240,
  height: 240,
} as const;

const HERO = {
  src: "/brand/spoodly-logo.png",
  width: 720,
  height: 720,
} as const;

export function BrandLogo({
  href = "/home",
  size = "header",
  className,
  priority = false,
}: {
  href?: string | null;
  size?: "header" | "hero";
  className?: string;
  priority?: boolean;
}) {
  const asset = size === "hero" ? HERO : MARK;
  const image = (
    <Image
      src={asset.src}
      alt="Spoodly Space"
      width={asset.width}
      height={asset.height}
      priority={priority}
      className={cn(
        "h-auto w-full select-none",
        size === "hero" ? "max-w-[16rem] sm:max-w-[18rem]" : "max-w-[7.5rem]",
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
