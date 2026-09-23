import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
function source(relative: string) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function allTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? allTsx(full) : entry.name.endsWith('.tsx') ? [full] : [];
  });
}

test('links are not composed around native Button controls', () => {
  for (const file of allTsx(root)) assert.doesNotMatch(fs.readFileSync(file, 'utf8'), /<Link(?:(?!<\/Link>)[\s\S])*?<Button/, file);
});

test('every quick-log disclosure button exposes its expanded state', () => {
  const quickLog = source('components/spoods/quick-log.tsx');
  assert.match(quickLog, /aria-expanded=\{panel === "molt"\}/);
  assert.match(quickLog, /aria-expanded=\{panel === "note"\}/);
});

test('read-only profile and filtered collection empty states remain truthful', () => {
  assert.match(source('app/(app)/spoods/[id]/page.tsx'), /!writable\s*\?\s*"No photos yet\."/);
  const listing = source('app/(app)/spoods/page.tsx');
  assert.match(listing, /No matching spoods/);
  assert.match(listing, /allViews/);
});

test('home presents structured care actions and a clear journey entry point', () => {
  const home = source('app/(app)/home/page.tsx');
  const card = source('components/spoods/spood-card.tsx');
  const streak = source('components/constellation/streak-card.tsx');

  assert.match(home, /Add spood/);
  assert.match(streak, /Your care journey/);
  assert.match(streak, /View journey/);
  assert.match(card, /Care status/);
  assert.match(card, /Log care/);
  assert.match(card, /CareStatusGrid/);
  assert.doesNotMatch(card, />Last molt</);
  assert.match(card, /showStatus=\{false\}/);
  assert.match(card, /showActionHeading=\{false\}/);
  assert.match(card, /actions=\{\["feed", "hydrate"\]\}/);
  assert.match(card, /showCareCopy=\{false\}/);
  assert.match(card, /absolute right-4 top-4/);
});

test("My Spoods uses a controlled semantic accordion", () => {
  const accordion = source("components/spoods/spood-accordion.tsx");
  assert.match(accordion, /aria-expanded=\{open\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  assert.match(accordion, /hidden=\{!open\}/);
  assert.match(accordion, /open \? "−" : "\+"/);

  const page = source("app/(app)/spoods/page.tsx");
  assert.match(page, /SpoodAccordion/);
  assert.match(page, /profileAction/);
  assert.match(page, />\s*Profile\s*</);
  assert.match(page, /showProfileLink/);
  assert.doesNotMatch(page, /<SpoodCareCard/);
});
