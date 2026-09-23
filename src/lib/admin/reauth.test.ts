import assert from 'node:assert/strict';
import test from 'node:test';
import { requireRecentAdminAuth, validReauthProof, socialReauthMatches } from './reauth';
import type { Actor } from './policy';
const now = Date.UTC(2026, 8, 20);
const actor: Actor = { id: 'actor', role: 'super_admin', owner: false, suspended: false, credentialVersion: 'v1', reauthenticatedAt: now };
test('recent authentication rejects absent, future, expired, nonfinite and nonprivileged proofs', () => {
  for (const time of [null, now + 1, now - 300001, NaN, Infinity]) {
    assert.throws(() => requireRecentAdminAuth({ ...actor, reauthenticatedAt: time }, now));
  }
  assert.throws(() => requireRecentAdminAuth({ ...actor, role: 'user' }, now));
  assert.throws(() => requireRecentAdminAuth({ ...actor, suspended: true }, now));
  assert.doesNotThrow(() => requireRecentAdminAuth({ ...actor, reauthenticatedAt: now - 300000 }, now));
});
test('proof is bound to actor and credential, expires and must be verified server-side', () => {
  const proof = { actorId: 'actor', credentialVersion: 'v1', verifiedAt: new Date(now), expiresAt: new Date(now + 300000) };
  assert.equal(validReauthProof(proof, actor, now), now);
  assert.equal(validReauthProof(proof, { ...actor, id: 'target' }, now), null);
  assert.equal(validReauthProof(proof, { ...actor, credentialVersion: 'v2' }, now), null);
  assert.equal(validReauthProof({ ...proof, verifiedAt: null }, actor, now), null);
  assert.equal(validReauthProof(proof, actor, now + 300001), null);
  assert.equal(validReauthProof({ ...proof, verifiedAt: new Date(now + 1) }, actor, now), null);
});
test('social challenge accepts only the existing actor link, matching provider and live credential', () => {
  const challenge = { actorId: 'actor', credentialVersion: 'v1', provider: 'google', providerAccountId: 'provider-actor', createdAt: new Date(now), verifiedAt: null, expiresAt: new Date(now + 300000) };
  const identity = { userId: 'actor', credentialVersion: 'v1', provider: 'google', providerAccountId: 'provider-actor' };
  assert.equal(socialReauthMatches(challenge, identity, now), true);
  for (const change of [{ userId: 'other' }, { credentialVersion: 'v2' }, { provider: 'facebook' }, { providerAccountId: 'different' }]) {
    assert.equal(socialReauthMatches(challenge, { ...identity, ...change }, now), false);
  }
  assert.equal(socialReauthMatches({ ...challenge, verifiedAt: new Date(now) }, identity, now), false);
  assert.equal(socialReauthMatches(challenge, identity, now + 300000), false);
  assert.equal(socialReauthMatches({ ...challenge, createdAt: new Date(now + 1) }, identity, now), false);
});
