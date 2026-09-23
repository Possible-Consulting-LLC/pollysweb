import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

type Element = { type: string; props: Record<string, unknown> & { children?: unknown } };

function elements(node: unknown): Element[] {
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const item = node as Element;
  const children = Array.isArray(item.props.children) ? item.props.children : [item.props.children];
  return [item, ...children.flatMap(elements)];
}

function textContent(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (!node || typeof node !== "object" || !("props" in node)) return "";
  const children = (node as Element).props.children;
  return (Array.isArray(children) ? children : [children]).map(textContent).join("");
}

function load<T>(relativePath: string, dependencies: Record<string, unknown>): T {
  const exports = {};
  const code = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(code, {
    exports,
    require(name: string) {
      if (name === "react/jsx-runtime") return jsx;
      if (name in dependencies) return dependencies[name];
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  return exports as T;
}

test("care status renders food, water, and latest behavior values", () => {
  const component = load<typeof import("../components/spoods/care-status-grid")>(
    "../components/spoods/care-status-grid.tsx",
    { "@/lib/utils": { formatRelativeDays: (days: number | null) => days === null ? "never" : `${days} days ago` } },
  );
  const tree = component.CareStatusGrid({ daysSinceFeed: 2, daysSinceMist: null, latestBehavior: "Calm" });
  const text = textContent(tree);
  for (const value of ["Food", "2 days ago", "Water", "never", "Behavior", "Calm"]) {
    assert.ok(text.includes(value), value);
  }
});

test("maintenance fields derive every control id from the caller prefix", () => {
  const component = load<typeof import("../components/spoods/maintenance-fields")>(
    "../components/spoods/maintenance-fields.tsx",
    {
      "@/components/ui/field": { Field: "label", Select: "select", Textarea: "textarea" },
      "@/components/ui/datetime-field": { DateTimeField: "datetime" },
    },
  );
  const tree = component.MaintenanceFields({ idPrefix: "quick-maint-star" });
  const rendered = elements(tree);
  assert.equal(rendered.find((item) => item.type === "select")?.props.id, "quick-maint-star-kind");
  assert.equal(rendered.find((item) => item.type === "datetime")?.props.id, "quick-maint-star-date");
  assert.equal(rendered.find((item) => item.type === "textarea")?.props.id, "quick-maint-star-notes");
});
