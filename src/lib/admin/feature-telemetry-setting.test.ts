import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import * as policy from './maintenance-policy';

function load(relativePath: string, deps: Record<string, unknown>): Record<string, unknown> {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(
    readFileSync(new URL(relativePath, import.meta.url), 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }
  ).outputText;
  runInNewContext(code, {
    exports,
    require: (name: string) => {
      assert.ok(name in deps, `unexpected dependency ${name}`);
      return deps[name];
    },
  });
  return exports;
}

function fixture(role: 'admin' | 'super_admin' = 'super_admin') {
  let state = {
    id: 1,
    version: 0,
    deadline: null as Date | null,
    announcementEnabled: false,
    announcement: '',
    featureTelemetrySink: 'off',
    updatedBy: null as string | null,
  };
  const audits: Array<{
    actorId: string;
    targetId: string | null;
    action: string;
    reason: string;
    changes: Record<string, unknown>;
  }> = [];
  const revalidated: string[] = [];

  const tx = {
    siteSettings: {
      findUnique: async () => ({ ...state }),
      updateMany: async (args: {
        where: { id?: number; version: number };
        data: Record<string, unknown>;
      }) => {
        if (args.where.version !== state.version) {
          return { count: 0 };
        }
        const data = { ...args.data };
        if (typeof data.version === 'object' && data.version && 'increment' in data.version) {
          state.version += (data.version as { increment: number }).increment;
          delete data.version;
        } else {
          state.version += 1;
        }
        state = { ...state, ...data };
        return { count: 1 };
      },
    },
  };

  const actor = { id: 'super-admin-1', role };

  const maintenanceStateDeps: Record<string, unknown> = {
    'server-only': {},
    '@/lib/db': { prisma: tx },
    './maintenance-policy': policy,
    './actor': {
      withAdminControl: async (work: (txClient: unknown, live: typeof actor) => Promise<unknown>) => {
        if (role !== 'super_admin') {
          throw new Error('Administrator access denied.');
        }
        return work(tx, actor);
      },
    },
    './audit': {
      appendAudit: async (_tx: unknown, event: unknown) => {
        audits.push(event as typeof audits[number]);
      },
    },
  };

  const maintenanceState = load('./maintenance-state.ts', maintenanceStateDeps);

  const actionsDeps: Record<string, unknown> = {
    'next/cache': {
      revalidatePath: (path: string) => {
        revalidated.push(path);
      },
    },
    '@/lib/admin/maintenance-state': maintenanceState,
    '@/lib/admin/maintenance-policy': policy,
    '@/lib/admin/actor': maintenanceStateDeps['./actor'],
    '@/lib/admin/audit': maintenanceStateDeps['./audit'],
    '@/lib/db': { prisma: tx },
  };

  const actions = load('../../app/admin/maintenance/actions.ts', actionsDeps) as {
    setFeatureTelemetrySink: (sink: unknown) => Promise<unknown>;
  };

  return {
    actions,
    state: () => ({ ...state }),
    audits: () => [...audits],
    revalidated: () => [...revalidated],
  };
}

test('super-admin sets feature telemetry sink to posthog: updates row, increments version, appends audit', async () => {
  const f = fixture('super_admin');
  await f.actions.setFeatureTelemetrySink('posthog');
  assert.equal(f.state().featureTelemetrySink, 'posthog');
  assert.equal(f.state().version, 1);
  assert.equal(f.state().updatedBy, 'super-admin-1');
  assert.equal(f.audits().length, 1);
  assert.equal(f.audits()[0].action, 'feature_telemetry_sink');
  assert.equal(f.audits()[0].actorId, 'super-admin-1');
  assert.deepEqual(f.revalidated(), ['/admin/maintenance']);
});

test('super-admin can toggle feature telemetry sink back to off', async () => {
  const f = fixture('super_admin');
  await f.actions.setFeatureTelemetrySink('posthog');
  assert.equal(f.state().featureTelemetrySink, 'posthog');
  assert.equal(f.state().version, 1);

  await f.actions.setFeatureTelemetrySink('off');
  assert.equal(f.state().featureTelemetrySink, 'off');
  assert.equal(f.state().version, 2);
  assert.equal(f.audits().length, 2);
  assert.equal(f.audits()[1].action, 'feature_telemetry_sink');
});

test('non-admin is rejected and writes nothing', async () => {
  const f = fixture('admin');
  await assert.rejects(f.actions.setFeatureTelemetrySink('posthog'), /denied/i);
  assert.equal(f.state().featureTelemetrySink, 'off');
  assert.equal(f.state().version, 0);
  assert.equal(f.audits().length, 0);
});

test('invalid telemetry sink values (e.g. garbage) are rejected without touching db or audit', async () => {
  const f = fixture('super_admin');
  await assert.rejects(f.actions.setFeatureTelemetrySink('garbage'), /invalid/i);
  await assert.rejects(f.actions.setFeatureTelemetrySink(''), /invalid/i);
  await assert.rejects(f.actions.setFeatureTelemetrySink(null as unknown as 'off'), /invalid/i);
  await assert.rejects(f.actions.setFeatureTelemetrySink(undefined as unknown as 'off'), /invalid/i);
  assert.equal(f.state().featureTelemetrySink, 'off');
  assert.equal(f.state().version, 0);
  assert.equal(f.audits().length, 0);
});

test('FormData support: accepts form submission with sink field', async () => {
  const f = fixture('super_admin');
  const form = new FormData();
  form.set('sink', 'posthog');
  await f.actions.setFeatureTelemetrySink(form);
  assert.equal(f.state().featureTelemetrySink, 'posthog');
  assert.equal(f.state().version, 1);
  assert.equal(f.audits().length, 1);
  assert.equal(f.audits()[0].action, 'feature_telemetry_sink');
});
