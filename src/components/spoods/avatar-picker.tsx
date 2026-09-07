"use client";

import { useId, useRef, useState } from "react";
import {
  DEFAULT_SPOOOD_AVATAR_SRC,
  DEFAULT_SPOOOD_AVATARS,
} from "@/lib/constants";
import { cn } from "@/lib/utils";

export function SpoodAvatarPicker() {
  const inputId = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selected, setSelected] = useState<string>(DEFAULT_SPOOOD_AVATAR_SRC);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  function pickDefault(src: string) {
    setSelected(src);
    setUploadPreview(null);
    setFileName(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function onFileChange(file: File | null) {
    if (!file) {
      setUploadPreview(null);
      setFileName(null);
      setSelected(DEFAULT_SPOOOD_AVATAR_SRC);
      return;
    }
    const url = URL.createObjectURL(file);
    setUploadPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setFileName(file.name);
    setSelected("upload");
  }

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--plum)]/15 bg-[var(--cream-deep)]/40 p-3">
      <div>
        <p className="text-sm font-semibold text-[var(--midnight)]">Photo</p>
        <p className="mt-0.5 text-xs text-[var(--midnight)]/55">
          Pick a default portrait or upload your own (up to 5MB).
        </p>
      </div>

      <input type="hidden" name="profilePhoto" value={selected === "upload" ? "" : selected} />

      <div className="grid grid-cols-5 gap-2">
        {DEFAULT_SPOOOD_AVATARS.map((avatar) => {
          const active = selected === avatar.src && !uploadPreview;
          return (
            <button
              key={avatar.id}
              type="button"
              onClick={() => pickDefault(avatar.src)}
              aria-pressed={active}
              aria-label={`Use ${avatar.label} portrait`}
              className={cn(
                "group flex flex-col items-center gap-1 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]",
              )}
            >
              <span
                className={cn(
                  "relative aspect-square w-full overflow-hidden rounded-2xl border-2 transition",
                  active
                    ? "border-[var(--plum)] shadow-md shadow-[var(--plum)]/20"
                    : "border-transparent group-hover:border-[var(--plum)]/35",
                )}
              >
                {/* Plain img avoids next/image caching stale SVG portraits. */}
                <img
                  src={avatar.src}
                  alt=""
                  className="h-full w-full object-cover transition duration-300 ease-out group-hover:scale-110 group-focus-visible:scale-110"
                  draggable={false}
                />
              </span>
              <span
                className={cn(
                  "text-[10px] font-semibold tracking-wide",
                  active ? "text-[var(--plum)]" : "text-[var(--midnight)]/55",
                )}
              >
                {avatar.label}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={cn(
            "inline-flex h-10 cursor-pointer items-center rounded-2xl border border-[var(--plum)]/15 bg-[var(--card)] px-3 text-sm font-semibold text-[var(--midnight)] transition hover:bg-[var(--hover-strong)]",
            selected === "upload" && "border-[var(--plum)]",
          )}
        >
          Upload a photo
        </label>
        <input
          ref={fileRef}
          id={inputId}
          name="photo"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          onChange={(event) => onFileChange(event.target.files?.[0] ?? null)}
        />
        {fileName ? (
          <span className="truncate text-xs text-[var(--midnight)]/60">{fileName}</span>
        ) : (
          <span className="text-xs text-[var(--midnight)]/45">JPG, PNG, WebP, or GIF</span>
        )}
      </div>

      {uploadPreview ? (
        <div className="flex items-center gap-3">
          <div className="relative h-16 w-16 overflow-hidden rounded-2xl border border-[var(--plum)]/20">
            <img src={uploadPreview} alt="Upload preview" className="h-full w-full object-cover" />
          </div>
          <button
            type="button"
            className="text-sm font-semibold text-[var(--plum)] hover:underline"
            onClick={() => pickDefault(DEFAULT_SPOOOD_AVATAR_SRC)}
          >
            Clear upload
          </button>
        </div>
      ) : null}
    </div>
  );
}
