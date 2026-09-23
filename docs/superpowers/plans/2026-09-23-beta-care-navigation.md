# Beta Care Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply the approved beta feedback by clarifying Home care cards and navigation, adding compact My Spoods disclosures, shortening full profiles, and turning Badges into a compact shared Care Journey.

**Architecture:** Keep all existing server actions, write policies, care-day rules, and reward eligibility logic. Build reusable server-rendered care-card sections, use native semantic disclosures so forms stay mounted, add one shared quick-log maintenance field component, and extend the existing reward read model with display-only progress. No schema change or migration is expected.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Prisma 6, Lucide React and Lucide Lab, Node test runner through `tsx --test`.

**Spec:** `docs/superpowers/specs/2026-09-23-beta-care-navigation-design.md`

## Global Constraints

- Work only in `/Users/rebeccapossible/web/spoodly-space/.worktrees/staging` on `codex/staging-setup`.
- Never access the production database, storage project, Vercel project, domain configuration, or production environment variables.
- Do not run `npm run db:seed`, `npm run db:reset`, `prisma migrate reset`, or any other seed/reset command.
- Do not add or apply a database migration; stop and amend the approved design if implementation reveals a schema requirement.
- Keep `/constellation` as the internal route while changing user-facing language to **Journey** and **Your Care Journey**.
- A shared care day still requires qualifying care for every writable active spood; Play remains optional.
- Reuse `logEnclosureMaintenance`; do not create a second housekeeping event or write path.
- Keep all authentication, entitlement, read-only-spood, maintenance-mode, future-date, mutation-context, rate-limit, and reward-revalidation guards intact.
- Preserve unsaved mounted form state when a disclosure closes.
- Support a 320 CSS-pixel viewport, keyboard use, screen readers, visible focus, reduced motion, and both existing themes.
- Do not push, deploy, or touch `main`. Pause for the owner’s explicit approval at every commit checkpoint and before any staging deployment.

## Review Focus

1. **Zero, one, many, memorialized, and read-only spoods:** compact cards must remain truthful, and read-only or memorialized cards must never expose writable quick actions. Task 4 pins these states in UI contracts.
2. **Long names and translated-length copy at 320 pixels:** status pills, six action labels, and navigation labels must wrap without clipping or horizontal scrolling. Tasks 2, 3, and 7 include narrow-browser checks.
3. **Dirty forms inside disclosures:** closing a profile section or opening another collection card must not unmount and erase typed values. Task 4 keeps controlled accordion panels mounted, Task 5 uses mounted native `<details>` content, and Task 7 checks both in a browser.
4. **Housekeeping without an enclosure:** the panel must explain how to add enclosure details and must not falsely report a saved maintenance event. Task 2 tests and verifies this state.
5. **Historical/future reward evidence:** Journey progress must use current server eligibility, exclude future events, and update after edits or deletions. Task 6 extends the existing pure reward tests rather than adding client-only counters.

---

### Task 1: Journey navigation language and active state

**Files:**
- Create: `src/lib/app-navigation.ts`
- Create: `src/lib/app-navigation.test.ts`
- Modify: `src/components/layout/nav.tsx:3-70`
- Modify: `src/components/landing/app-preview.tsx:1-55`
- Modify: `src/app/actions/activity.ts:315-330`
- Modify: `src/lib/ui-contracts.test.ts`

**Interfaces:**
- Produces: `isAppNavActive(pathname: string, href: string): boolean` for `BottomNav`.
- Produces: the user-facing navigation label `Journey` for `/constellation`.
- Consumes: no new project interface.

- [ ] **Step 1: Write failing route-state tests**

Create `src/lib/app-navigation.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { isAppNavActive } from "./app-navigation";

test("only the matching primary destination is active", () => {
  assert.equal(isAppNavActive("/home", "/home"), true);
  assert.equal(isAppNavActive("/home", "/constellation"), false);
  assert.equal(isAppNavActive("/constellation", "/constellation"), true);
  assert.equal(isAppNavActive("/settings", "/constellation"), false);
});

test("spood profiles belong to My Spoods without activating unrelated links", () => {
  assert.equal(isAppNavActive("/spoods/spider-a", "/spoods"), true);
  assert.equal(isAppNavActive("/spoods/spider-a/story", "/spoods"), true);
  assert.equal(isAppNavActive("/spoods-extra", "/spoods"), false);
});
```

Add a source contract to `src/lib/ui-contracts.test.ts` that asserts `nav.tsx` and the landing preview contain the label `Journey`, the preview accessibility label names the Journey tab, the activity recovery message says `Reload Journey to refresh your rewards`, and `nav.tsx` has no badge-specific unconditional background branch.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
npx tsx --test src/lib/app-navigation.test.ts src/lib/ui-contracts.test.ts
```

Expected: FAIL because `app-navigation.ts` does not exist and the current label is `Badges`.

- [ ] **Step 3: Implement the route matcher and neutral inactive Journey icon**

Create `src/lib/app-navigation.ts`:

```ts
export function isAppNavActive(pathname: string, href: string): boolean {
  if (href === "/spoods") {
    return pathname === href || pathname.startsWith("/spoods/");
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
```

In `src/components/layout/nav.tsx`, import `isAppNavActive`, change the link label to `Journey`, remove `isBadge`, and give every active icon the same selected container:

```tsx
const active = isAppNavActive(pathname, href);

<span
  className={cn(
    "flex h-9 w-9 items-center justify-center rounded-2xl transition",
    active
      ? "bg-[var(--lavender)]/70 text-[var(--plum)]"
      : "text-[var(--midnight)]/45",
  )}
>
  <Icon className="h-5 w-5" aria-hidden />
</span>
```

Change the illustrative landing navigation label and accessibility description from Badges to Journey. Change only the user-facing recovery sentence in `src/app/actions/activity.ts`; keep the internal badge/reward terminology and `/constellation` revalidation path intact.

- [ ] **Step 4: Run route, contract, type, and lint checks**

Run:

```bash
npx tsx --test src/lib/app-navigation.test.ts src/lib/ui-contracts.test.ts
npx tsc --noEmit
npm run lint -- src/components/layout/nav.tsx src/components/landing/app-preview.tsx src/app/actions/activity.ts src/lib/app-navigation.ts src/lib/app-navigation.test.ts
```

Expected: all commands pass with no new warnings.

- [ ] **Step 5: Pause for commit approval**

After explicit owner approval:

```bash
git add src/lib/app-navigation.ts src/lib/app-navigation.test.ts src/components/layout/nav.tsx src/components/landing/app-preview.tsx src/app/actions/activity.ts src/lib/ui-contracts.test.ts
git commit -m "fix: clarify journey navigation state"
```

### Task 2: Shared care status and six quick actions

**Files:**
- Create: `src/components/spoods/care-status-grid.tsx`
- Create: `src/components/spoods/maintenance-fields.tsx`
- Modify: `src/lib/spiders.ts:43-93`
- Modify: `src/components/spoods/quick-log.tsx:8-420`
- Modify: `src/components/spoods/profile-forms.tsx:250-300`
- Modify: `src/lib/ui-contracts.test.ts`
- Modify: `src/lib/mutation-action-recovery.test.ts:38-110`

**Interfaces:**
- Produces: `CareStatusGrid({ daysSinceFeed, daysSinceMist, latestBehavior })`.
- Produces: `MaintenanceFields({ idPrefix })`, containing `kind`, `date`, and `notes` fields but no `<form>`.
- Extends: `SpiderCareView.latestBehavior: string | null`.
- Extends: `QuickLogButtons` with `hasEnclosure?: boolean` and panel value `"housekeeping"`.
- Consumes: existing `logEnclosureMaintenance(spiderId, formData)` and `ActionResult`.

- [ ] **Step 1: Write failing care-status and quick-action contracts**

Add to `src/lib/ui-contracts.test.ts`:

```ts
test("care cards expose the three routine statuses and six labeled actions", () => {
  const status = source("components/spoods/care-status-grid.tsx");
  assert.match(status, />Food</);
  assert.match(status, />Water</);
  assert.match(status, />Behavior</);

  const quickLog = source("components/spoods/quick-log.tsx");
  for (const label of ["Feed", "Hydrate", "Observe", "Molt", "Play", "Housekeeping"]) {
    assert.match(quickLog, new RegExp(`>${label}<`));
  }
  assert.match(quickLog, /logEnclosureMaintenance/);
  assert.match(quickLog, /MaintenanceFields/);
});

test("maintenance fields use a caller-provided id prefix", () => {
  const fields = source("components/spoods/maintenance-fields.tsx");
  assert.match(fields, /idPrefix/);
  assert.match(fields, /`\$\{idPrefix\}-kind`/);
  assert.match(fields, /defaultValue="cleaning"/);
});
```

Extend the `QuickLogButtons` VM fixture dependencies in `src/lib/mutation-action-recovery.test.ts` for `lucide-react`, `next/link`, `@/components/spoods/maintenance-fields`, and `logEnclosureMaintenance`. Add a test that opens Housekeeping with `hasEnclosure: false`, finds the “Add enclosure details first” message, and verifies no maintenance action runs.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts src/lib/mutation-action-recovery.test.ts
```

Expected: FAIL because the shared status/maintenance components and sixth action do not exist.

- [ ] **Step 3: Add shared status and maintenance fields**

Create `src/components/spoods/care-status-grid.tsx` with this public shape:

```tsx
import { formatRelativeDays } from "@/lib/utils";

export function CareStatusGrid(props: {
  daysSinceFeed: number | null;
  daysSinceMist: number | null;
  latestBehavior: string | null;
}) {
  const items = [
    ["Food", formatRelativeDays(props.daysSinceFeed)],
    ["Water", formatRelativeDays(props.daysSinceMist)],
    ["Behavior", props.latestBehavior || "No recent note"],
  ] as const;
  return (
    <dl className="grid gap-2 text-xs text-[var(--midnight)]/70 sm:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 rounded-2xl bg-[var(--cream-deep)]/60 px-3 py-2">
          <dt>{label}</dt>
          <dd className="truncate font-semibold text-[var(--midnight)]">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
```

Create `src/components/spoods/maintenance-fields.tsx` using the current three fields from `MaintenanceForm`, with every `id` derived from `idPrefix` and the current options `Cleaning`, `Rehouse`, and `Maintenance`.

- [ ] **Step 4: Expose the latest non-play behavior in the care view**

In `buildCareView`, derive the first non-play observation and add it to the returned view:

```ts
const latestBehaviorEvent = spider.observations.find(
  (event) => event.kind !== "play and interaction",
);

latestBehavior: latestBehaviorEvent
  ? observationLabel(latestBehaviorEvent.kind)
  : null,
```

Update `SpiderCareView` with `latestBehavior: string | null`. This uses the already-bounded observation relation and adds no query.

- [ ] **Step 5: Add icon-backed actions and Housekeeping to QuickLogButtons**

Import the existing action, shared fields, Link, and Lucide icons. Change the panel union to:

```ts
type QuickLogPanel =
  | "feed"
  | "hydrate"
  | "molt"
  | "note"
  | "play"
  | "housekeeping";
```

Render six labeled buttons in a two-column grid that becomes three columns when space permits. Each button must have `aria-expanded`, `aria-controls`, an `id` based on `spiderId`, an icon with `aria-hidden`, and the exact visible labels from the test.

When Housekeeping is open and `hasEnclosure` is false, render:

```tsx
<p className="rounded-2xl bg-amber-50 px-3 py-2 text-sm text-amber-950">
  Add enclosure details from <Link href={`/spoods/${spiderId}`}>the full profile</Link> before logging housekeeping.
</p>
```

When it is true, submit `MaintenanceFields` through the existing `run` helper:

```tsx
<form
  id={`housekeeping-panel-${spiderId}`}
  onSubmit={(event) => {
    event.preventDefault();
    void run(() => logEnclosureMaintenance(spiderId, new FormData(event.currentTarget)));
  }}
>
  <MutationContextInput />
  <MaintenanceFields idPrefix={`quick-maint-${spiderId}`} />
  <Button type="submit" disabled={saving} className="w-full">
    {saving ? "Saving…" : "Save housekeeping"}
  </Button>
</form>
```

Keep failed forms open, preserve the current success/error announcements, and keep successful saves routed through `celebrateCare` and `router.refresh()`.

- [ ] **Step 6: Reuse MaintenanceFields on the full profile**

Replace duplicated fields inside `MaintenanceForm` with:

```tsx
<MaintenanceFields idPrefix={`profile-maint-${spiderId}`} />
```

Keep `MaintenanceForm`’s existing action, feedback, success celebration, and pending button behavior unchanged.

- [ ] **Step 7: Run focused checks**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts src/lib/mutation-action-recovery.test.ts
npx tsc --noEmit
npm run lint -- src/components/spoods/quick-log.tsx src/components/spoods/care-status-grid.tsx src/components/spoods/maintenance-fields.tsx src/components/spoods/profile-forms.tsx src/lib/spiders.ts
```

Expected: all commands pass; the context-change test still proves that rejected saves keep the active form and never celebrate or refresh.

- [ ] **Step 8: Pause for commit approval**

After explicit owner approval:

```bash
git add src/components/spoods/care-status-grid.tsx src/components/spoods/maintenance-fields.tsx src/components/spoods/quick-log.tsx src/components/spoods/profile-forms.tsx src/lib/spiders.ts src/lib/ui-contracts.test.ts src/lib/mutation-action-recovery.test.ts
git commit -m "feat: structure care status and quick actions"
```

### Task 3: Structured Home cards and prominent Journey/Add actions

**Files:**
- Modify: `src/components/spoods/spood-card.tsx`
- Modify: `src/components/constellation/streak-card.tsx`
- Modify: `src/app/(app)/home/page.tsx`
- Modify: `src/lib/ui-contracts.test.ts`
- Modify: `src/lib/page-loading.test.ts`

**Interfaces:**
- Produces: `SpoodIdentity`, `SpoodCareDetails`, and `SpoodCareCard` from `spood-card.tsx`.
- Consumes: `CareStatusGrid`, `QuickLogButtons(hasEnclosure)`, `SpiderCareView`, and the existing write-state result.
- Preserves: Home’s parallel data-read behavior verified by `page-loading.test.ts`.

- [ ] **Step 1: Write failing Home structure contracts**

Add a test to `src/lib/ui-contracts.test.ts` that reads the Home page, `spood-card.tsx`, and `streak-card.tsx`, then asserts:

```ts
assert.match(home, /Add spood/);
assert.match(streak, /Your care journey/);
assert.match(streak, /View journey/);
assert.match(card, /Care status/);
assert.match(card, /Log care/);
assert.match(card, /CareStatusGrid/);
assert.doesNotMatch(card, />Last molt</);
```

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts src/lib/page-loading.test.ts
```

Expected: FAIL on the new copy and structure assertions while the data-read test remains green.

- [ ] **Step 3: Split the card into reusable identity and detail regions**

In `spood-card.tsx`, keep server rendering and export:

```ts
export function SpoodIdentity(props: {
  view: SpiderCareView;
  linkName?: boolean;
  readOnly?: boolean;
}): React.ReactNode;

export function SpoodCareDetails(props: {
  view: SpiderCareView;
  readOnly?: boolean;
  showProfileLink?: boolean;
}): React.ReactNode;
```

`SpoodIdentity` renders the image, identity metadata, phase/status pills, due hydration pill, and read-only explanation. Put phase pills below the sex/species/life-stage line with their own `mt-2` container.

`SpoodCareDetails` renders headings **Care status** and **Log care**, uses `CareStatusGrid`, passes `Boolean(view.spider.enclosure)` to `QuickLogButtons`, and renders **View full profile** only when requested. Memorialized cards return identity/story content without care actions.

Keep `SpoodCareCard` as the Home wrapper that composes both exports inside `Card`.

- [ ] **Step 4: Clarify the Home Journey teaser and Add action**

Update compact `StreakCard` copy to **Your care journey**, retain the shared streak count and all-spoods progress, and add visible **View journey** text beside the arrow.

Move the Home Add action into a prominent gold button adjacent to or immediately below the page header:

```tsx
<Link
  href="/spoods/new"
  className={buttonVariants({ variant: "gold", size: "sm" })}
>
  Add spood
</Link>
```

Remove the subtle Add action from the Needs Attention `SectionHeader`. Do not change the Home data promises or care-progress computation.

- [ ] **Step 5: Run focused checks**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts src/lib/page-loading.test.ts
npx tsc --noEmit
npm run lint -- src/components/spoods/spood-card.tsx src/components/constellation/streak-card.tsx 'src/app/(app)/home/page.tsx'
```

Expected: all commands pass and the page-loading test confirms no new server waterfall.

- [ ] **Step 6: Pause for commit approval**

After explicit owner approval:

```bash
git add src/components/spoods/spood-card.tsx src/components/constellation/streak-card.tsx 'src/app/(app)/home/page.tsx' src/lib/ui-contracts.test.ts src/lib/page-loading.test.ts
git commit -m "feat: simplify home care cards"
```

### Task 4: Compact one-open-at-a-time My Spoods list

**Files:**
- Create: `src/components/spoods/spood-accordion.tsx`
- Create: `src/lib/spood-accordion.test.ts`
- Modify: `src/app/(app)/spoods/page.tsx`
- Modify: `src/lib/ui-contracts.test.ts`

**Interfaces:**
- Produces: `SpoodAccordion({ items })`, where each item contains `{ id, identity, content }` React nodes and controlled one-open-at-a-time state.
- Consumes: `SpoodIdentity` and `SpoodCareDetails` from Task 3.
- Preserves: filters, counts, empty states, memorial ordering, and read-only plan restrictions.

- [ ] **Step 1: Write failing semantic accordion contracts**

Add to `src/lib/ui-contracts.test.ts`:

```ts
test("My Spoods uses a controlled semantic accordion", () => {
  const accordion = source("components/spoods/spood-accordion.tsx");
  assert.match(accordion, /aria-expanded=\{open\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  assert.match(accordion, /hidden=\{!open\}/);

  const page = source("app/(app)/spoods/page.tsx");
  assert.match(page, /SpoodAccordion/);
  assert.match(page, /showProfileLink/);
  assert.doesNotMatch(page, /<SpoodCareCard/);
});
```

- [ ] **Step 2: Run the focused contract and confirm failure**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts
```

Expected: FAIL because the accordion component and behavior test do not exist.

- [ ] **Step 3: Write the failing one-open-at-a-time behavior test**

Create `src/lib/spood-accordion.test.ts`:

```ts
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
```

- [ ] **Step 4: Implement a mounted controlled disclosure list**

Create `spood-accordion.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";

export type SpoodAccordionItem = {
  id: string;
  identity: ReactNode;
  content: ReactNode;
};

export function SpoodAccordion({ items }: { items: SpoodAccordionItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-3">
      {items.map((item) => {
        const open = openId === item.id;
        const headerId = `spood-summary-${item.id}`;
        const panelId = `spood-panel-${item.id}`;
        return (
          <section key={item.id} className="rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] shadow-[0_8px_30px_var(--shadow)]">
            <button
              id={headerId}
              type="button"
              aria-expanded={open}
              aria-controls={panelId}
              onClick={() => setOpenId(open ? null : item.id)}
              className="min-h-11 w-full rounded-3xl p-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plum)]"
            >
              {item.identity}
            </button>
            <div id={panelId} aria-labelledby={headerId} hidden={!open} className="border-t border-[var(--plum)]/10 p-4">
              {item.content}
            </div>
          </section>
        );
      })}
    </div>
  );
}
```

The `hidden` attribute removes closed content from layout and accessibility traversal while keeping its form DOM mounted, so typed values survive collapsing.

- [ ] **Step 5: Compose compact rows on the page**

Replace the full-card map in `spoods/page.tsx` with `SpoodAccordion`. Build each item using `SpoodIdentity({ linkName: false })` in the summary and `SpoodCareDetails({ showProfileLink: true })` in the panel. Pass the existing read-only calculation to both regions. Keep filtered results, counts, and empty-state branches unchanged.

- [ ] **Step 6: Run focused checks**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts src/lib/spood-accordion.test.ts
npx tsc --noEmit
npm run lint -- src/components/spoods/spood-accordion.tsx 'src/app/(app)/spoods/page.tsx'
```

Expected: all commands pass.

- [ ] **Step 7: Pause for commit approval**

After explicit owner approval:

```bash
git add src/components/spoods/spood-accordion.tsx 'src/app/(app)/spoods/page.tsx' src/lib/spood-accordion.test.ts src/lib/ui-contracts.test.ts
git commit -m "feat: condense the spood collection"
```

### Task 5: Collapsible full-profile sections and two-column About

**Files:**
- Create: `src/components/ui/disclosure-card.tsx`
- Modify: `src/components/ui/card.tsx`
- Modify: `src/components/spoods/about-form.tsx`
- Modify: `src/app/(app)/spoods/[id]/page.tsx`
- Modify: `src/lib/ui-contracts.test.ts`

**Interfaces:**
- Produces: `cardClassName` from `card.tsx` for consistent surfaces.
- Produces: `DisclosureCard({ title, subtitle, defaultOpen, children })` implemented with native `<details>`.
- Consumes: existing profile forms as mounted children.

- [ ] **Step 1: Write failing disclosure contracts**

Add to `src/lib/ui-contracts.test.ts`:

```ts
test("profile details are mounted in accessible disclosures", () => {
  const disclosure = source("components/ui/disclosure-card.tsx");
  assert.match(disclosure, /<details/);
  assert.match(disclosure, /<summary/);
  assert.doesNotMatch(disclosure, /useState/);

  const profile = source("app/(app)/spoods/[id]/page.tsx");
  for (const title of ["Molt phase", "About", "Body condition observation", "Enclosure", "Photos", "Memorial"]) {
    assert.match(profile, new RegExp(`title="${title}"`));
  }
  assert.match(profile, /<Card className="space-y-3">\s*<SectionHeader title="Current care"/);
});

test("About read view supports two columns without splitting notes", () => {
  const about = source("components/spoods/about-form.tsx");
  assert.match(about, /sm:grid-cols-2/);
  assert.match(about, /sm:col-span-2/);
});
```

- [ ] **Step 2: Run the focused contract and confirm failure**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts
```

Expected: FAIL because `DisclosureCard` does not exist and About’s read view is still a vertical stack.

- [ ] **Step 3: Share Card styling and add DisclosureCard**

Export the existing Card surface string from `card.tsx`:

```ts
export const cardClassName =
  "rounded-3xl border border-[var(--plum)]/15 bg-[var(--card)] p-4 shadow-[0_8px_30px_var(--shadow)] backdrop-blur-sm";
```

Create `disclosure-card.tsx` with native `<details open={defaultOpen}>`. Its `<summary>` contains the display-font heading, optional subtitle, and a decorative `ChevronDown` that rotates through `group-open:rotate-180`. Render children in a border-top content wrapper. Do not conditionally render children and do not add React state.

- [ ] **Step 4: Convert the detailed profile sections**

Keep the active spood’s Current care Card always visible. Convert Molt phase, About, Body condition observation, Enclosure, Photos, and Memorial to `DisclosureCard` with `defaultOpen={false}`. For a memorialized spood, keep its primary Memorial summary Card visible because it replaces Current care; keep About and Photos collapsed.

Do not move or rewrite existing forms, authorization branches, photo permissions, read-only messages, Story link, or profile header.

- [ ] **Step 5: Convert About’s read view to a responsive definition grid**

Use:

```tsx
<dl className="grid gap-x-5 gap-y-3 text-sm sm:grid-cols-2">
```

Wrap each label/value in a `<div>`. Put notes in `<div className="sm:col-span-2">`. Keep the Edit about button and feedback full width below the grid. Leave edit-field order and server action unchanged.

- [ ] **Step 6: Run focused checks**

Run:

```bash
npx tsx --test src/lib/ui-contracts.test.ts
npx tsc --noEmit
npm run lint -- src/components/ui/card.tsx src/components/ui/disclosure-card.tsx src/components/spoods/about-form.tsx 'src/app/(app)/spoods/[id]/page.tsx'
```

Expected: all commands pass.

- [ ] **Step 7: Pause for commit approval**

After explicit owner approval:

```bash
git add src/components/ui/card.tsx src/components/ui/disclosure-card.tsx src/components/spoods/about-form.tsx 'src/app/(app)/spoods/[id]/page.tsx' src/lib/ui-contracts.test.ts
git commit -m "feat: shorten full spood profiles"
```

### Task 6: Compact Journey meter, badge grid, and truthful progress

**Files:**
- Create: `src/components/constellation/recent-care-meter.tsx`
- Modify: `src/lib/constellation.ts`
- Modify: `src/lib/constellation.test.ts`
- Modify: `src/lib/reward-data.ts`
- Modify: `src/lib/constellation-data.ts`
- Modify: `src/components/constellation/reward-art.tsx`
- Modify: `src/components/constellation/reward-gallery.tsx`
- Modify: `src/app/(app)/constellation/page.tsx`
- Modify: `src/lib/ui-contracts.test.ts`

**Interfaces:**
- Produces: `StoryRewardProgress`, a record keyed by `STORY_REWARDS[number]["id"]` with a display-safe `label`.
- Produces: `deriveStoryProgress(spiders, stories, todayKey, timeZone, now?)`.
- Extends: `readRewardState` and `getConstellationData` with `storyProgress`.
- Produces: `RecentCareMeter({ todayKey, completedDayKeys, streak })`.
- Changes: `RewardGallery({ stories, progress })`; it no longer receives `streak` or renders Care Rhythm.

- [ ] **Step 1: Write failing pure reward-progress tests**

Add to `src/lib/constellation.test.ts`:

```ts
test("story progress stays truthful for locked and earned event badges", () => {
  const spiders: StorySpider[] = [{
    id: "star", name: "Star", createdAt: new Date("2026-09-01T12:00:00Z"), acquisitionDate: null,
    photos: [], observations: [], molts: [], rehousings: [],
  }];
  const stories = deriveStoryRewards(spiders, "2026-09-16", "UTC");
  const progress = deriveStoryProgress(spiders, stories, "2026-09-16", "UTC");
  assert.equal(progress.firstPortrait.label, "0 of 1 qualifying moments");

  spiders[0].photos.push({ date: new Date("2026-09-10T12:00:00Z") });
  const earned = deriveStoryRewards(spiders, "2026-09-16", "UTC");
  assert.equal(deriveStoryProgress(spiders, earned, "2026-09-16", "UTC").firstPortrait.label, "1 spood earned this");
});

test("locked anniversary progress reports elapsed keeper days without awarding early", () => {
  const spiders: StorySpider[] = [{
    id: "star", name: "Star", createdAt: new Date("2026-09-01T12:00:00Z"), acquisitionDate: null,
    photos: [], observations: [], molts: [], rehousings: [],
  }];
  const stories = deriveStoryRewards(spiders, "2026-09-16", "UTC");
  const progress = deriveStoryProgress(spiders, stories, "2026-09-16", "UTC");
  assert.equal(progress.spoodiversary.label, "15 days together");
  assert.equal(stories.spoodiversary.length, 0);
});
```

Import `deriveStoryProgress` and `type StorySpider` in the existing test file.

- [ ] **Step 2: Write failing Journey UI contracts**

Add to `src/lib/ui-contracts.test.ts`:

```ts
test("Journey has one streak meter and a compact visible-requirement reward grid", () => {
  const page = source("app/(app)/constellation/page.tsx");
  const gallery = source("components/constellation/reward-gallery.tsx");
  assert.match(page, /Your Care Journey/);
  assert.match(page, /RecentCareMeter/);
  assert.doesNotMatch(page, /<StreakCard/);
  assert.doesNotMatch(gallery, /Care rhythm/);
  assert.match(gallery, /grid-cols-3/);
  assert.match(gallery, /progress\[reward\.id\]\.label/);
  assert.match(gallery, /Physical interaction is optional/);
});
```

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
npx tsx --test src/lib/constellation.test.ts src/lib/ui-contracts.test.ts
```

Expected: FAIL because progress and the new Journey components do not exist.

- [ ] **Step 4: Implement pure story progress and expose it from the read model**

Export `StoryRewardId` from the `STORY_REWARDS` tuple and define:

```ts
export type StoryRewardProgress = Record<StoryRewardId, { label: string }>;
```

`deriveStoryProgress` must:

- return `${count} spood earned this` or `${count} spoods earned this` when the current eligibility array is non-empty;
- return `0 of 1 qualifying moments` for locked photo, observation, hammock, molt, and rehouse badges;
- return the maximum elapsed calendar days from acquisition/creation through `todayKey` for a locked Spoodiversary;
- use the same date-only acquisition fallback and future-date exclusions as `deriveStoryRewards`;
- never read celebration-ledger history.

Call it once in `readRewardState` from the already loaded `storySpiders` and derived `stories`, then pass `storyProgress` through `getConstellationData`.

- [ ] **Step 5: Build the recent-care meter**

Move `recentDays` out of the page into `recent-care-meter.tsx`. Render the seven existing day markers, a visible `${streak.current}-day streak` heading, and matching `Art` for the greatest earned streak threshold at or below the current streak. When current is zero, use the one-day First Spark art in its locked treatment. Do not render “Best”.

- [ ] **Step 6: Compact the reward gallery and expose every requirement**

Remove the Care Rhythm section and `STREAK_REWARDS` loop from `RewardGallery`. Render every story reward as a `<details>` tile, earned or locked, in `grid grid-cols-3 gap-2`. Reduce `Art` from `h-24 w-24` to `h-16 w-16` with a proportional icon.

Every tile summary contains art and badge name. Its opened panel contains:

```tsx
<p>{reward.criterion}</p>
<p>{progress[reward.id].label}</p>
<p>{earned.length ? `First earned ${earned[0].earnedAt}` : "Not earned yet"}</p>
```

Keep earned spood links in the panel. Add the visible note: “Physical interaction is optional and never required for your shared care streak.”

- [ ] **Step 7: Assemble the Journey page**

Use `AppHeader title="Your Care Journey"`, explain shared-account progress in the subtitle, then render `RecentCareMeter`, `CareReview`, and `RewardGallery({ stories, progress: storyProgress })`. Do not render a second `StreakCard` on this page; the meter owns the shared streak summary. Keep the zero-spood entry state and existing care-review behavior.

- [ ] **Step 8: Run focused checks**

Run:

```bash
npx tsx --test src/lib/constellation.test.ts src/lib/constellation-data.test.ts src/lib/ui-contracts.test.ts src/lib/care-revalidation-boundary.test.ts
npx tsc --noEmit
npm run lint -- src/lib/constellation.ts src/lib/reward-data.ts src/lib/constellation-data.ts src/components/constellation/recent-care-meter.tsx src/components/constellation/reward-art.tsx src/components/constellation/reward-gallery.tsx 'src/app/(app)/constellation/page.tsx'
```

Expected: all commands pass; existing future-event, withdrawn-badge, and ordinary-read boundary tests remain green.

- [ ] **Step 9: Pause for commit approval**

After explicit owner approval:

```bash
git add src/lib/constellation.ts src/lib/constellation.test.ts src/lib/reward-data.ts src/lib/constellation-data.ts src/components/constellation/recent-care-meter.tsx src/components/constellation/reward-art.tsx src/components/constellation/reward-gallery.tsx 'src/app/(app)/constellation/page.tsx' src/lib/ui-contracts.test.ts
git commit -m "feat: reshape badges into a care journey"
```

### Task 7: Whole-feature verification and staging review package

**Files:**
- Update: `docs/staging/main-to-staging-handoff-2026-09-19.md`
- Create: `docs/staging/beta-care-navigation-smoke-test-2026-09-23.md`

**Interfaces:**
- Consumes: every interface and behavior from Tasks 1-6.
- Produces: a reproducible smoke-test checklist and an updated staging handoff.

- [ ] **Step 1: Run the complete automated verification suite**

Run exactly:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all tests, TypeScript, and build pass; ESLint has no errors and introduces no new warnings. Record exact counts and any unchanged pre-existing warnings in the smoke-test document.

- [ ] **Step 2: Inspect the final diff for forbidden scope**

Run:

```bash
git diff --check
git status --short
git diff --stat 0a4951786ffefc365d18e566378b3e058288f598
git diff --name-only 0a4951786ffefc365d18e566378b3e058288f598
```

Expected: no Prisma migration, environment file, Vercel metadata, generated credential, production configuration, or unrelated admin/security file appears.

- [ ] **Step 3: Start a local production-mode review without database writes**

Use the existing staging worktree environment only. Start the app with the standard project command; do not seed, reset, or mutate fixtures solely for the review. Use existing staging test accounts and existing test data.

```bash
npm run dev
```

Expected: the server starts on port 43123. Keep the terminal session available for browser review.

- [ ] **Step 4: Complete responsive authenticated browser checks**

At desktop width, 390 pixels, and 320 pixels, verify and record:

1. Home selects only Home; Journey is neutral. The Add spood control is prominent.
2. The Journey teaser clearly names its destination.
3. A Needs Attention card separates identity, Care status, and Log care.
4. Each of six actions opens the correct panel; opening another action closes the prior panel.
5. Housekeeping with an enclosure submits to the established maintenance flow; a no-enclosure spood receives guidance and no false success.
6. My Spoods shows compact rows, keeps only one open, and preserves typed unsaved text when a row closes and reopens.
7. Read-only and memorialized spoods expose no write controls.
8. Current care is open on a profile; About, Molt phase, Body condition, Enclosure, Photos, and Memorial begin collapsed where applicable.
9. Closing and reopening a profile section preserves unsaved mounted input.
10. Journey selects only Journey, shows one seven-day meter, uses a compact badge grid, exposes every requirement, and labels Play optional.
11. Keyboard focus, disclosure announcements, touch targets, long names, and both themes remain usable without clipped content or horizontal scrolling.

- [ ] **Step 5: Document the smoke-test procedure and update the handoff**

Create `docs/staging/beta-care-navigation-smoke-test-2026-09-23.md` with the exact URL/environment tested, viewport widths, account type, each numbered result, automated command output summary, and unresolved limitations. Do not include passwords, tokens, private notes, or user email addresses.

Update the staging handoff with the selected design, new component boundaries, verification evidence, and the fact that no schema migration is required.

- [ ] **Step 6: Request independent code review**

Use `superpowers:requesting-code-review` against the complete diff from specification commit `0a4951786ffefc365d18e566378b3e058288f598`. Require the reviewer to examine:

- write-policy and read-only regressions;
- native disclosure semantics and mounted form state;
- duplicate DOM IDs across multiple quick-log cards;
- reward progress consistency with current eligibility and future-date exclusion;
- mobile overflow, focus, contrast, and reduced-motion behavior.

Resolve actionable findings with focused failing tests and rerun Step 1.

- [ ] **Step 7: Pause for final release-commit approval**

Present the final diff summary, test counts, browser findings, and independent review. After explicit owner approval, create one reviewed release commit containing any still-uncommitted verification documentation or final fixes:

```bash
git add docs/staging/main-to-staging-handoff-2026-09-19.md docs/staging/beta-care-navigation-smoke-test-2026-09-23.md
git commit -m "docs: record beta interface verification"
```

Do not push or deploy. Request separate approval before deploying the exact reviewed commit to the staging Vercel project.
