"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  quickFeed,
  quickMist,
  quickObservation,
  logMolt,
  type ActionResult,
} from "@/app/actions/care";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  FEEDING_OUTCOMES,
  HYDRATION_METHODS,
  PREY_TYPES,
} from "@/lib/constants";
import { toDateInputValue } from "@/lib/utils";

export type LastFeedingDefaults = {
  preyType: string;
  quantity: number;
  outcome: string;
};

export type LastHydrationDefaults = {
  methods: string[];
};

function togglePanel<T extends string>(
  current: T | null,
  next: T,
): T | null {
  return current === next ? null : next;
}

export function QuickLogButtons({
  spiderId,
  spiderName,
  lastFeeding,
  lastHydration,
}: {
  spiderId: string;
  spiderName: string;
  lastFeeding?: LastFeedingDefaults | null;
  lastHydration?: LastHydrationDefaults | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [panel, setPanel] = useState<
    "feed" | "hydrate" | "molt" | "note" | null
  >(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const defaultPrey =
    lastFeeding?.preyType &&
    (PREY_TYPES as readonly string[]).includes(lastFeeding.preyType)
      ? lastFeeding.preyType
      : PREY_TYPES[0];
  const defaultQuantity = lastFeeding?.quantity && lastFeeding.quantity > 0
    ? lastFeeding.quantity
    : 1;
  const defaultOutcome =
    lastFeeding?.outcome &&
    (FEEDING_OUTCOMES as readonly string[]).includes(lastFeeding.outcome)
      ? lastFeeding.outcome
      : FEEDING_OUTCOMES[0];

  const defaultMethods =
    lastHydration?.methods?.filter((method) =>
      (HYDRATION_METHODS as readonly string[]).includes(method),
    ) ?? [];
  const hydrationDefaults =
    defaultMethods.length > 0 ? defaultMethods : [HYDRATION_METHODS[0]];

  function applyResult(result: ActionResult, closePanel = true) {
    if (result.ok) {
      setError(null);
      setMessage(result.message);
      if (closePanel) setPanel(null);
      router.refresh();
    } else {
      setMessage(null);
      setError(result.error);
    }
  }

  function run(action: () => Promise<ActionResult>, closePanel = true) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await action();
        applyResult(result, closePanel);
      } catch (err) {
        setMessage(null);
        setError(err instanceof Error ? err.message : "Something went wrong.");
      }
    });
  }

  return (
    <div className="space-y-3">
      {(message || error) && (
        <div className="sticky top-2 z-10">
          {message ? (
            <p
              className="rounded-2xl bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 shadow-sm ring-1 ring-emerald-200"
              role="status"
            >
              {message}
            </p>
          ) : null}
          {error ? (
            <p
              className="rounded-2xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-800 shadow-sm ring-1 ring-rose-200"
              role="alert"
            >
              {error}
            </p>
          ) : null}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={pending}
          className="w-full"
          aria-expanded={panel === "feed"}
          onClick={() => setPanel((p) => togglePanel(p, "feed"))}
        >
          Fed
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={pending}
          className="w-full"
          aria-expanded={panel === "hydrate"}
          onClick={() => setPanel((p) => togglePanel(p, "hydrate"))}
        >
          Hydration
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="lg"
          disabled={pending}
          onClick={() => setPanel((p) => togglePanel(p, "molt"))}
        >
          Molt
        </Button>
        <Button
          type="button"
          variant="soft"
          size="lg"
          disabled={pending}
          onClick={() => setPanel((p) => togglePanel(p, "note"))}
        >
          Observation
        </Button>
      </div>

      {panel === "feed" ? (
        <form
          key={`feed-${defaultPrey}-${defaultQuantity}-${defaultOutcome}`}
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            run(() => quickFeed(spiderId, fd));
          }}
        >
          <p className="text-sm font-semibold text-[var(--midnight)]">
            Log a feeding for {spiderName}
          </p>
          <Field label="Date" htmlFor={`fd-${spiderId}`}>
            <Input
              id={`fd-${spiderId}`}
              name="date"
              type="date"
              defaultValue={toDateInputValue(new Date())}
              required
            />
          </Field>
          <Field label="Prey type" htmlFor={`prey-${spiderId}`}>
            <Select
              id={`prey-${spiderId}`}
              name="preyType"
              defaultValue={defaultPrey}
            >
              {PREY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Quantity" htmlFor={`qty-${spiderId}`}>
              <Input
                id={`qty-${spiderId}`}
                name="quantity"
                type="number"
                min={1}
                defaultValue={defaultQuantity}
              />
            </Field>
            <Field label="Outcome" htmlFor={`out-${spiderId}`}>
              <Select
                id={`out-${spiderId}`}
                name="outcome"
                defaultValue={defaultOutcome}
              >
                {FEEDING_OUTCOMES.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes (optional)" htmlFor={`fn-${spiderId}`}>
            <Input
              id={`fn-${spiderId}`}
              name="notes"
              placeholder="Optional note"
            />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save feeding"}
          </Button>
        </form>
      ) : null}

      {panel === "hydrate" ? (
        <form
          key={`hydrate-${hydrationDefaults.join("|")}`}
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            run(() => quickMist(spiderId, fd));
          }}
        >
          <p className="text-sm font-semibold text-[var(--midnight)]">
            Log hydration for {spiderName}
          </p>
          <Field label="Date" htmlFor={`hd-${spiderId}`}>
            <Input
              id={`hd-${spiderId}`}
              name="date"
              type="date"
              defaultValue={toDateInputValue(new Date())}
              required
            />
          </Field>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-[var(--midnight)]">
              How did you offer water?
            </legend>
            <div className="space-y-2">
              {HYDRATION_METHODS.map((method) => (
                <label
                  key={method}
                  className="flex items-center gap-2 text-sm text-[var(--midnight)]/85"
                >
                  <input
                    type="checkbox"
                    name="method"
                    value={method}
                    defaultChecked={hydrationDefaults.includes(method)}
                    className="rounded"
                  />
                  {method}
                </label>
              ))}
            </div>
          </fieldset>
          <Field label="Notes (optional)" htmlFor={`hn-${spiderId}`}>
            <Input
              id={`hn-${spiderId}`}
              name="notes"
              placeholder="Optional note"
            />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save hydration"}
          </Button>
        </form>
      ) : null}

      {panel === "molt" ? (
        <form
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            run(() => logMolt(spiderId, fd));
          }}
        >
          <Field label="Molt date" htmlFor={`md-${spiderId}`}>
            <Input
              id={`md-${spiderId}`}
              name="moltDate"
              type="date"
              defaultValue={toDateInputValue(new Date())}
              required
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Field label="Previous instar" htmlFor={`pi-${spiderId}`}>
              <Input
                id={`pi-${spiderId}`}
                name="previousInstar"
                placeholder="i8"
              />
            </Field>
            <Field label="New instar" htmlFor={`ni-${spiderId}`}>
              <Input id={`ni-${spiderId}`} name="newInstar" placeholder="i9" />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm text-[var(--midnight)]/80">
            <input type="checkbox" name="approximate" className="rounded" />
            Approximate date
          </label>
          <label className="flex items-center gap-2 text-sm text-[var(--midnight)]/80">
            <input
              type="checkbox"
              name="successful"
              defaultChecked
              className="rounded"
            />
            Successful molt
          </label>
          <Field label="Notes" htmlFor={`mn-${spiderId}`}>
            <Textarea id={`mn-${spiderId}`} name="notes" />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save molt"}
          </Button>
        </form>
      ) : null}

      {panel === "note" ? (
        <form
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            run(() => quickObservation(spiderId, fd));
          }}
        >
          <Field label="Date" htmlFor={`od-${spiderId}`}>
            <Input
              id={`od-${spiderId}`}
              name="date"
              type="date"
              defaultValue={toDateInputValue(new Date())}
              required
            />
          </Field>
          <Field label="What did you notice?" htmlFor={`ok-${spiderId}`}>
            <Select
              id={`ok-${spiderId}`}
              name="kind"
              defaultValue="behavior note"
            >
              <option value="built a new hammock">built a new hammock</option>
              <option value="unusually active">unusually active</option>
              <option value="hiding more than usual">
                hiding more than usual
              </option>
              <option value="explored enclosure">explored enclosure</option>
              <option value="refused food">refused food</option>
              <option value="moved hammock">moved hammock</option>
              <option value="drinking water">drinking water</option>
              <option value="behavior note">behavior note</option>
              <option value="custom note">custom note</option>
            </Select>
          </Field>
          <Field label="Notes" htmlFor={`on-${spiderId}`}>
            <Textarea id={`on-${spiderId}`} name="notes" />
          </Field>
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? "Saving…" : "Save observation"}
          </Button>
        </form>
      ) : null}

      <p className="text-xs text-[var(--midnight)]/45">
        Fed and Hydration open a short form — defaults match what you logged
        last time for {spiderName}.
      </p>
    </div>
  );
}
