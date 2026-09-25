import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";
import * as icons from "lucide-react";
import { format } from "date-fns";
import { cn } from "./utils";

const source = ts.transpileModule(readFileSync(new URL("../components/spoods/photo-gallery.tsx", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const dependencies: Record<string, unknown> = {
  react: React, "react/jsx-runtime": jsx, "lucide-react": icons, "date-fns": { format },
  "next/navigation": { useRouter: () => ({ refresh() {} }) },
  "@/components/mutation-context": { useMutationContext: () => ({}) },
  "@/app/actions/care": {}, "@/lib/utils": { cn },
  "@/components/ui/button": { Button: "button" },
  "@/components/ui/modal-dialog": { ModalDialog: ({ children }: { children: React.ReactNode }) => jsx.jsx("section", { children }) },
  "@/components/spoods/spood-image": { SpoodImage: ({ src, alt }: {src: string; alt: string}) => jsx.jsx("img", {src, alt}) },
};
const exports: Record<string, React.ComponentType<Record<string, unknown>>> = {};
runInNewContext(source, { exports, document: {}, require: (name: string) => {
  if (!(name in dependencies)) throw new Error(`Unexpected dependency ${name}`);
  return dependencies[name];
} });
const photos = Array.from({length: 5}, (_, i) => ({ id: String(i), url: `/photo-${i}.jpg`, caption: `Moment ${i}` }));

test("profile gallery previews three photos and offers access to the whole gallery", () => {
  const html = renderToStaticMarkup(React.createElement(exports.PhotoGallery, { photos, allowManage: false }));
  assert.equal((html.match(/aria-label="Open photo/g) ?? []).length, 3);
  assert.match(html, /Shooting Stars/);
  assert.match(html, /View all/);
});

test("lightbox exposes every thumbnail and identifies the selected photo", () => {
  const html = renderToStaticMarkup(React.createElement(exports.PhotoLightbox, { photos, index: 3, onClose() {}, onChangeIndex() {} }));
  assert.equal((html.match(/aria-label="Show photo/g) ?? []).length, 5);
  assert.equal((html.match(/aria-current="true"/g) ?? []).length, 1);
  assert.match(html, /aria-label="Show photo 4: Moment 3"[^>]*aria-current="true"/);
});
