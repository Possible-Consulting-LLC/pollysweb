import assert from "node:assert/strict";
import test from "node:test";
import type { SpiderCareView } from "./spiders";
import { reviewItemsFor } from "./constellation-data";

const free = { proAccess: false, firstSpiderId: "oldest" };
const activePro = { proAccess: true, firstSpiderId: "oldest" };

function views(memorializeOldest = false): SpiderCareView[] {
  return [
    { spider: { id: "later", name: "Later", createdAt: new Date("2026-09-02"), memorializedAt: null, profilePhoto: null, status: "Normal" }, daysSinceSuccessfulFeed: 1, daysSinceMolt: null, mistDue: false },
    { spider: { id: "oldest", name: "Oldest", createdAt: new Date("2026-09-01"), memorializedAt: memorializeOldest ? new Date("2026-09-10") : null, profilePhoto: null, status: "Normal" }, daysSinceSuccessfulFeed: 1, daysSinceMolt: null, mistDue: false },
  ] as SpiderCareView[];
}

test("free care review contains only the first-created active spood", () => {
  assert.deepEqual(reviewItemsFor(views(), 3, free).map((item) => item.id), ["oldest"]);
});

test("memorializing the first-created spood promotes the oldest active replacement", () => {
  assert.deepEqual(reviewItemsFor(views(true), 3, { ...free, firstSpiderId: "later" }).map((item) => item.id), ["later"]);
});

test("effective Pro care review contains all active spoods", () => {
  assert.deepEqual(reviewItemsFor(views(), 3, activePro).map((item) => item.id), ["later", "oldest"]);
});
