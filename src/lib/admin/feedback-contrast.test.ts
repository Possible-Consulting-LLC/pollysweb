import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('admin success notices set readable text on their light green background', () => {
  for (const relative of [
    '../../app/admin/accounts/[id]/page.tsx',
    '../../app/admin/operations/page.tsx',
  ]) {
    const source = readFileSync(new URL(relative, import.meta.url), 'utf8');
    const notices = source.match(/className="[^"]*bg-emerald-100[^"]*"/g) ?? [];
    assert.ok(notices.length > 0, `${relative} should contain a success notice`);
    for (const notice of notices) assert.match(notice, /text-emerald-950/);
  }
});
