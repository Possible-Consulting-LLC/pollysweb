import test from "node:test";
import assert from "node:assert/strict";
import {
  parseZonedDateTimeInput,
  toDateTimeLocalInputValue,
  formatDateTimeInZone,
} from "@/lib/utils";

test("parseZonedDateTimeInput keeps Chicago wall time", () => {
  const parsed = parseZonedDateTimeInput(
    "2026-01-15T14:30",
    "America/Chicago",
  );
  assert.ok(parsed);
  const label = formatDateTimeInZone(parsed, "America/Chicago", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  assert.match(label, /2:30/);
  assert.match(label, /2026/);
});

test("toDateTimeLocalInputValue formats in a zone", () => {
  const utc = new Date("2026-06-01T18:00:00.000Z");
  const value = toDateTimeLocalInputValue(utc, "America/New_York");
  // EDT in June: 14:00
  assert.equal(value, "2026-06-01T14:00");
});

test("ISO strings with offset parse absolutely", () => {
  const parsed = parseZonedDateTimeInput(
    "2026-09-08T20:00:00.000Z",
    "America/Los_Angeles",
  );
  assert.ok(parsed);
  assert.equal(parsed!.toISOString(), "2026-09-08T20:00:00.000Z");
});
