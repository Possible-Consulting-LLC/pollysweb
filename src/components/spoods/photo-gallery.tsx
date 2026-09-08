"use client";

import {
  useCallback,
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Trash2, UserRound, X } from "lucide-react";
import { format } from "date-fns";
import { deleteSpiderPhoto, setSpiderProfilePhoto } from "@/app/actions/care";
import { Button } from "@/components/ui/button";
import { SpoodImage } from "@/components/spoods/spood-image";
import { cn } from "@/lib/utils";

export type GalleryPhoto = {
  id: string;
  url: string;
  caption?: string | null;
  takenAt?: string | Date | null;
};

function formatTakenAt(value: GalleryPhoto["takenAt"]) {
  if (!value) return null;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;
  return format(date, "MMM d, yyyy");
}

export function PhotoLightbox({
  photos,
  index,
  onClose,
  onChangeIndex,
  onDelete,
  onSetProfile,
  profilePhotoUrl,
  busy = false,
  actionError = null,
}: {
  photos: GalleryPhoto[];
  index: number;
  onClose: () => void;
  onChangeIndex: (next: number) => void;
  onDelete?: (photo: GalleryPhoto) => void;
  onSetProfile?: (photo: GalleryPhoto) => void;
  profilePhotoUrl?: string | null;
  busy?: boolean;
  actionError?: string | null;
}) {
  const titleId = useId();
  const photo = photos[index];
  const hasMany = photos.length > 1;
  const taken = formatTakenAt(photo?.takenAt);
  const isProfile = Boolean(photo && profilePhotoUrl && photo.url === profilePhotoUrl);

  const goPrev = useCallback(() => {
    if (!hasMany) return;
    onChangeIndex((index - 1 + photos.length) % photos.length);
  }, [hasMany, index, onChangeIndex, photos.length]);

  const goNext = useCallback(() => {
    if (!hasMany) return;
    onChangeIndex((index + 1) % photos.length);
  }, [hasMany, index, onChangeIndex, photos.length]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") goPrev();
      if (event.key === "ArrowRight") goNext();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [goNext, goPrev, onClose]);

  if (!photo) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--panel)]/88 p-3 backdrop-blur-sm sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className="relative flex max-h-[min(92dvh,900px)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] bg-[var(--panel)] shadow-2xl ring-1 ring-white/10"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-4 py-3 text-[var(--on-panel)]">
          <div className="min-w-0">
            <p id={titleId} className="truncate text-sm font-semibold">
              {photo.caption || "Photo"}
            </p>
            <p className="text-xs text-[var(--on-panel)]/55">
              {hasMany ? `${index + 1} of ${photos.length}` : null}
              {hasMany && taken ? " · " : null}
              {taken}
              {isProfile ? `${hasMany || taken ? " · " : ""}Profile photo` : null}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {onSetProfile ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy || isProfile}
                className="text-[var(--on-panel)] hover:bg-white/10 disabled:opacity-60"
                aria-label={isProfile ? "Current profile photo" : "Set as profile photo"}
                onClick={() => onSetProfile(photo)}
              >
                <UserRound className="h-4 w-4" />
                {isProfile ? "Profile" : "Set as profile"}
              </Button>
            ) : null}
            {onDelete ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                className="text-rose-200 hover:bg-rose-500/20 hover:text-rose-100"
                aria-label="Delete photo"
                onClick={() => onDelete(photo)}
              >
                <Trash2 className="h-4 w-4" />
                {busy ? "Working…" : "Delete"}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-[var(--on-panel)] hover:bg-white/10"
              aria-label="Close gallery"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        {actionError ? (
          <p className="px-4 pb-2 text-sm text-rose-200" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black/35 px-2 pb-4 sm:px-4">
          {hasMany ? (
            <button
              type="button"
              aria-label="Previous photo"
              className="absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-[var(--on-panel)] transition hover:bg-black/65 sm:left-3"
              onClick={goPrev}
            >
              <ChevronLeft className="h-6 w-6" />
            </button>
          ) : null}

          <div className="relative h-[min(70dvh,720px)] w-full">
            <SpoodImage
              src={photo.url}
              alt={photo.caption || "Spider photo"}
              className="h-full w-full object-contain"
              priority
            />
          </div>

          {hasMany ? (
            <button
              type="button"
              aria-label="Next photo"
              className="absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-black/45 text-[var(--on-panel)] transition hover:bg-black/65 sm:right-3"
              onClick={goNext}
            >
              <ChevronRight className="h-6 w-6" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function PhotoGallery({
  photos,
  profilePhotoUrl,
  emptyLabel = "No photos yet — add one above.",
  className,
  allowManage = true,
}: {
  photos: GalleryPhoto[];
  profilePhotoUrl?: string | null;
  emptyLabel?: string;
  className?: string;
  allowManage?: boolean;
}) {
  const router = useRouter();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [items, setItems] = useState(photos);
  const [currentProfileUrl, setCurrentProfileUrl] = useState(profilePhotoUrl ?? null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setItems(photos);
  }, [photos]);

  useEffect(() => {
    setCurrentProfileUrl(profilePhotoUrl ?? null);
  }, [profilePhotoUrl]);

  function remove(photo: GalleryPhoto) {
    const label = photo.caption?.trim() || "this photo";
    if (!window.confirm(`Delete ${label}? You can upload a new one anytime.`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await deleteSpiderPhoto(photo.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setItems((current) => {
        const next = current.filter((item) => item.id !== photo.id);
        setOpenIndex((currentIndex) => {
          if (currentIndex === null) return null;
          if (next.length === 0) return null;
          return Math.min(currentIndex, next.length - 1);
        });
        if (currentProfileUrl === photo.url) {
          setCurrentProfileUrl(next[0]?.url ?? null);
        }
        return next;
      });
      startTransition(() => {
        router.refresh();
      });
    });
  }

  function setAsProfile(photo: GalleryPhoto) {
    if (currentProfileUrl === photo.url) return;
    setError(null);
    startTransition(async () => {
      const result = await setSpiderProfilePhoto(photo.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCurrentProfileUrl(photo.url);
      startTransition(() => {
        router.refresh();
      });
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-[var(--midnight)]/55">{emptyLabel}</p>;
  }

  return (
    <>
      {error ? (
        <p
          className="mb-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className={cn("grid grid-cols-3 gap-2", className)}>
        {items.map((photo, index) => (
          <div
            key={photo.id}
            className="group relative aspect-square overflow-hidden rounded-2xl bg-[var(--lavender)]"
          >
            <button
              type="button"
              className="absolute inset-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2"
              onClick={() => {
                setError(null);
                setOpenIndex(index);
              }}
              aria-label={`Open photo${photo.caption ? `: ${photo.caption}` : ""}`}
            >
              <SpoodImage
                src={photo.url}
                alt={photo.caption || "Photo"}
                className="h-full w-full transition duration-300 group-hover:scale-[1.04]"
              />
              <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[var(--midnight)]/35 via-transparent to-transparent opacity-0 transition group-hover:opacity-100" />
            </button>
            {currentProfileUrl === photo.url ? (
              <span className="pointer-events-none absolute left-1.5 top-1.5 z-10 rounded-full bg-[var(--panel)]/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--on-panel)]">
                Profile
              </span>
            ) : null}
            {allowManage ? (
              <button
                type="button"
                disabled={pending}
                className="absolute right-1.5 top-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--panel)]/80 text-[var(--on-panel)] opacity-100 shadow-sm transition hover:bg-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
                aria-label={`Delete photo${photo.caption ? `: ${photo.caption}` : ""}`}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  remove(photo);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {openIndex !== null ? (
        <PhotoLightbox
          photos={items}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onChangeIndex={setOpenIndex}
          onDelete={allowManage ? remove : undefined}
          onSetProfile={allowManage ? setAsProfile : undefined}
          profilePhotoUrl={currentProfileUrl}
          busy={pending}
          actionError={error}
        />
      ) : null}
    </>
  );
}

/** Thumbnail (or any trigger) that opens a multi-photo lightbox. */
export function PhotoOpenButton({
  photos,
  index,
  className,
  children,
}: {
  photos: GalleryPhoto[];
  index: number;
  className?: string;
  children: ReactNode;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const photo = photos[index];
  if (!photo) return null;

  return (
    <>
      <button
        type="button"
        className={cn(
          "relative overflow-hidden text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-2",
          className,
        )}
        onClick={() => setOpenIndex(index)}
        aria-label={`Open photo${photo.caption ? `: ${photo.caption}` : ""}`}
      >
        {children}
      </button>
      {openIndex !== null ? (
        <PhotoLightbox
          photos={photos}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onChangeIndex={setOpenIndex}
        />
      ) : null}
    </>
  );
}
