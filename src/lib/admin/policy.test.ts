import assert from 'node:assert/strict';
import test from 'node:test';
import { canManage, type Actor, type Target, type AdminRole, type AdminOperation } from './policy';

export const actorFixture = (overrides: Partial<Actor> = {}): Actor => ({
  id: 'actor', role: 'admin', owner: false, suspended: false,
  credentialVersion: 'current', reauthenticatedAt: null, ...overrides,
});
export const targetFixture = (overrides: Partial<Target> = {}): Target => ({
  id: 'target', role: 'user', owner: false, demo: false, ...overrides,
});
const operations: AdminOperation[] = ['view', 'edit', 'suspend', 'role', 'delete', 'demo'];
const roles: AdminRole[] = ['user', 'admin', 'super_admin'];
// Explicit allowed operation sets from the reviewed role matrix.
const allowed = {
  user: { user: [], admin: [], super_admin: [] },
  admin: { user: ['view', 'edit', 'suspend'], admin: ['view'], super_admin: ['view'] },
  super_admin: { user: operations, admin: ['view', 'edit', 'suspend', 'role', 'delete'], super_admin: ['view', 'edit', 'suspend', 'role', 'delete'] },
} satisfies Record<AdminRole, Record<AdminRole, string[]>>;
for (const role of roles) for (const targetRole of roles) for (const operation of operations) {
  test(`${role} ${operation} ${targetRole} follows the role matrix`, () => {
    assert.equal(canManage(actorFixture({ role }), targetFixture({ role: targetRole }), operation),
      (allowed[role][targetRole] as string[]).includes(operation));
  });
}
test('owner account is view-only in administration even for the owner', () => {
  for (const role of roles) for (const operation of operations) {
    assert.equal(canManage(actorFixture({ role }), targetFixture({ role: 'super_admin', owner: true }), operation), operation === 'view' && role !== 'user');
    assert.equal(canManage(actorFixture({ role, owner: true }), targetFixture({ id: 'actor', role: 'super_admin', owner: true }), operation), operation === 'view' && role === 'super_admin');
  }
  assert.equal(canManage(actorFixture(), targetFixture({ owner: true, role: 'super_admin' }), 'edit'), false);
  assert.equal(canManage(actorFixture({ role: 'super_admin' }), targetFixture({ owner: true, role: 'super_admin' }), 'delete'), false);
});
test('self role changes, suspension, deletion and demo designation are denied', () => {
  for (const operation of ['role', 'suspend', 'delete', 'demo'] as const)
    assert.equal(canManage(actorFixture({ role: 'super_admin' }), targetFixture({ id: 'actor', role: 'super_admin' }), operation), false);
});
test('suspended actors and inconsistent owner or demo claims fail closed', () => {
  for (const operation of operations) {
    assert.equal(canManage(actorFixture({ role: 'super_admin', suspended: true }), targetFixture(), operation), false);
    assert.equal(canManage(actorFixture({ role: 'user', owner: true }), targetFixture(), operation), false);
    assert.equal(canManage(actorFixture({ role: 'super_admin' }), targetFixture({ role: 'admin', demo: true }), operation), false);
  }
  assert.equal(canManage(actorFixture({ role: 'super_admin' }), targetFixture({ demo: true }), 'role'), false);
  assert.equal(canManage(actorFixture({ role: 'forged' as AdminRole }), targetFixture(), 'view'), false);
});
