import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import * as utils from "./utils";

async function storyPage(profilePhoto: string) {
  const source = ts.transpileModule(readFileSync(new URL("../app/(app)/spoods/[id]/story/page.tsx", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsx,
    "next/link": "a",
    "next/navigation": { notFound: () => { throw new Error("Not found"); } },
    "@/lib/session": { requireUser: async () => ({ id: "keeper" }) },
    "@/lib/features/gate": { resolveUserGates: async (_userId: string, keys: string[]) => Object.fromEntries(keys.map(key => [key, "entitled"])) },
    "@/components/features/feature-gate": { FeatureGate: "feature-gate" },
    "@/lib/constants": { observationLabel: (kind: string) => kind },
    "@/lib/utils": { ...utils, resolveDisplayTimeZone: async () => "UTC" },
    "@/lib/spider-write-policy": { getSpiderWriteState: async () => ({ proAccess: true }) },
    "@/lib/spiders": {
      getUserDefaults: async () => ({ timezone: "UTC" }),
      getSpiderStory: async () => ({ includeAcquisition: true, nextCursor: null, spider: {
        id: "star", name: "Star", profilePhoto, acquisitionDate: new Date("2026-08-01T00:00Z"), source: null,
        molts: [], observations: [], feedings: [], mistings: [], bodyConditions: [], enclosure: null,
        photos: [{ id: "first-photo", url: "/first.jpg", caption: "First portrait", takenAt: new Date("2026-08-03T12:00Z") },
          { id: "current-photo", url: "/current.jpg", caption: "New portrait", takenAt: new Date("2026-09-20T12:00Z") }],
      } }),
    },
    "@/components/ui/button": { buttonVariants: () => "" },
    "@/components/ui/card": { Card: "card" },
    "@/components/spoods/spood-image": { SpoodImage: "portrait" },
    "@/components/spoods/photo-gallery": { PhotoOpenButton: "photo-opener" },
    "@/components/activity/activity-editor": { ActivityEditorRow: "event-editor" },
  };
  const exports: { default?: (args: object) => Promise<unknown> } = {};
  runInNewContext(source, { exports, Date, require: (name: string) => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
    return dependencies[name];
  } });
  return exports.default!({ params: Promise.resolve({ id: "star" }), searchParams: Promise.resolve({}) });
}

type Element = { type: string; props: { children?: unknown; item?: { id: string; fields: { date: string } }; photos?: { id: string }[] } }; // React tree inspected without mounting client editors.
function elements(tree: unknown): Element[] {
  if (Array.isArray(tree)) return tree.flatMap(elements);
  if (!tree || typeof tree !== "object" || !("props" in tree)) return [];
  const element = tree as Element;
  return [element, ...elements(element.props.children)];
}

test("changing the profile portrait never moves or suppresses dated photo entries", async () => {
  for (const portrait of ["/current.jpg", "/first.jpg"]) {
    const nodes = elements(await storyPage(portrait));
    const photoEvents = nodes.filter(node => node.type === "event-editor").map(node => node.props.item!);
    assert.deepEqual(photoEvents.map(item => [item.id, item.fields.date]), [
      ["first-photo", "2026-08-03T12:00"], ["current-photo", "2026-09-20T12:00"],
    ]);
    const gallery = nodes.find(node => node.type === "photo-opener")!.props.photos!;
    assert.equal(gallery.length, 2);
    assert.ok(gallery.every((photo: { id: string }) => photo.id !== "acquired-acquired"));
  }
});
