"use client";

import { useTransition } from "react";
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
  const [pending, startTransition] = useTransition();

  return (
    <Select
      aria-label="Premolt status"
      disabled={pending}
      value={status}
      onChange={(e) => {
        const next = e.target.value;
        startTransition(async () => {
          await updatePremoltStatus(spiderId, next);
          router.refresh();
        });
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
