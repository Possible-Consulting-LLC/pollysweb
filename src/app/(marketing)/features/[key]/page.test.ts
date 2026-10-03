import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as jsx from "react/jsx-runtime";
import { renderToStaticMarkup } from "react-dom/server";

type FeatureRow = {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  active: boolean;
};

function loadPage(stubs: {
  findUniqueResult?: FeatureRow | null;
  onFindUnique?: (args: unknown) => void;
  onNotFound?: () => void;
  findUniqueThrows?: boolean;
  sessionUser?: { id: string } | null;
  gateState?: string;
  onGate?: (userId: string, key: string) => void;
}) {
  const filePath = new URL("./page.tsx", import.meta.url);
  const source = readFileSync(filePath, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;

  let notFoundCalled = false;
  const exports: {
    default?: (props: { params: Promise<{ key: string }> }) => Promise<unknown>;
    generateMetadata?: (props: { params: Promise<{ key: string }> }) => Promise<unknown>;
    dynamic?: string;
  } = {};

  runInNewContext(output, {
    exports,
    console: { error: () => undefined },
    process: { env: {} },
    require: (name: string) => {
      if (name === "react/jsx-runtime") return jsx;
      if (name === "next/navigation") {
        return {
          notFound: () => {
            notFoundCalled = true;
            if (stubs.onNotFound) stubs.onNotFound();
            const err = new Error("NEXT_NOT_FOUND");
            (err as unknown as { digest: string }).digest = "NEXT_NOT_FOUND";
            throw err;
          },
        };
      }
      if (name === "next/link") {
        return function Link({ href, children, ...props }: { href: string; children: unknown }) {
          return jsx.jsx("a", { href, children, ...props });
        };
      }
      if (name === "@/lib/db") {
        return {
          prisma: {
            feature: {
              findUnique: async (args: unknown) => {
                stubs.onFindUnique?.(args);
                if (stubs.findUniqueThrows) throw new Error("db down");
                return stubs.findUniqueResult ?? null;
              },
            },
          },
        };
      }
      if (name === "@/lib/session") {
        return { getSessionUser: async () => stubs.sessionUser ?? null };
      }
      if (name === "@/lib/features/gate") {
        return {
          resolveUserFeatureGate: async (userId: string, key: string) => {
            stubs.onGate?.(userId, key);
            return stubs.gateState ?? "upsell";
          },
        };
      }
      if (name === "@/lib/brand") {
        return {
          BRAND: {
            name: "Polly's Web",
          },
        };
      }
      if (name === "lucide-react") {
        return new Proxy({}, { get: () => () => null });
      }
      throw new Error(`Unexpected dependency ${name}`);
    },
  });

  return {
    render: async (key: string) => {
      if (!exports.default) throw new Error("page.tsx has no default export");
      const element = await exports.default({ params: Promise.resolve({ key }) });
      return renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);
    },
    metadata: async (key: string) => {
      if (!exports.generateMetadata) throw new Error("page.tsx has no generateMetadata export");
      return exports.generateMetadata({ params: Promise.resolve({ key }) });
    },
    dynamic: exports.dynamic,
    wasNotFoundCalled: () => notFoundCalled,
  };
}

function jsonOf<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

test("force-dynamic route configuration is exported", () => {
  const page = loadPage({});
  assert.equal(page.dynamic, "force-dynamic");
});

test("active feature renders upsell variant with name, description, and pricing CTA", async () => {
  let capturedQuery: unknown = null;
  const feature: FeatureRow = {
    id: "feat-1",
    key: "spood.lineage",
    name: "Breeder Lineage Tracking",
    description: "Track lineages, genetics, and clutches across generations.",
    category: "breeder",
    active: true,
  };

  const page = loadPage({
    findUniqueResult: feature,
    onFindUnique: (args) => {
      capturedQuery = args;
    },
  });

  const html = await page.render("spood.lineage");

  assert.deepEqual(jsonOf(capturedQuery), { where: { key: "spood.lineage" } });
  assert.match(html, /Breeder Lineage Tracking/);
  assert.match(html, /Track lineages, genetics, and clutches across generations\./);
  assert.match(html, /href="\/pricing"/);
  assert.doesNotMatch(html, /Coming soon/i);
});

test("inactive feature renders coming-soon variant with name and coming soon copy", async () => {
  const feature: FeatureRow = {
    id: "feat-2",
    key: "enclosure.sensors",
    name: "Automated Enclosure Monitoring",
    description: "Real-time IoT temperature and humidity probes.",
    category: "hardware",
    active: false,
  };

  const page = loadPage({
    findUniqueResult: feature,
  });

  const html = await page.render("enclosure.sensors");

  assert.match(html, /Automated Enclosure Monitoring/);
  assert.match(html, /Coming soon/i);
  assert.doesNotMatch(html, /href="\/pricing"/);
});

test("unknown feature key invokes notFound()", async () => {
  let notFoundCalled = false;
  const page = loadPage({
    findUniqueResult: null,
    onNotFound: () => {
      notFoundCalled = true;
    },
  });

  await assert.rejects(
    async () => {
      await page.render("nonexistent.feature");
    },
    /NEXT_NOT_FOUND/,
  );
  assert.equal(notFoundCalled, true);
});

test("generateMetadata produces title and description for known feature", async () => {
  const feature: FeatureRow = {
    id: "feat-3",
    key: "care.hydration",
    name: "Hydration Logging",
    description: "Detailed misting and humidity tracking.",
    category: "care",
    active: true,
  };

  const page = loadPage({
    findUniqueResult: feature,
  });

  const metadata = await page.metadata("care.hydration");
  assert.deepEqual(jsonOf(metadata), {
    title: "Hydration Logging | Polly's Web",
    description: "Detailed misting and humidity tracking.",
  });
});

test("generateMetadata returns fallback title for unknown feature", async () => {
  const page = loadPage({
    findUniqueResult: null,
  });

  const metadata = await page.metadata("missing");
  assert.deepEqual(jsonOf(metadata), {
    title: "Feature | Polly's Web",
  });
});

const ACTIVE: FeatureRow = {
  id: "feat-9",
  key: "care.feed.log",
  name: "Log feedings",
  description: "Record feedings.",
  category: "care",
  active: true,
};

test("a database outage renders not-found instead of a 500, and metadata falls back", async () => {
  const page = loadPage({ findUniqueThrows: true });
  await assert.rejects(page.render("care.feed.log"), /NEXT_NOT_FOUND/);
  assert.deepEqual(jsonOf(await page.metadata("care.feed.log")), { title: "Feature | Polly's Web" });
});

test("an entitled signed-in viewer is not sent to pricing", async () => {
  const gates: Array<[string, string]> = [];
  const page = loadPage({
    findUniqueResult: ACTIVE,
    sessionUser: { id: "user-1" },
    gateState: "entitled",
    onGate: (userId, key) => gates.push([userId, key]),
  });
  const html = await page.render("care.feed.log");
  assert.doesNotMatch(html, /See Plans/);
  assert.doesNotMatch(html, /href="\/pricing"/);
  assert.match(html, /Included in your plan/);
  assert.deepEqual(gates, [["user-1", "care.feed.log"]]);
});

test("a signed-in viewer without the feature still sees the pricing CTA", async () => {
  const page = loadPage({ findUniqueResult: ACTIVE, sessionUser: { id: "user-1" }, gateState: "upsell" });
  assert.match(await page.render("care.feed.log"), /href="\/pricing"/);
});

test("signed-out viewers see the pricing CTA without a gate resolution", async () => {
  let resolved = false;
  const page = loadPage({ findUniqueResult: ACTIVE, onGate: () => (resolved = true) });
  assert.match(await page.render("care.feed.log"), /See Plans/);
  assert.equal(resolved, false);
});
