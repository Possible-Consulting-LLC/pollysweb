/** Disposable fixtures only; refuses any database except the known staging project. */
import dotenv from 'dotenv';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { facebookDeletionOrigin } from '../src/lib/facebook-deletion';
import { assertStagingEnvironment } from '../src/lib/staging-guard';
import { credentialFingerprint, matchesCredentialFingerprint, userCredentialSource } from '../src/lib/credential-version';

async function main() {
  dotenv.config({ path: '.env.local', override: true, quiet: true });
  assert.equal(process.env.SPOODLY_ENV, 'staging');
  assertStagingEnvironment();
  const origin = facebookDeletionOrigin(process.env);
  // No OAuth calls occur. These fixture credentials only mark the two providers available.
  process.env.AUTH_GOOGLE_ID ||= 'fixture'; process.env.AUTH_GOOGLE_SECRET ||= 'fixture';
  process.env.AUTH_FACEBOOK_ID ||= 'fixture'; process.env.AUTH_FACEBOOK_SECRET ||= 'fixture';
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  assert.ok(secret);
  const { prisma } = await import('../src/lib/db');
  const { disconnectProvider } = await import('../src/lib/social-disconnect');
  const id = `disconnect-check-${randomUUID()}`;
  const email = `${id}@example.invalid`;
  const facebookId = BigInt('0x' + randomUUID().replaceAll('-', '')).toString();
  try {
    let user = await prisma.user.create({ data: { id, email, name: 'Disposable disconnect check' } });
    const spider = await prisma.spider.create({ data: { userId: id, name: 'Preserved test spood' } });
    await prisma.observationEvent.create({ data: { spiderId: spider.id, kind: 'behavior note' } });
    await prisma.account.create({ data: { userId: id, type: 'oauth', provider: 'facebook', providerAccountId: facebookId } });
    const { POST } = await import('../src/app/api/facebook/data-deletion/route');
    const payload = Buffer.from(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: facebookId, issued_at: Math.floor(Date.now()/1000) })).toString('base64url');
    const signed = createHmac('sha256', process.env.AUTH_FACEBOOK_SECRET!).update(payload).digest('base64url') + '.' + payload;
    const callback = new Request(`${origin}/api/facebook/data-deletion`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ signed_request: signed }) });
    const first = await POST(callback.clone()); assert.equal(first.status, 200);
    const receipt = await first.json();
    assert.deepEqual(await (await POST(callback.clone())).json(), receipt);
    assert.equal(await prisma.facebookDeletionRequest.count({ where: { userId: id } }), 1);
    assert.equal((await prisma.facebookDeletionRequest.findFirst({ where: { userId: id } }))!.status, 'needs_sign_in_method');
    let version = credentialFingerprint(userCredentialSource(user), secret);
    await assert.rejects(disconnectProvider(id, 'facebook', version), /at least one/);
    await prisma.account.create({ data: { userId: id, type: 'oidc', provider: 'google', providerAccountId: id } });
    const results = await Promise.allSettled([disconnectProvider(id, 'google', version), disconnectProvider(id, 'facebook', version)]);
    assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(await prisma.account.count({ where: { userId: id } }), 1);
    user = (await prisma.user.findUnique({ where: { id } }))!;
    assert.equal(matchesCredentialFingerprint(version, userCredentialSource(user), secret), false);
    version = credentialFingerprint(userCredentialSource(user), secret);
    const remaining = (await prisma.account.findFirst({ where: { userId: id } }))!.provider as 'google' | 'facebook';
    await assert.rejects(disconnectProvider(id, remaining, version), /at least one/);
    user = await prisma.user.update({ where: { id }, data: { passwordHash: 'test-only-not-a-login-password', emailVerified: new Date() } });
    version = credentialFingerprint(userCredentialSource(user), secret);
    await disconnectProvider(id, remaining, version);
    assert.equal(await prisma.account.count({ where: { userId: id } }), 0);
    user = (await prisma.user.findUnique({ where: { id } }))!;
    assert.equal(matchesCredentialFingerprint(version, userCredentialSource(user), secret), false);
    assert.equal(await prisma.spider.count({ where: { id: spider.id, userId: id } }), 1);
    assert.equal(await prisma.observationEvent.count({ where: { spiderId: spider.id } }), 1);
    console.log('PASS: last-method rejection, concurrent removals, stale session invalidation for password/social accounts, preserved spood/history, authenticated callback receipt and idempotent retries.');
  } finally {
    await prisma.facebookDeletionRequest.deleteMany({ where: { userId: id } });
    await prisma.user.deleteMany({ where: { id, email } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
