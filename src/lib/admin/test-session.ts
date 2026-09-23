import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { matchesCredentialFingerprint, userCredentialSource } from '../credential-version';
export type RequestIdentity = {
  actorId: string;
  effectiveUserId: string;
  testSessionId: string | null;
  contextVersion: string;
};
export type TestUser = {
  id: string;
  role: string;
  isDemo: boolean;
  emailVerified: Date | null;
  suspendedAt: Date | null;
  deletingAt: Date | null;
  passwordHash: string | null;
  authVersion: string;
  adminVersion?: string | null;
  emailChangeVersion?: string | null;
  testContextVersion: string;
  name: string | null;
  demoPlan: string | null;
};
export type TestSessionRow = {
  id: string;
  tokenHash: string;
  actorId: string;
  targetId: string;
  credentialVersion: string;
  createdAt: Date;
  expiresAt: Date;
  endedAt: Date | null;
};
export type TestSessionDependencies = {
  secret: string;
  ownerId: string | undefined;
  now: () => number;
  readSession: () => Promise<{
    id?: string | null;
    credentialVersion?: string;
  } | null | undefined>;
  readToken: () => Promise<string | undefined>;
  readUser: (id: string) => Promise<TestUser | null>;
  readOwner: () => Promise<TestUser | null>;
  readActiveTests: (actorId: string) => Promise<TestSessionRow[]>;
  readTest: (hash: string) => Promise<TestSessionRow | null>;
  insertTest: (row: TestSessionRow) => Promise<void>;
  endTest: (id: string, reason: 'ended' | 'expired' | 'revoked') => Promise<void>;
  rotateContext: (id: string) => Promise<void>;
  writeToken: (token: string | undefined) => Promise<void>;
  audit: (action: string, actorId: string, targetId: string, sessionId: string) => Promise<void>;
};
export class TestContextError extends Error {
  constructor() {
    super('Your testing or sign-in context changed. Reload or return to admin before continuing.');
  }
}
export const hashTestToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function assertMutationContext(identity: RequestIdentity, submittedContext: string): void {
  if (!/^[a-f0-9]{64}$/.test(submittedContext) || !timingSafeEqual(Buffer.from(identity.contextVersion, 'hex'), Buffer.from(submittedContext, 'hex')))
    throw new TestContextError();
}
export function createTestSessionService(d: TestSessionDependencies) {
  const deny = (): never => {
    throw new TestContextError();
  };
  const active = (u: TestUser | null): u is TestUser => !!u && !u.suspendedAt && !u.deletingAt;
  const context = (actor: TestUser, credential: string, test: TestSessionRow | null): RequestIdentity => ({
    actorId: actor.id, effectiveUserId: test?.targetId ?? actor.id, testSessionId: test?.id ?? null, contextVersion: createHmac('sha256', d.secret).update(JSON.stringify(['mutation-context-v1', actor.id, credential, actor.testContextVersion, test?.id ?? null])).digest('hex')
  });
  async function liveActor() {
    const session = await d.readSession();
    const actor = session?.id ? await d.readUser(session.id) : null;
    return active(actor) && d.secret && matchesCredentialFingerprint(session?.credentialVersion, userCredentialSource(actor), d.secret) ? {
      actor, credential: session!.credentialVersion!
    } : null;
  }
  async function privileged(actor: TestUser) {
    const owner = await d.readOwner();
    return active(owner) && owner.id === d.ownerId && owner.role === 'super_admin' && !owner.isDemo && !!owner.emailVerified && actor.role === 'super_admin' && !actor.isDemo && !!actor.emailVerified;
  }
  async function resolve(): Promise<RequestIdentity | null> {
    const token = await d.readToken();
    const live = await liveActor();
    if (!token)
      return live ? context(live.actor, live.credential, null) : null;
    const row = await d.readTest(hashTestToken(token));
    if (!row || row.endedAt)
      return deny();
    const target = await d.readUser(row.targetId);
    const expired = row.expiresAt.getTime() <= d.now() || row.expiresAt.getTime() - row.createdAt.getTime() > 3600000;
    if (expired || !live || row.actorId !== live.actor.id || row.credentialVersion !== live.credential || !await privileged(live.actor) || !active(target) || !target.isDemo || target.role !== 'user' || !target.emailVerified) {
      await d.endTest(row.id, expired ? 'expired' : 'revoked');
      return deny();
    }
    return context(live.actor, live.credential, row);
  }
  async function start(actorId: string, targetId: string) {
    if (await d.readToken())
      return deny();
    const live = await liveActor();
    const target = await d.readUser(targetId);
    if (!live || live.actor.id !== actorId || !await privileged(live.actor) || !active(target) || !target.isDemo || target.role !== 'user' || !target.emailVerified || target.id === actorId)
      return deny();
    if ((await d.readActiveTests(actorId)).some(row => row.expiresAt.getTime() > d.now()))
      return deny();
    const token = randomBytes(32).toString('base64url'), now = d.now();
    const row: TestSessionRow = {
      id: randomUUID(), tokenHash: hashTestToken(token), actorId, targetId, credentialVersion: live.credential, createdAt: new Date(now), expiresAt: new Date(now + 3600000), endedAt: null
    };
    await d.insertTest(row);
    await d.rotateContext(actorId);
    await d.audit('test.started', actorId, targetId, row.id);
    await d.writeToken(token);
  }
  async function stop() {
    const live = await liveActor();
    // Recovery belongs to the authenticated actor, never whichever row a cookie
    // happens to reference. It also works after the testing cookie is lost.
    if (live) {
      const rows = await d.readActiveTests(live.actor.id);
      for (const row of rows) {
        if (row.actorId !== live.actor.id) return deny();
        await d.endTest(row.id, 'ended');
      }
      if (rows.length) await d.rotateContext(live.actor.id);
    }
    await d.writeToken(undefined);
  }
  return {
    resolve, start, stop
  };
}
