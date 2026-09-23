export type AdminRole = 'user' | 'admin' | 'super_admin';
export type AdminOperation = 'view' | 'edit' | 'suspend' | 'role' | 'delete' | 'demo';
export type Actor = { id: string; role: AdminRole; owner: boolean; suspended: boolean;
  credentialVersion: string; reauthenticatedAt: number | null };
export type Target = { id: string; role: AdminRole; owner: boolean; demo: boolean };
/** Pure policy only: actors must first be resolved from live server data. */
export function canManage(actor: Actor, target: Target, operation: AdminOperation): boolean {
  if (!['user', 'admin', 'super_admin'].includes(actor.role) ||
      !['user', 'admin', 'super_admin'].includes(target.role) ||
      !['view', 'edit', 'suspend', 'role', 'delete', 'demo'].includes(operation)) return false;
  if (actor.suspended || actor.role === 'user' || (actor.owner && actor.role !== 'super_admin')) return false;
  if ((target.owner && target.role !== 'super_admin') || (target.demo && target.role !== 'user')) return false;
  if (operation === 'view') return true;
  // Owner identity/profile edits use the owner's existing verified settings flow.
  if (target.owner) return false;
  if (actor.id === target.id && ['role', 'suspend', 'delete', 'demo'].includes(operation)) return false;
  if (actor.role === 'admin') return target.role === 'user' && ['edit', 'suspend'].includes(operation);
  if (operation === 'demo') return target.role === 'user';
  if (operation === 'role') return !target.demo;
  return true;
}
