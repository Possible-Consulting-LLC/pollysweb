import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { mutationIdentity } from './mutation-context';
import * as policy from './admin/maintenance-policy';
function fixture() {
  let time = 59999, saved = 0, progress = 0;
  const tx = {};
  const deps: Record<string, unknown> = {
    'server-only': {}, './mutation-context': { mutationIdentity }, './db': {
      prisma: {
        $transaction: async (work: (tx: unknown) => Promise<unknown>) => {
          const before = saved;
          try {
            return await work(tx);
          }
          catch (error) {
            saved = before;
            throw error;
          }
        }
      }
    }, './spider-write-policy': { assertSpiderWritableInTransaction: async () => {} }, './admin/maintenance-access': {
      guardMaintenanceAfterWrite: async () => {
        if (time >= 60000)
          throw new policy.MaintenanceError();
      }, guardMaintenance: async () => {
        if (time >= 60000)
          throw new policy.MaintenanceError();
      }
    }
  };
  const exports = {};
  runInNewContext(ts.transpileModule(readFileSync(new URL('./maintenance-write.ts', import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (name: string) => { assert.ok(name in deps, name); return deps[name]; } });
  return { api: exports as typeof import('./maintenance-write'), advance: () => time = 60000, write: () => saved++, reward: () => progress++, counts: () => ({ saved, progress }) };
}
test('transaction crossing cutoff rolls back primary and returns maintenance failure', async () => { const f = fixture(); await assert.rejects(f.api.maintenanceTransaction(async () => { f.write(); f.advance(); }), policy.MaintenanceError); assert.equal(f.counts().saved, 0); });
test('confirmed primary before cutoff retains saved outcome and care progress during bounded drain', async () => { const f = fixture(); await mutationIdentity.run({ identity: null }, async () => { await f.api.maintenanceTransaction(async () => f.write()); f.advance(); await f.api.drainCareCompletion(async () => { await f.api.guardDerivedMaintenance(); f.reward(); }); await assert.rejects(f.api.maintenanceTransaction(async () => f.write()), policy.MaintenanceError); }); assert.deepEqual(f.counts(), { saved: 1, progress: 1 }); });
test('new read reconciliation cannot claim draining privilege', async () => { const f = fixture(); f.advance(); await assert.rejects(f.api.drainCareCompletion(async () => f.api.guardDerivedMaintenance()), policy.MaintenanceError); });
