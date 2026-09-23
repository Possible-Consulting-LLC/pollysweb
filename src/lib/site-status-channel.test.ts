import assert from 'node:assert/strict';
import test from 'node:test';
import { createSiteStatusChannel } from './site-status-channel';
import type { PublicSiteStatus } from './site-status-model';

test('live public mode reaches subscribers and stops after unsubscribe', () => {
  const channel = createSiteStatusChannel();
  let mode = 'countdown';
  const unsubscribe = channel.subscribe(status => { mode = status.mode; });
  const active: PublicSiteStatus = { mode: 'active', serverTime: new Date().toISOString(), deadline: new Date(0).toISOString(), announcementEnabled: false, announcement: '' };
  channel.publish(active);
  assert.equal(mode, 'active');
  unsubscribe();
  channel.publish({ ...active, mode: 'open', deadline: null });
  assert.equal(mode, 'active');
});
