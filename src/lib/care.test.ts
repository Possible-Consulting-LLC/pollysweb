import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  daysBetweenMolts,
  daysSince,
  deriveCareStatus,
  fastingDaysBeforeMolt,
  isSuccessfulFeeding,
  nextInstar,
  shouldSuppressFeedingReminder,
} from "./care";

describe("isSuccessfulFeeding", () => {
  it("treats ate normally and partially as successful", () => {
    assert.equal(isSuccessfulFeeding("Ate normally"), true);
    assert.equal(isSuccessfulFeeding("Ate partially"), true);
    assert.equal(isSuccessfulFeeding("Ignored prey"), false);
    assert.equal(isSuccessfulFeeding("Refused prey"), false);
  });
});

describe("daysSince / molt math", () => {
  it("counts calendar days since an event", () => {
    const now = new Date("2026-09-05T12:00:00Z");
    assert.equal(daysSince(new Date("2026-09-05T01:00:00Z"), now), 0);
    assert.equal(daysSince(new Date("2026-09-04T23:00:00Z"), now), 1);
    assert.equal(daysSince(new Date("2026-09-02T12:00:00Z"), now), 3);
    assert.equal(daysSince(null, now), null);
  });

  it("computes days between molts", () => {
    assert.equal(
      daysBetweenMolts(new Date("2026-06-18"), new Date("2026-07-20")),
      32,
    );
    assert.equal(
      daysBetweenMolts(new Date("2026-07-20"), new Date("2026-08-30")),
      41,
    );
  });

  it("computes fasting duration before molt", () => {
    assert.equal(
      fastingDaysBeforeMolt(new Date("2026-08-20"), new Date("2026-08-30")),
      10,
    );
    assert.equal(fastingDaysBeforeMolt(null, new Date("2026-08-30")), null);
  });
});

describe("nextInstar", () => {
  it("increments iN style instars", () => {
    assert.equal(nextInstar("i8"), "i9");
    assert.equal(nextInstar("I6"), "i7");
    assert.equal(nextInstar("adult"), "adult");
    assert.equal(nextInstar(null), null);
  });
});

describe("reminder suppression and care status", () => {
  const base = {
    lastFedAt: new Date("2026-08-30"),
    lastSuccessfulFedAt: new Date("2026-08-30"),
    lastMistedAt: new Date("2026-09-04"),
    lastMoltAt: new Date("2026-08-01"),
    feedIntervalDays: 3,
    mistIntervalDays: 1,
    now: new Date("2026-09-05"),
  };

  it("suppresses feeding reminders in premolt", () => {
    assert.equal(shouldSuppressFeedingReminder("Premolt"), true);
    assert.equal(shouldSuppressFeedingReminder("Possible premolt"), true);
    assert.equal(shouldSuppressFeedingReminder("Molting"), true);
    assert.equal(shouldSuppressFeedingReminder("Normal"), false);
  });

  it("flags feeding due when overdue and not in premolt", () => {
    assert.equal(
      deriveCareStatus({ ...base, status: "Normal", lastMistedAt: new Date("2026-09-05") }),
      "Feeding due",
    );
  });

  it("does not flag feeding overdue during premolt", () => {
    assert.equal(
      deriveCareStatus({ ...base, status: "Premolt", lastMistedAt: new Date("2026-09-05") }),
      "In premolt",
    );
  });

  it("prioritizes mist when due", () => {
    assert.equal(
      deriveCareStatus({
        ...base,
        status: "Normal",
        lastSuccessfulFedAt: new Date("2026-09-04"),
        lastFedAt: new Date("2026-09-04"),
        lastMistedAt: new Date("2026-09-03"),
      }),
      "Mist today",
    );
  });

  it("returns all good when care is current", () => {
    assert.equal(
      deriveCareStatus({
        ...base,
        status: "Normal",
        lastSuccessfulFedAt: new Date("2026-09-04"),
        lastFedAt: new Date("2026-09-04"),
        lastMistedAt: new Date("2026-09-05"),
      }),
      "All good",
    );
  });
});
