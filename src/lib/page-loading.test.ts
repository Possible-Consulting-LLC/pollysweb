import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

// Execute the real page with deferred external reads. A serialized read stalls
// the page here, revealing waterfalls without depending on wall-clock timing.
function loadHome(dependencies: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL("../app/(app)/home/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports: { default?: () => Promise<unknown> } = {};
  runInNewContext(source, { exports, process: { env: {} }, Date, Intl,
    require: (name: string) => {
      if (name === "react/jsx-runtime") return jsx;
      if (name in dependencies) return dependencies[name];
      if (name.startsWith("@/components/") || name === "next/link") return new Proxy({}, { get: () => () => null });
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports.default!;
}

test("home starts independent data reads before waiting for user defaults", async () => {
  const started: string[] = [];
  let release!: (defaults: object) => void;
  const defaults = new Promise<object>((resolve) => { release = resolve; });
  const read = (name: string, result: unknown) => async (userId: string) => {
    assert.equal(userId, "keeper-a");
    started.push(name);
    return result;
  };
  const home = loadHome({
    "@/lib/session": { requireUser: async () => ({ id: "keeper-a" }) },
    "@/lib/spiders": {
      getUserDefaults: read("defaults", defaults),
      listSpidersForUser: read("spiders", []),
      getRecentActivity: read("activity", []),
    },
    "@/lib/utils": { resolveDisplayTimeZone: async () => "UTC" },
    "@/lib/constellation-data": { reviewItemsFor: () => [], getStreakPreview: read("streak", { streak: {}, completedToday: false }) },
    "@/lib/care-progress-data": { withCareProgress: async () => [] },
    "@/lib/constellation": { calendarDayKey: () => "2026-09-20" },
    "@/lib/spider-write-policy": { getSpiderWriteState: read("writeState", { proAccess: true, firstSpiderId: null }) },
    "@/lib/email-verification": { legacyVerificationDeadline: () => null },
    "@/lib/db": { prisma: {} },
  });
  const rendered = home();
  await new Promise((resolve) => setImmediate(resolve));
  try {
    assert.deepEqual(started.slice().sort(), ["activity", "defaults", "spiders", "writeState"]);
  } finally {
    release({ name: "Keeper", timezone: "UTC" });
    await rendered;
  }
});
