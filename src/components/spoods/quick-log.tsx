"use client";

import { MutationContextInput } from '@/components/mutation-context';
import { celebrateCare } from "@/components/constellation/celebrations";

import { useState, startTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  quickFeed,
  quickMist,
  quickObservation,
  quickInteraction,
  logMolt,
  type ActionResult,
} from "@/app/actions/care";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  FEEDING_OUTCOMES,
  HYDRATION_METHODS,
  PREY_TYPES,
  OBSERVATION_KINDS,
  observationLabel,
} from "@/lib/constants";
import { DateTimeField } from "@/components/ui/datetime-field";
import { MoltStageFields } from "@/components/spoods/molt-stage-fields";
import { INTERACTION_METHODS } from "@/lib/interaction";

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

function softRefresh(router: ReturnType<typeof useRouter>) {
  // Keep this low-priority so Home / Settings taps aren't queued behind it.
  startTransition(() => {
    router.refresh();
  });
}

export function QuickLogButtons({
  spiderId,
  spiderName,
  currentLifeStage,
  lastFeeding,
  lastHydration,
}: {
  spiderId: string;
  spiderName: string;
  currentLifeStage?: string | null;
  lastFeeding?: LastFeedingDefaults | null;
  lastHydration?: LastHydrationDefaults | null;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [panel, setPanel] = useState<
    "feed" | "hydrate" | "molt" | "note" | "play" | null
  >(null);
  const [interactionMethod, setInteractionMethod] = useState<string>(INTERACTION_METHODS[0]);
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

  async function run(action: () => Promise<ActionResult>, closePanel = true) {
    setError(null);
    setMessage(null);
    setSaving(true);
    try {
      const result = await action();
      if (result.ok) {
          celebrateCare(result.message, result.celebrations);
        setMessage(result.message);
        if (closePanel) setPanel(null);
        setSaving(false);
        softRefresh(router);
      } else {
        setError(result.error);
        setSaving(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setSaving(false);
    }
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

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Button
          type="button"
          variant="secondary"
          size="lg"
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
          aria-expanded={panel === "molt"}
          onClick={() => setPanel((p) => togglePanel(p, "molt"))}
        >
          Molt
        </Button>
        <Button
          type="button"
          variant="soft"
          size="lg"
          aria-expanded={panel === "note"}
          onClick={() => setPanel((p) => togglePanel(p, "note"))}
        >
          Observation
        </Button>
        <Button
          type="button"
          variant="soft"
          size="lg"
          className="col-span-2 sm:col-span-1"
          aria-expanded={panel === "play"}
          onClick={() => setPanel((p) => togglePanel(p, "play"))}
        >
          Play
        </Button>
      </div>

      {panel === "play" ? (
        <form
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            void run(() => quickInteraction(spiderId, new FormData(event.currentTarget)));
          }}
        ><MutationContextInput />
          <p className="text-sm font-semibold text-[var(--midnight)]">Play & interaction with {spiderName}</p>
          <p className="text-sm text-[var(--midnight)]/70">Only log this if it happened. Physical contact is never required.</p>
          <DateTimeField id={`pd-${spiderId}`} name="date" label="When" />
          <Field label="How did you interact?" htmlFor={`pm-${spiderId}`}>
            <Select id={`pm-${spiderId}`} name="method" value={interactionMethod} onChange={(event) => setInteractionMethod(event.target.value)}>
              {INTERACTION_METHODS.map((method) => <option key={method} value={method}>{method}</option>)}
            </Select>
          </Field>
          {interactionMethod === "Other" ? (
            <Field label="Describe how" htmlFor={`po-${spiderId}`}>
              <Input id={`po-${spiderId}`} name="otherMethod" maxLength={120} required />
            </Field>
          ) : null}
          <Field label="What happened? (optional)" htmlFor={`pn-${spiderId}`}>
            <Textarea id={`pn-${spiderId}`} name="notes" maxLength={1000} />
          </Field>
          <Button type="submit" disabled={saving} className="w-full">{saving ? "Saving…" : "Save moment"}</Button>
        </form>
      ) : null}

      {panel === "feed" ? (
        <form
          key={`feed-${defaultPrey}-${defaultQuantity}-${defaultOutcome}`}
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            void run(() => quickFeed(spiderId, fd));
          }}
        ><MutationContextInput />
          <p className="text-sm font-semibold text-[var(--midnight)]">
            Log a feeding for {spiderName}
          </p>
          <DateTimeField
            id={`fd-${spiderId}`}
            name="date"
            label="When"
          />
          <Field label="Prey type" htmlFor={`prey-${spiderId}`}>
            <Select
              id={`prey-${spiderId}`}
              name="preyType"
              defaultValue={defaultPrey}
            >
              {PREY_TYPES.map((p) => (
                <option key={p} value={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
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
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save feeding"}
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
            void run(() => quickMist(spiderId, fd));
          }}
        ><MutationContextInput />
          <p className="text-sm font-semibold text-[var(--midnight)]">
            Log hydration for {spiderName}
          </p>
          <DateTimeField
            id={`hd-${spiderId}`}
            name="date"
            label="When"
          />
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
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save hydration"}
          </Button>
        </form>
      ) : null}

      {panel === "molt" ? (
        <form
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            void run(() => logMolt(spiderId, fd));
          }}
        ><MutationContextInput />
          <DateTimeField
            id={`md-${spiderId}`}
            name="moltDate"
            label="When"
          />
          <MoltStageFields previousStage={currentLifeStage ?? ""} />
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
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save molt"}
          </Button>
        </form>
      ) : null}

      {panel === "note" ? (
        <form
          className="space-y-3 rounded-2xl bg-[var(--cream-deep)]/50 p-3"
          onSubmit={(event) => {
            event.preventDefault();
            const fd = new FormData(event.currentTarget);
            void run(() => quickObservation(spiderId, fd));
          }}
        ><MutationContextInput />
          <DateTimeField
            id={`od-${spiderId}`}
            name="date"
            label="When"
          />
          <Field label="What did you notice?" htmlFor={`ok-${spiderId}`}>
            <Select
              id={`ok-${spiderId}`}
              name="kind"
              defaultValue="behavior note"
            >
              {OBSERVATION_KINDS.filter(kind => kind !== "play and interaction").map(kind => (
                <option key={kind} value={kind}>{observationLabel(kind)}</option>
              ))}
            </Select>
          </Field>
          <Field label="Notes" htmlFor={`on-${spiderId}`}>
            <Textarea id={`on-${spiderId}`} name="notes" />
          </Field>
          <Button type="submit" disabled={saving} className="w-full">
            {saving ? "Saving…" : "Save observation"}
          </Button>
        </form>
      ) : null}

      <p className="text-xs text-[var(--midnight)]/45">
        Fed and Hydration open a short form — tap Save when you’re ready.
        Defaults match what you logged last time for {spiderName}.
      </p>
    </div>
  );
}
