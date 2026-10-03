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
    Error,
    FormData,
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

  let allowed = true;
  const actionsDeps: Record<string, unknown> = {
    "next/cache": {
      revalidatePath: (path: string) => {
        revalidated.push(path);
      },
    },
    "@/lib/mutation-boundary": {
      withMutation: async (_form: unknown, kind: unknown, _name: unknown, work: () => Promise<unknown>) => {
        assert.equal(kind, "admin");
        try {
          return await work();
        } catch (error) {
          if (error instanceof policy.MaintenanceError) return policy.maintenanceFailure();
          throw error;
        }
      },
    },
    "@/lib/admin/actor": {
      requireAdminActor: async () => {
        if (role !== "super_admin") throw new Error("Administrator access denied.");
        return actor;
      },
    },
    "@/lib/admin/maintenance-state": maintenanceState,
    "@/lib/admin/maintenance-policy": policy,
    "@/lib/rate-limit": { allowAction: async () => allowed, RATE_LIMIT_MESSAGE: "Slow down." },
  };

  const actions = load("../../app/actions/admin-maintenance.ts", actionsDeps) as {
    setFeatureTelemetrySinkAction: (form: FormData) => Promise<{ success?: true; error?: string }>;
  };

  return {
    actions,
    submit: (sink: unknown, version: unknown = state.version) => {
      const form = new FormData();
      if (sink !== undefined && sink !== null) form.set("sink", String(sink));
      if (version !== undefined) form.set("version", String(version));
      return actions.setFeatureTelemetrySinkAction(form).then((result) => JSON.parse(JSON.stringify(result)) as typeof result);
    },
    limit: () => {
      allowed = false;
    },
    state: () => ({ ...state }),
    audits: () => JSON.parse(JSON.stringify(audits)) as typeof audits,
    revalidated: () => [...revalidated],
  };
}

test("super-admin sets the sink to posthog: versioned update, audit records old/new sink", async () => {
  const f = fixture("super_admin");
  assert.deepEqual(await f.submit("posthog", 0), { success: true });
  assert.equal(f.state().featureTelemetrySink, "posthog");
  assert.equal(f.state().version, 1);
  assert.equal(f.state().updatedBy, "super-admin-1");
  assert.equal(f.audits().length, 1);
  assert.equal(f.audits()[0].action, "maintenance.telemetry_sink");
  assert.equal(f.audits()[0].actorId, "super-admin-1");
  assert.equal(f.audits()[0].changes.featureTelemetrySinkFrom, "off");
  assert.equal(f.audits()[0].changes.featureTelemetrySinkTo, "posthog");
  assert.equal(f.audits()[0].changes.version, 1);
  assert.deepEqual(f.revalidated(), ["/admin/maintenance"]);
});

test("super-admin can toggle the sink back to off with the next version", async () => {
  const f = fixture("super_admin");
  await f.submit("posthog", 0);
  assert.deepEqual(await f.submit("off", 1), { success: true });
  assert.equal(f.state().featureTelemetrySink, "off");
  assert.equal(f.state().version, 2);
  assert.equal(f.audits()[1].changes.featureTelemetrySinkFrom, "posthog");
  assert.equal(f.audits()[1].changes.featureTelemetrySinkTo, "off");
});

test("a stale form version is rejected instead of overwriting newer settings", async () => {
  const f = fixture("super_admin");
  await f.submit("posthog", 0);
  const result = await f.submit("off", 0);
  assert.match(result.error ?? "", /changed\. Reload/);
  assert.equal(f.state().featureTelemetrySink, "posthog");
  assert.equal(f.state().version, 1);
  assert.equal(f.audits().length, 1);
});

test("non-admin gets an error result and writes nothing", async () => {
  const f = fixture("admin");
  assert.match((await f.submit("posthog", 0)).error ?? "", /denied/i);
  assert.equal(f.state().featureTelemetrySink, "off");
  assert.equal(f.state().version, 0);
  assert.equal(f.audits().length, 0);
});

test("rate-limited admin gets the rate-limit message and writes nothing", async () => {
  const f = fixture("super_admin");
  f.limit();
  assert.deepEqual(await f.submit("posthog", 0), { error: "Slow down." });
  assert.equal(f.state().version, 0);
});

test("invalid sink values and versions return an error without touching db or audit", async () => {
  const f = fixture("super_admin");
  for (const sink of ["garbage", "", null]) assert.match((await f.submit(sink, 0)).error ?? "", /invalid/i);
  assert.match((await f.submit("posthog", "stale")).error ?? "", /invalid/i);
  assert.equal(f.state().featureTelemetrySink, "off");
  assert.equal(f.state().version, 0);
  assert.equal(f.audits().length, 0);
});
