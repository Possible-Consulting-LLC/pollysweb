import assert from 'node:assert/strict';
import test from 'node:test';
import { remainingSignInAvailable, recentSocialAuthentication } from './social-disconnect-policy';

test('cannot remove the final usable provider, including duplicate links for that provider', () => {
  assert.equal(remainingSignInAvailable('facebook', ['facebook'], ['google','facebook'], false), false);
  assert.equal(remainingSignInAvailable('google', ['google','google'], ['google'], false), false);
  assert.equal(remainingSignInAvailable('facebook', ['facebook','google'], ['facebook'], false), false);
});
test('verified email/password or another configured linked provider permits removal', () => {
  assert.equal(remainingSignInAvailable('facebook', ['facebook'], ['facebook'], true), true);
  assert.equal(remainingSignInAvailable('facebook', ['facebook','google'], ['google','facebook'], false), true);
  assert.equal(remainingSignInAvailable('google', ['google','facebook'], ['google','facebook'], false), true);
});
test('social reauthentication must be recent and not in the future', () => {
  const now=1_000_000;
  assert.equal(recentSocialAuthentication(now-1000,now),true);
  for (const stamp of [undefined,NaN,Infinity,now+1,now-300001]) assert.equal(recentSocialAuthentication(stamp,now),false);
});
