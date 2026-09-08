"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updatePremoltStatus } from "@/app/actions/care";
import { PREMOLT_STATUSES } from "@/lib/constants";
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
  const [pending, setPending] = useState(false);

  useEffect(() => {
    setValue(status);
  }, [status]);

  return (
    <Select
      aria-label="Premolt status"
      disabled={pending}
      value={value}
      onChange={(e) => {
        const next = e.target.value;
        const previous = value;
        setValue(next);
        setPending(true);
        void (async () => {
          try {
            const result = await updatePremoltStatus(spiderId, next);
            if (!result.ok) {
              setValue(previous);
            }
            setPending(false);
            router.refresh();
          } catch {
            setValue(previous);
            setPending(false);
          }
        })();
      }}
    >
      {PREMOLT_STATUSES.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </Select>
  );
}
