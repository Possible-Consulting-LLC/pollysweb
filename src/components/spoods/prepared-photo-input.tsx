"use client";

import { useEffect, useId, useRef, useState, type RefObject } from 'react';
import { PHOTO_ACCEPT, PhotoPreparationError, preparePhoto } from '@/lib/prepare-photo';

type Props = {
  id: string;
  inputRef?: RefObject<HTMLInputElement | null>;
  className?: string;
  required?: boolean;
  onReady?: (file: File | null) => void;
};

export function PreparedPhotoInput({ id, inputRef, className, required, onReady }: Props) {
  const ownRef = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? ownRef;
  const generation = useRef(0);
  const feedbackId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => () => { generation.current++; }, []);

  return <>
    <input ref={ref} id={id} name="photo" type="file" accept={PHOTO_ACCEPT}
      required={required} className={className} aria-invalid={Boolean(error)} aria-describedby={feedbackId}
      onChange={async event => {
        const input = event.currentTarget;
        const file = input.files?.[0];
        const version = ++generation.current;
        setError(null); setPreview(null); onReady?.(null);
        if (!file) { input.setCustomValidity(''); setBusy(false); return; }
        input.setCustomValidity('Please wait while your photo is prepared.'); setBusy(true);
        try {
          const prepared = await preparePhoto(file);
          if (version !== generation.current || input.files?.[0] !== file) return;
          const transfer = new DataTransfer(); transfer.items.add(prepared); input.files = transfer.files;
          input.setCustomValidity(''); setPreview(URL.createObjectURL(prepared)); onReady?.(prepared);
        } catch (cause) {
          if (version !== generation.current || input.files?.[0] !== file) return;
          const message = cause instanceof PhotoPreparationError ? cause.message : 'We couldn’t prepare this photo. Try a smaller JPEG, PNG, WebP or still GIF, or export your HEIC/HEIF photo as JPEG.';
          input.setCustomValidity(message); setError(message);
        } finally { if (version === generation.current) setBusy(false); }
      }} />
    <div id={feedbackId} aria-live="polite">
      {busy && <p role="status" className="text-sm">Preparing photo…</p>}
      {error && <p role="alert" className="text-sm text-rose-700">{error}</p>}
    </div>
    {preview && <img src={preview} alt="Prepared photo preview" className="h-20 w-20 rounded-xl object-cover" />}
  </>;
}
