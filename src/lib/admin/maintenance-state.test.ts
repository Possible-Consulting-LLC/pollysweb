import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from './maintenance-policy';
function fixture() {
  let state = { id: 1, version: 0, deadline: null as Date | null, announcementEnabled: false, announcement: '' };
  const audits: unknown[] = [];
  const tx = {
    siteSettings: {
      findUnique: async () => ({ ...state }), updateMany: async (args: {
        where: {
          version: number;
        };
        data: Partial<typeof state>;
      }) => {
        if (args.where.version !== state.version)
          return { count: 0 };
        state = { ...state, ...args.data, version: state.version + 1 };
        return { count: 1 };
      }
    }
  };
  const deps: Record<string, unknown> = {
    'server-only': {}, '@/lib/db': { prisma: tx }, './maintenance-policy': policy, './actor': {
      withAdminControl: async (work: (tx: unknown, actor: {
        id: string;
      }) => Promise<unknown>) => work(tx, { id: 'owner' })
    }, './audit': { appendAudit: async (_tx: unknown, event: unknown) => audits.push(event) }
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./maintenance-state.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, Date, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return { api: exports as typeof import('./maintenance-state'), state: () => state, setDeadline: (deadline: Date) => { state = { ...state, deadline }; }, audits };
}
test('start uses server minute, repeated start retains deadline, stale stop loses race', async () => {
  const f = fixture();
  await f.api.setMaintenance({ id: 'owner' }, 0, 'start');
  const deadline = f.state().deadline!.getTime();
  assert.ok(deadline >= Date.now() + 59000 && deadline <= Date.now() + 60000);
  await f.api.setMaintenance({ id: 'owner' }, 1, 'start');
  assert.equal(f.state().deadline!.getTime(), deadline);
  await assert.rejects(f.api.setMaintenance({ id: 'owner' }, 0, 'cancel'), /changed/i);
  await f.api.setMaintenance({ id: 'owner' }, 2, 'cancel');
  assert.equal(f.state().deadline, null);
  assert.equal(f.audits.length, 3);
});
test('concurrent controls permit one expected version and never silently overwrite', async () => {
  const f = fixture();
  const result = await Promise.allSettled([f.api.setMaintenance({ id: 'owner' }, 0, 'start'), f.api.setMaintenance({ id: 'owner' }, 0, 'cancel')]);
  assert.equal(result.filter(r => r.status === 'fulfilled').length, 1);
  assert.equal(f.state().version, 1);
});
test('cancel is rejected after the deadline even with the same version; reopen requires active mode', async () => {
  const f = fixture();
  await f.api.setMaintenance({ id: 'owner' }, 0, 'start');
  await assert.rejects(f.api.setMaintenance({ id: 'owner' }, 1, 'reopen'), /active/i);
  f.setDeadline(new Date(Date.now() - 1));
  await assert.rejects(f.api.setMaintenance({ id: 'owner' }, 1, 'cancel'), /countdown|save window/i);
  assert.ok(f.state().deadline);
  await f.api.setMaintenance({ id: 'owner' }, 1, 'reopen');
  assert.equal(f.state().deadline, null);
});
test('announcement independent of deadline, bounded plain text and disabled draft stays private', async () => {
  const f = fixture();
  await f.api.setAnnouncement({ id: 'owner' }, 0, true, 'Back soon.');
  assert.equal(f.state().deadline, null);
  assert.equal(f.state().announcement, 'Back soon.');
  for (const text of ['<b>unsafe</b>', 'x'.repeat(501), 'bad\u0000text'])
    await assert.rejects(f.api.setAnnouncement({ id: 'owner' }, 1, true, text));
  assert.equal(f.state().version, 1);
  assert.equal(f.audits.length, 1);
});
