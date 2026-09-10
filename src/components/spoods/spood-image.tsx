import { cn } from "@/lib/utils";

/** Profile / gallery image that works with SVGs, /uploads, and data URLs on Vercel. */
export function SpoodImage({
  src,
  alt,
  className,
  priority = false,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  priority?: boolean;
  sizes?: string;
}) {
  const url = src?.trim() || "/spoods/defaults/star.svg";

  return (
    // eslint-disable-next-line @next/next/no-img-element -- mixed SVG / data URL / upload sources
    <img
      src={url}
      alt={alt}
      className={cn("object-cover", className)}
      draggable={false}
      {...(priority ? { fetchPriority: "high" as const } : {})}
    />
  );
}
