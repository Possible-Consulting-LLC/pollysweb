"use client";

import { useEffect, useRef, type MouseEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export function ModalDialog({
  children,
  onClose,
  labelledBy,
  className,
}: {
  children: ReactNode;
  onClose: () => void;
  labelledBy: string;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, []);

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={labelledBy}
      className={cn(
        "fixed inset-0 z-[100] m-0 h-dvh max-h-none w-full max-w-none bg-transparent p-0",
        "backdrop:bg-[var(--midnight)]/45 backdrop:backdrop-blur-sm",
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={handleBackdropClick}
    >
      {children}
    </dialog>
  );
}
