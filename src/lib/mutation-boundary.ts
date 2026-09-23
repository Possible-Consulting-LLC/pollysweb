import 'server-only';
import { guardMaintenance } from './admin/maintenance-access';
import { MaintenanceError, maintenanceFailure } from './admin/maintenance-policy';
import { contextChangedFailure, type MutationFailure } from './mutation-failure';
import { mutationIdentity } from './mutation-context';
import { assertMutationContext, TestContextError } from './admin/test-session';
import { anonymousMutationContext, auditTestMutation, resolveRequestIdentity } from './admin/test-session-store';
export type MutationKind = 'data' | 'identity' | 'admin' | 'public-identity' | 'billing' | 'authentication';
/** Admission is the linearization point. All helpers use the captured effective ID.
 * Maintenance is checked freshly at admission and each explicit write boundary. */
export async function withMutation<T>(submitted: FormData | string, kind: MutationKind, action: string, work: () => Promise<T>): Promise<T | MutationFailure> {
  try {
    let identity;
    try { identity = await resolveRequestIdentity(); } catch(error) { if(error instanceof TestContextError) throw error; throw new MaintenanceError(); }
    if(kind !== 'authentication') await guardMaintenance('write',identity);
    const token = typeof submitted === 'string' ? submitted : String(submitted.get('mutationContext') ?? '');
    if (identity)
      assertMutationContext(identity, token);
    else if (!['public-identity', 'authentication'].includes(kind) || token !== anonymousMutationContext())
      throw new TestContextError();
    if (identity?.testSessionId && kind !== 'data')
      throw new TestContextError();
    if (identity)
      await auditTestMutation(identity, `test.mutation.${action}`, 'attempted');
    return await mutationIdentity.run({
      identity
    }, async () => {
      const result = await work();
      const failed = result && typeof result === 'object' && (('error' in result && !!result.error) || ('ok' in result && result.ok === false));
      if (identity && !failed)
        await auditTestMutation(identity, `test.mutation.${action}`, 'succeeded');
      return result;
    });
  } catch (error) {
    if (error instanceof MaintenanceError) return maintenanceFailure();
    if (error instanceof TestContextError) return contextChangedFailure();
    throw error;
  }
}
/** Explicit success boundary for an action that redirects after a confirmed write. */
export async function recordMutationSuccess(action: string) {
  const identity = mutationIdentity.getStore()?.identity;
  if (identity)
    await auditTestMutation(identity, `test.mutation.${action}`, 'succeeded');
}
