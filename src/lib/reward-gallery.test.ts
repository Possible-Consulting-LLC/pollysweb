import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import * as rewards from "./constellation";

function loadComponent(file: string, dependencies: Record<string, unknown>) {
  const source = ts.transpileModule(readFileSync(new URL(file, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports: Record<string, (props: object) => React.ReactNode> = {};
  runInNewContext(source, { exports, require: (name: string) => {
    if (name === "react/jsx-runtime") return jsx;
    if (name in dependencies) return dependencies[name];
    throw new Error(`Unexpected dependency ${name}`);
  } });
  return exports;
}
const art = loadComponent("../components/constellation/reward-art.tsx", { "lucide-react": icons });
const { RewardGallery } = loadComponent("../components/constellation/reward-gallery.tsx", {
  "next/link": "a", "./reward-art": art, "@/lib/constellation": rewards,
});
const stories = rewards.deriveStoryRewards([], "2026-09-25", "UTC");
const progress = rewards.deriveStoryProgress([], stories, "2026-09-25", "UTC");

test("gallery includes all streak milestones even when none are earned", () => {
  const html = renderToStaticMarkup(RewardGallery({ stories, progress, streak: { current: 0, best: 0, earnedAt: {} } }));
  assert.equal((html.match(/<details/g) ?? []).length, 12);
  for (const reward of rewards.STREAK_REWARDS) assert.ok(html.includes(reward.title));
  assert.ok(html.includes("100 consecutive care days"));
});

test("earned streak badges survive a reset and locked badges show current progress", () => {
  const html = renderToStaticMarkup(RewardGallery({ stories, progress, streak: { current: 2, best: 7, earnedAt: { 1: "2026-09-01", 3: "2026-09-03", 7: "2026-09-07" } } }));
  assert.ok(html.includes("First earned 2026-09-07"));
  assert.ok(html.includes("2 of 14 consecutive care days"));
  assert.ok(html.includes("Not earned yet"));
});

const { RecentCareMeter } = loadComponent("../components/constellation/recent-care-meter.tsx", {
  "@/components/constellation/reward-art": art, "@/lib/constellation": rewards,
});
for (const [daysTogether, label] of [[0, "0 days on Spoodly Space"], [1, "1 day on Spoodly Space"], [10, "10 days on Spoodly Space"]] as const) {
  test(`care meter shows account age separately from streak: ${daysTogether}`, () => {
    const html = renderToStaticMarkup(RecentCareMeter({
      todayKey: "2026-09-25", completedDayKeys: [], daysTogether,
      streak: { current: 0, best: 0, earnedAt: {} },
    }));
    assert.ok(html.includes(label));
    assert.ok(html.includes("0-day streak"));
  });
}
