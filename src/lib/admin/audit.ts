import 'server-only';
import type { Prisma } from '@prisma/client';
export type AuditInput = { actorId: string; targetId: string | null; action: string;
  reason: string; changes: Record<string, string | number | boolean | null> };
// Extend deliberately at each service integration. Profile edits record field names,
// not names, emails, private notes, credentials, provider payloads or token values.
const safeFields = new Set(['role', 'previousRole', 'suspended', 'isDemo', 'demoPlan', 'previousDemoPlan', 'previousIsDemo', 'demoLabel', 'previousDemoLabel',
  'fieldsChanged', 'status', 'previousStatus', 'provider', 'operationId', 'deletedCount', 'cutoff',
  'spiderCount', 'photoCount', 'eventCount', 'subscriptionPresent', 'announcementEnabled',
  'maintenanceDeadline', 'version', 'result', 'method', 'phase', 'testSessionId',
  'featureKey', 'name', 'category', 'active', 'previousActive',
  'planName', 'planType', 'public', 'previousPublic', 'maxSpiders', 'basePriceCents', 'billingInterval', 'subscriptionCount',
  'featureCount', 'enabledCount', 'previousEnabledCount']);
function safeText(value: string, max: number) {
  return value.length <= max && !/[\u0000-\u001f\u007f@]/.test(value) &&
    !/(?:bearer\s|password\s*[:=]|secret\s*[:=]|token\s*[:=]|\$2[aby]\$|eyJ[A-Za-z0-9_-]+\.)/i.test(value);
}
export async function appendAudit(tx: Prisma.TransactionClient, input: AuditInput): Promise<void> {
  if (!/^[a-z][a-z0-9_.-]{1,79}$/.test(input.action) || !input.actorId || input.actorId.length > 128 ||
      (input.targetId !== null && (!input.targetId || input.targetId.length > 128)) ||
      !input.reason.trim() || !safeText(input.reason, 500) || Object.keys(input.changes).length > 20) {
    throw new Error('Invalid audit metadata. Use a short reason without personal information or secrets.');
  }
  for (const [key, value] of Object.entries(input.changes)) {
    if (!safeFields.has(key) || !(value === null || typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)) ||
        (typeof value === 'string' && safeText(value, 200)))) throw new Error('Unsafe audit metadata.');
  }
  await tx.adminAudit.create({ data: { ...input, reason: input.reason.trim(), changes: input.changes } });
}
export type AuditQuery = { limit?: number; actorId?: string; targetId?: string; action?: string;
  cursor?: { id: string; createdAt: string } };
/** Caller must authorize first. Cursor tuple keeps pagination valid after retention deletes. */
export async function queryAudit(tx: Prisma.TransactionClient, input: AuditQuery = {}) {
  const limit = Number.isFinite(input.limit) ? Math.max(1, Math.min(100, Math.floor(input.limit!))) : 30;
  const where: Prisma.AdminAuditWhereInput = {};
  for (const key of ['actorId', 'targetId', 'action'] as const) {
    if (input[key]) { if (input[key]!.length > 128) throw new Error('Invalid audit filter.'); where[key] = input[key]; }
  }
  if (input.cursor) {
    const createdAt = new Date(input.cursor.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || !input.cursor.id || input.cursor.id.length > 128) throw new Error('Invalid audit cursor.');
    where.OR = [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: input.cursor.id } }];
  }
  const rows = await tx.adminAudit.findMany({ where, take: limit + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return { items, nextCursor: rows.length > limit && last ? { id: last.id, createdAt: last.createdAt.toISOString() } : null };
}
/** Must run inside the authorized caller's transaction; failed receipt rolls back deletion. */
export async function cleanupAudit(tx: Prisma.TransactionClient, actorId: string, now: Date): Promise<number> {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid retention time.');
  const cutoff = new Date(now);
  cutoff.setUTCDate(1);
  cutoff.setUTCFullYear(now.getUTCFullYear() - 1);
  const lastDay = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth() + 1, 0)).getUTCDate();
  cutoff.setUTCDate(Math.min(now.getUTCDate(), lastDay));
  const { count } = await tx.adminAudit.deleteMany({ where: { createdAt: { lt: cutoff } } });
  await appendAudit(tx, { actorId, targetId: null, action: 'audit.cleanup', reason: 'Twelve-month retention cleanup',
    changes: { deletedCount: count, cutoff: cutoff.toISOString() } });
  return count;
}
