"use client";

import Link from "next/link";
import { useState } from "react";
import {
  deleteActivityAction,
  updateActivityAction,
  type ActivityType,
} from "@/app/actions/activity";
import { useActionFeedback } from "@/components/spoods/profile-forms";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { DateTimeField } from "@/components/ui/datetime-field";
import {
  BODY_CONDITIONS,
  FEEDING_OUTCOMES,
  HYDRATION_METHODS,
  OBSERVATION_KINDS,
  PREY_TYPES,
} from "@/lib/constants";
import type { ActivityItem } from "@/lib/spiders";

type EditableItem = {
  id: string;
  type: ActivityType;
  spiderId: string;
  spiderName: string;
  title: string;
  detail?: string | null;
  dateLabel: string;
  fields: ActivityItem["fields"] & {
    caption?: string | null;
  };
};

export function ActivityEditorList({ items }: { items: EditableItem[] }) {
  return (
    <div className="divide-y divide-[var(--plum)]/10 overflow-hidden rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)]">
      {items.map((item) => (
        <ActivityEditorRow key={`${item.type}-${item.id}`} item={item} />
      ))}
    </div>
  );
}

export function ActivityEditorRow({
  item,
  compact = false,
}: {
  item: EditableItem;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const { pending, message, error, run } = useActionFeedback();

  return (
    <div className={compact ? "space-y-2" : "px-4 py-3"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {!compact ? (
            <p className="text-xs uppercase tracking-wide text-[var(--plum)]/70">
              {item.type}
            </p>
          ) : null}
          <p className="font-semibold text-[var(--midnight)]">{item.title}</p>
          {item.detail ? (
            <p className="text-sm text-[var(--midnight)]/55">{item.detail}</p>
          ) : null}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <time className="text-xs text-[var(--midnight)]/45">{item.dateLabel}</time>
            {!compact ? (
              <Link
                href={`/spoods/${item.spiderId}`}
                className="text-xs font-semibold text-[var(--plum)] hover:underline"
              >
                Profile
              </Link>
            ) : null}
            <button
              type="button"
              className="text-xs font-semibold text-[var(--plum)] hover:underline"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Close" : "Edit"}
            </button>
          </div>
        </div>
      </div>

      {message ? (
        <p className="mt-2 rounded-2xl bg-emerald-500/15 px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 rounded-2xl bg-rose-50 px-3 py-2 text-sm text-rose-800" role="alert">
          {error}
        </p>
      ) : null}

      {open ? (
        <form
          className="mt-3 space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            run(async () => {
              const result = await updateActivityAction(
                item.type,
                item.id,
                formData,
              );
              if (result.ok) setOpen(false);
              return result;
            });
          }}
        >
          <DateTimeField
            name="date"
            label="When"
            defaultValue={item.fields.date}
          />

          {item.type === "feeding" ? (
            <>
              <Field label="Prey type">
                <Select name="preyType" defaultValue={item.fields.preyType || PREY_TYPES[0]}>
                  {PREY_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                  {item.fields.preyType &&
                  !(PREY_TYPES as readonly string[]).includes(item.fields.preyType) ? (
                    <option value={item.fields.preyType}>{item.fields.preyType}</option>
                  ) : null}
                </Select>
              </Field>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Quantity">
                  <Input
                    type="number"
                    name="quantity"
                    min={1}
                    defaultValue={item.fields.quantity ?? 1}
                  />
                </Field>
                <Field label="Prey size">
                  <Input
                    name="preySize"
                    defaultValue={item.fields.preySize ?? ""}
                    placeholder="Optional"
                  />
                </Field>
              </div>
              <Field label="Outcome">
                <Select name="outcome" defaultValue={item.fields.outcome || FEEDING_OUTCOMES[0]}>
                  {FEEDING_OUTCOMES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                  {item.fields.outcome &&
                  !(FEEDING_OUTCOMES as readonly string[]).includes(item.fields.outcome) ? (
                    <option value={item.fields.outcome}>{item.fields.outcome}</option>
                  ) : null}
                </Select>
              </Field>
            </>
          ) : null}

          {item.type === "misting" ? (
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-[var(--midnight)]">
                Hydration methods
              </legend>
              {HYDRATION_METHODS.map((method) => (
                <label key={method} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="method"
                    value={method}
                    defaultChecked={(item.fields.methods ?? []).includes(method)}
                  />
                  {method}
                </label>
              ))}
            </fieldset>
          ) : null}

          {item.type === "molt" ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Previous instar">
                  <Input
                    name="previousInstar"
                    defaultValue={item.fields.previousInstar ?? ""}
                  />
                </Field>
                <Field label="New instar">
                  <Input name="newInstar" defaultValue={item.fields.newInstar ?? ""} />
                </Field>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="approximate"
                  defaultChecked={Boolean(item.fields.approximate)}
                />
                Approximate date
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="successful"
                  defaultChecked={item.fields.successful !== false}
                />
                Successful molt
              </label>
            </>
          ) : null}

          {item.type === "observation" ? (
            <Field label="Kind">
              <Select name="kind" defaultValue={item.fields.kind || OBSERVATION_KINDS[0]}>
                {OBSERVATION_KINDS.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
                {item.fields.kind &&
                !(OBSERVATION_KINDS as readonly string[]).includes(item.fields.kind) ? (
                  <option value={item.fields.kind}>{item.fields.kind}</option>
                ) : null}
              </Select>
            </Field>
          ) : null}

          {item.type === "body" ? (
            <Field label="Condition">
              <Select
                name="condition"
                defaultValue={item.fields.condition || BODY_CONDITIONS[2]}
              >
                {BODY_CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {item.type === "maintenance" ? (
            <Field label="Kind">
              <Select name="kind" defaultValue={item.fields.kind || "cleaning"}>
                <option value="cleaning">Cleaning</option>
                <option value="rehouse">Rehouse</option>
                <option value="maintenance">Maintenance</option>
              </Select>
            </Field>
          ) : null}

          {item.type === "photo" ? (
            <Field label="Caption">
              <Input name="caption" defaultValue={item.fields.caption ?? ""} />
            </Field>
          ) : null}

          {item.type !== "photo" ? (
            <Field label="Notes">
              <Textarea name="notes" rows={2} defaultValue={item.fields.notes ?? ""} />
            </Field>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" className="flex-1" disabled={pending}>
              {pending ? "Saving…" : "Save changes"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="flex-1 text-rose-800"
              disabled={pending}
              onClick={() => {
                if (
                  !window.confirm(
                    "Delete this activity log? This can’t be undone.",
                  )
                ) {
                  return;
                }
                run(async () => {
                  const result = await deleteActivityAction(item.type, item.id);
                  if (result.ok) setOpen(false);
                  return result;
                });
              }}
            >
              Delete
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
