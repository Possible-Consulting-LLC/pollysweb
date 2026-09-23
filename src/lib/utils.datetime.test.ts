import test from "node:test";
import assert from "node:assert/strict";
import {
  parseZonedDateTimeInput,
  toDateTimeLocalInputValue,
  formatDateTimeInZone,
  requireNonFutureFormDateTime,
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

test("Pacific 9am round-trips without looking like 4pm UTC", () => {
  const parsed = parseZonedDateTimeInput(
    "2026-09-08T09:00",
    "America/Los_Angeles",
  );
  assert.ok(parsed);
  assert.equal(parsed!.toISOString(), "2026-09-08T16:00:00.000Z");
  const pacific = formatDateTimeInZone(parsed, "America/Los_Angeles", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const utc = formatDateTimeInZone(parsed, "UTC", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  assert.match(pacific, /9:00/);
  assert.match(utc, /4:00/);
  assert.equal(
    toDateTimeLocalInputValue(parsed, "America/Los_Angeles"),
    "2026-09-08T09:00",
  );
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

test("activity timestamps cannot be later than the current instant", () => {
  const now = new Date("2026-09-16T17:00:00.000Z");
  const form = new FormData();
  form.set("timeZone", "America/Los_Angeles");
  form.set("date", "2026-09-16T10:00");
  assert.equal(requireNonFutureFormDateTime(form, "date", "UTC", now).toISOString(), now.toISOString());
  form.set("date", "2026-09-16T10:01");
  assert.throws(() => requireNonFutureFormDateTime(form, "date", "UTC", now), /future/i);
  form.set("date", "2026-09-16T09:59");
  assert.equal(requireNonFutureFormDateTime(form, "date", "UTC", now).toISOString(), "2026-09-16T16:59:00.000Z");
});

test("absolute timestamps and renamed molt field follow the same limit", () => {
  const now = new Date("2026-09-16T17:00:00.000Z");
  const form = new FormData();
  form.set("timeZone", "America/Los_Angeles");
  form.set("moltDate", "2026-09-16T17:00:01.000Z");
  assert.throws(() => requireNonFutureFormDateTime(form, "moltDate", "UTC", now), /future/i);
});
