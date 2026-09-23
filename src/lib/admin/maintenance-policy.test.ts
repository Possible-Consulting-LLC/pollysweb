import assert from 'node:assert/strict';
import test from 'node:test';
import * as policy from './maintenance-policy';
const state = { version: 0, deadline: new Date(60000), announcementEnabled: false, announcement: '' };
test('authoritative deadline is open before start and active exactly at cutoff', () => {
  assert.equal(policy.maintenanceMode({ ...state, deadline: null }, new Date(999999)), 'open');
  assert.equal(policy.maintenanceMode(state, new Date(59999)), 'countdown');
  assert.equal(policy.maintenanceMode(state, new Date(60000)), 'active');
  assert.equal(policy.maintenanceMode(state, new Date(60001)), 'active');
});
test('ordinary, admin and direct demo cannot bypass; live superadmin can', async () => {
  for (const allowed of [false, true])
    for (const operation of ['read', 'write'] as const) {
      const run = policy.assertSiteAccess(null, state, new Date(60000), operation, async () => allowed);
      if (allowed)
        await run;
      else
        await assert.rejects(run, policy.MaintenanceError);
    }
});
test('state or actor lookup failure closes access and failure preserves unsaved values', async () => {
  await assert.rejects(policy.assertSiteAccess(null, null, new Date(), 'read', async () => true), policy.MaintenanceError);
  await assert.rejects(policy.assertSiteAccess(null, state, new Date(60000), 'write', async () => { throw Error('db'); }), policy.MaintenanceError);
  assert.equal(policy.maintenanceFailure().code, 'maintenance');
  assert.match(policy.maintenanceFailure().error, /unsaved/i);
});
test('status is a minimal identity-free DTO and disabled announcement is hidden', () => {
  assert.deepEqual(policy.publicSiteStatus({ ...state, announcement: 'private draft' }, new Date(5)), { mode: 'countdown', serverTime: new Date(5).toISOString(), deadline: new Date(60000).toISOString(), announcementEnabled: false, announcement: '' });
});
