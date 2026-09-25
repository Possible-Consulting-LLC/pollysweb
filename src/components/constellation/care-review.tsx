"use client";

import { MutationContextInput } from '@/components/mutation-context';
import { celebrateCare } from "@/components/constellation/celebrations";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { completeCareDay } from "@/app/actions/constellation";
import { Button } from "@/components/ui/button";
import { SpoodImage } from "@/components/spoods/spood-image";

export type ReviewItem = {
  id: string;
  name: string;
  profilePhoto: string | null;
  due: { feeding: boolean; misting: boolean };
  reviewed?: boolean;
  caredFor?: boolean;
  deferred?: {feeding?: string; misting?: string};
};

export function CareReview({ items, completedToday }: { items: ReviewItem[]; completedToday: boolean }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  if (items.length === 0 || completedToday) return null;

  return (
    <section className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-5">
      <h2 className="font-[family-name:var(--font-display)] text-2xl text-[var(--midnight)]">Today’s little check-in</h2>
      <p className="mt-1 text-sm text-[var(--midnight)]/85">{items.filter(item => item.caredFor).length} of {items.length} spoods cared for. Care logs automatically check them in. Log any care still due, or explain why it isn’t right today.</p>
      <form className="mt-4 space-y-4" onSubmit={async (event) => {
        event.preventDefault();
        setError(""); setMessage(""); setSaving(true);
        try {
          const result = await completeCareDay(new FormData(event.currentTarget));
          if (result.ok) {
          celebrateCare(result.message, result.celebrations); setMessage(result.message); router.refresh(); }
          else setError(result.error);
        } catch {
          setError("Could not save your care review. Please try again.");
        } finally { setSaving(false); }
      }}><MutationContextInput />
        {items.map((item) => (
          <fieldset key={item.id} className="rounded-2xl bg-[var(--cream-deep)]/45 p-4">
            <legend className="px-1 font-semibold text-[var(--midnight)]">
              <span className="inline-flex items-center gap-2">
                <span className="relative h-9 w-9 overflow-hidden rounded-full bg-[var(--lavender)] ring-1 ring-[var(--plum)]/10">
                  <SpoodImage
                    src={item.profilePhoto}
                    alt=""
                    className="h-full w-full"
                  />
                </span>
                <span>{item.name}</span>
              </span>
            </legend>
            <label className="flex min-h-11 items-center gap-3 text-sm text-[var(--midnight)]">
              <input type="checkbox" name="reviewed" value={item.id} defaultChecked={item.reviewed} disabled={item.reviewed} className="h-5 w-5 accent-[var(--plum)]" />
              {item.reviewed ? "Checked in on" : "I checked in on"} {item.name}{item.caredFor ? " · Care complete" : ""}
            </label>
            {item.due.feeding || item.due.misting ? (
              <div className="mt-2 space-y-3 border-t border-[var(--plum)]/10 pt-3">
                <p className="text-sm text-[var(--midnight)]/85">Care showing as due: {[
                  item.due.feeding ? "feeding" : null,
                  item.due.misting ? "misting" : null,
                ].filter(Boolean).join(" and ")}. <Link href={`/spoods/${item.id}`} className="font-semibold text-[var(--plum)] underline underline-offset-2">Log care</Link>, then return here.</p>
                {(["feeding", "misting"] as const).filter((kind) => item.due[kind]).map((kind) => (
                  <label key={kind} className="block text-sm text-[var(--midnight)]">
                    <span className="mb-1 block font-medium">If {kind} isn’t appropriate today, why?</span>
                    <input name={`defer:${item.id}:${kind}`} defaultValue={item.deferred?.[kind] ?? ""} maxLength={240} placeholder="Why skip today?" className="min-h-11 w-full rounded-xl border border-[var(--plum)]/20 bg-[var(--input)] px-3 text-base text-[var(--midnight)] placeholder:text-[var(--midnight)]/50" />
                  </label>
                ))}
              </div>
            ) : null}
          </fieldset>
        ))}
        {message ? <p role="status" className="text-sm font-medium text-[var(--midnight)]">{message}</p> : null}
        {error ? <p role="alert" className="text-sm font-medium text-[var(--midnight)]">{error}</p> : null}
        <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : "Save check-in"}</Button>
      </form>
    </section>
  );
}
