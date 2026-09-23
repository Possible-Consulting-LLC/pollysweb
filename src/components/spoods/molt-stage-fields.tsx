"use client";

import { useState } from "react";
import { LifeStageField } from "@/components/spoods/life-stage-field";
import { nextLifeStage } from "@/lib/spood-details";

export function MoltStageFields({ previousStage = "", newStage }: { previousStage?: string; newStage?: string }) {
  const [previous, setPrevious] = useState(previousStage);
  const [next, setNext] = useState(() => newStage ?? nextLifeStage(previousStage));
  // Existing history values and explicit keeper corrections must not be overwritten.
  const [nextEdited, setNextEdited] = useState(newStage !== undefined);
  return (
    <div className="grid grid-cols-2 gap-2">
      <LifeStageField name="previousInstar" label="Previous instar" value={previous} onChange={value => {
        setPrevious(value);
        if (!nextEdited) setNext(nextLifeStage(value));
      }} />
      <LifeStageField name="newInstar" label="New instar" value={next} onChange={value => {
        setNextEdited(true);
        setNext(value);
      }} />
    </div>
  );
}
