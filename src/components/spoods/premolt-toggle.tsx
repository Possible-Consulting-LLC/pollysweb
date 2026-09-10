"use client";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { updatePremoltStatus } from "@/app/actions/care";
import { PREMOLT_STATUSES } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";

export function PremoltToggle({
  spiderId,
  status,
}: {
  spiderId: string;
  status: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [prevStatus, setPrevStatus] = useState(status);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dirty = value !== status;

  if (status !== prevStatus) {
    setPrevStatus(status);
    setValue(status);
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!dirty || saving) return;
        setError(null);
        setMessage(null);
        setSaving(true);
        void (async () => {
          try {
            const result = await updatePremoltStatus(spiderId, value);
            if (!result.ok) {
              setError(result.error);
              setSaving(false);
              return;
            }
            setMessage(result.message);
            setSaving(false);
            // Low-priority refresh — nav clicks stay urgent/instant.
            startTransition(() => {
              router.refresh();
            });
          } catch {
            setError("Could not update premolt status.");
            setSaving(false);
          }
        })();
      }}
    >
      <Select
        aria-label="Premolt status"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setMessage(null);
          setError(null);
        }}
      >
        {PREMOLT_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </Select>
      {message ? (
        <p
          className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm text-emerald-800"
          role="status"
        >
          {message}
        </p>
      ) : null}
      {error ? (
        <p
          className="rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={!dirty || saving} className="w-full">
        {saving ? "Saving…" : dirty ? "Save premolt status" : "Saved"}
      </Button>
    </form>
  );
}
