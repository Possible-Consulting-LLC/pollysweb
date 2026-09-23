import 'server-only';
import { randomUUID, createHmac } from 'node:crypto';
import { cookies } from 'next/headers';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getRequestSession } from '@/lib/raw-session';
import { appendAudit } from './audit';
import { createTestSessionService, TestContextError, type RequestIdentity } from './test-session';
export const TEST_COOKIE = 'spoodly-test-session';
const userSelect = {
  id: true, role: true, isDemo: true, emailVerified: true, suspendedAt: true, deletingAt: true, passwordHash: true, authVersion: true, emailChangeVersion: true, adminVersion: true, testContextVersion: true, name: true, demoPlan: true
} as const;
const secret = () => {
  const value = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!value)
    throw Error('Authentication unavailable.');
  return value;
};
export function anonymousMutationContext() {
  return createHmac('sha256', secret()).update('anonymous-mutation-context-v1').digest('hex');
}
export async function hasTestCookie() {
  return !!(await cookies()).get(TEST_COOKIE)?.value;
}
export async function denyTestContext() {
  if (await hasTestCookie())
    throw new TestContextError();
}
export async function auditTestMutation(identity: RequestIdentity, action: string, result: string, tx: Prisma.TransactionClient = prisma) {
  if (identity.testSessionId)
    await appendAudit(tx, {
      actorId: identity.actorId, targetId: identity.effectiveUserId, action, reason: 'Demo testing', changes: {
        testSessionId: identity.testSessionId, result
      }
    });
}
export function testSessionService(db: Prisma.TransactionClient = prisma) {
  return createTestSessionService({
    secret: secret(), ownerId: process.env.ADMIN_OWNER_ID, now: Date.now,
    readSession: async () => (await getRequestSession())?.user,
    readToken: async () => (await cookies()).get(TEST_COOKIE)?.value,
    readUser: async (id) => db.user.findUnique({
      where: {
        id
      }, select: userSelect
    }),
    readOwner: async () => {
      const binding = await db.protectedOwner.findUnique({
        where: {
          id: 1
        }, include: {
          user: {
            select: userSelect
          }
        }
      });
      return binding?.user ?? null;
    },
    readActiveTests: async (actorId) => db.adminTestSession.findMany({
      where: { actorId, endedAt: null }
    }),
    readTest: async (tokenHash) => db.adminTestSession.findUnique({
      where: {
        tokenHash
      }
    }),
    insertTest: async (row) => {
      const expired = await db.adminTestSession.findMany({
        where: {
          actorId: row.actorId, endedAt: null, expiresAt: {
            lte: new Date()
          }
        }
      });
      for (const old of expired) {
        const ended = await db.adminTestSession.updateMany({
          where: {
            id: old.id, endedAt: null
          }, data: {
            endedAt: new Date()
          }
        });
        if (ended.count) await appendAudit(db, {
          actorId: old.actorId, targetId: old.targetId, action: 'test.expired', reason: 'Demo testing', changes: {
            testSessionId: old.id
          }
        });
      }
      await db.adminTestSession.create({
        data: row
      });
    },
    endTest: async (id, reason) => {
      const work = async (tx: Prisma.TransactionClient) => {
        const row = await tx.adminTestSession.findUnique({
          where: {
            id
          }
        });
        if (!row)
          return;
        const changed = await tx.adminTestSession.updateMany({
          where: {
            id, endedAt: null
          }, data: {
            endedAt: new Date()
          }
        });
        if (changed.count)
          await appendAudit(tx, {
            actorId: row.actorId, targetId: row.targetId, action: `test.${reason}`, reason: 'Demo testing', changes: {
              testSessionId: id
            }
          });
      };
      if (db === prisma)
        await prisma.$transaction(work);
      else
        await work(db);
    },
    rotateContext: async (id) => {
      await db.user.update({
        where: {
          id
        }, data: {
          testContextVersion: randomUUID()
        }
      });
    },
    writeToken: async (token) => {
      const jar = await cookies();
      if (token)
        jar.set(TEST_COOKIE, token, {
          httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 3600
        });
      else
        jar.delete(TEST_COOKIE);
    },
    audit: async (action, actorId, targetId, testSessionId) => appendAudit(db, {
      actorId, targetId, action, reason: 'Demo testing', changes: {
        testSessionId
      }
    }),
  });
}
export async function resolveRequestIdentity() {
  const service = testSessionService();
  const identity = await service.resolve();
  // Browser cookie expiry must still produce a terminal audit on the next request.
  if (identity && !identity.testSessionId) {
    await prisma.$transaction(async (tx) => {
      const expired = await tx.adminTestSession.findMany({
        where: {
          actorId: identity.actorId, endedAt: null, expiresAt: {
            lte: new Date()
          }
        }
      });
      for (const row of expired) {
        const ended = await tx.adminTestSession.updateMany({
          where: {
            id: row.id, endedAt: null
          }, data: {
            endedAt: new Date()
          }
        });
        if (ended.count)
          await appendAudit(tx, {
            actorId: row.actorId, targetId: row.targetId, action: 'test.expired', reason: 'Demo testing', changes: {
              testSessionId: row.id
            }
          });
      }
    });
  }
  return identity;
}
export async function startTestSession(actor: {
  id: string;
}, demoId: string) {
  await prisma.$transaction(async (tx) => {
    for (const id of [...new Set([actor.id, demoId])].sort())
      await tx.$queryRaw `SELECT "id" FROM "User" WHERE "id" = ${id} FOR UPDATE`;
    await testSessionService(tx).start(actor.id, demoId);
  });
}
export async function stopTestSession() {
  const session = await getRequestSession();
  await prisma.$transaction(async (tx) => {
    if (session?.user?.id) {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${session.user.id} FOR UPDATE`;
    }
    await testSessionService(tx).stop();
  });
}
/** Also covers direct Auth.js sign-out, outside our logout Server Action. */
export async function revokeTestSessionsForActor(actorId: string) {
  await prisma.$transaction(async (tx) => {
    const rows = await tx.adminTestSession.findMany({
      where: {
        actorId, endedAt: null
      }
    });
    for (const row of rows) {
      const changed = await tx.adminTestSession.updateMany({
        where: {
          id: row.id, endedAt: null
        }, data: {
          endedAt: new Date()
        }
      });
      if (changed.count)
        await appendAudit(tx, {
          actorId, targetId: row.targetId, action: 'test.ended', reason: 'Actor signed out', changes: {
            testSessionId: row.id
          }
        });
    }
    await tx.user.updateMany({
      where: {
        id: actorId
      }, data: {
        testContextVersion: randomUUID()
      }
    });
  });
  (await cookies()).delete(TEST_COOKIE);
}
