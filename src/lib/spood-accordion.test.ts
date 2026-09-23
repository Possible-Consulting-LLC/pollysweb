import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";

type Element = { type: string; props: Record<string, unknown> & { children?: unknown } };

function elements(node: unknown): Element[] {
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const item = node as Element;
  const children = Array.isArray(item.props.children)
    ? item.props.children
    : [item.props.children];
  return [item, ...children.flatMap(elements)];
}

test("opening a spood closes its sibling while both panels stay mounted", () => {
  const exports: Record<string, unknown> = {};
  const states: unknown[] = [];
  let index = 0;
  const react = {
    useState(initial: unknown) {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (value: unknown) => {
        states[slot] = typeof value === "function"
          ? (value as (current: unknown) => unknown)(states[slot])
          : value;
      }];
    },
  };
  const code = ts.transpileModule(
    readFileSync(new URL("../components/spoods/spood-accordion.tsx", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } },
  ).outputText;
  runInNewContext(code, {
    exports,
    require(name: string) {
      if (name === "react") return react;
      if (name === "react/jsx-runtime") return jsx;
      throw new Error(`Unexpected dependency ${name}`);
    },
  });
  const SpoodAccordion = exports.SpoodAccordion as (props: unknown) => unknown;
  const items = [
    { id: "a", identity: "A", content: "A panel" },
    { id: "b", identity: "B", content: "B panel" },
  ];
  const render = () => {
    index = 0;
    return SpoodAccordion({ items });
  };
  const buttons = (tree: unknown) => elements(tree).filter((item) => item.type === "button");
  const panels = (tree: unknown) => elements(tree).filter((item) => String(item.props.id).startsWith("spood-panel-"));

  let tree = render();
  assert.deepEqual(buttons(tree).map((button) => button.props["aria-expanded"]), [false, false]);
  (buttons(tree)[0].props.onClick as () => void)();
  tree = render();
  assert.deepEqual(buttons(tree).map((button) => button.props["aria-expanded"]), [true, false]);
  (buttons(tree)[1].props.onClick as () => void)();
  tree = render();
  assert.deepEqual(buttons(tree).map((button) => button.props["aria-expanded"]), [false, true]);
  assert.equal(panels(tree).length, 2);
  assert.deepEqual(panels(tree).map((panel) => panel.props.hidden), [true, false]);
});
