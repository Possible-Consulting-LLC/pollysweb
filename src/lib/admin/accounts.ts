import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { canManage, type Actor, type AdminOperation, type AdminRole, type Target } from './policy';
import { remainingSignInAvailable } from '../social-disconnect-policy';
import { effectivePro } from '../effective-entitlement';
import { effectiveProWhere } from '../effective-entitlement-query';

export type AccountPatch = { name?: string; timezone?: string; dateFormat?: string;
  measurement?: string; theme?: string; feedDefaultDays?: number;
  mistDefaultDays?: number; cleanDefaultDays?: number };
export type FacebookProvenanceReview = { name: 'independent' | 'remove'; image: 'independent' | 'remove'; email: 'independent_verified' };
export class AccountInputError extends Error { constructor(message: string) { super(message); this.name = 'AccountInputError'; } }
export class AccountVersionError extends Error { constructor() { super('This account changed. Reload it before submitting again.'); this.name = 'AccountVersionError'; } }

/** Mirrors the complete account form. Empty timezone is the persisted "not chosen" schema default. */
export function accountPatchFromForm(form: Pick<FormData, 'get'>): AccountPatch {
  const value = (key: string) => String(form.get(key) ?? '').trim();
  return { name: value('name'), timezone: value('timezone'), dateFormat: value('dateFormat'),
    measurement: value('measurement'), theme: value('theme'), feedDefaultDays: Number(value('feedDefaultDays')),
    mistDefaultDays: Number(value('mistDefaultDays')), cleanDefaultDays: Number(value('cleanDefaultDays')) };
}

type PreparedEmailChange = { status: 'prepared'; token: string; tokenHash: string; previousEmail: string; previousEmailVerified: boolean } |
  { status: 'same' } | { status: 'unavailable' };
type AuditInput = { actorId: string; targetId: string | null; action: string; reason: string;
  changes: Record<string, string | number | boolean | null> };
type ServiceDependencies = {
  withMutation: <T>(targetId: string, operation: AdminOperation,
    work: (tx: Prisma.TransactionClient, actor: Actor, target: Target) => Promise<T>) => Promise<T>;
  appendAudit: (tx: Prisma.TransactionClient, input: AuditInput) => Promise<void>;
  prepareEmailChange: (tx: Prisma.TransactionClient, input: { userId: string; email: string; requestedByAdminId: string }) => Promise<PreparedEmailChange>;
  deliverEmailChange: (prepared: Extract<PreparedEmailChange, { status: 'prepared' }>, newEmail: string) => Promise<void>;
  cleanupEmailChange: (tokenHash: string) => Promise<void>;
  randomId: () => string;
  now: () => Date;
  configuredProviders: () => string[];
};

const patchFields = new Set<keyof AccountPatch>(['name', 'timezone', 'dateFormat', 'measurement', 'theme',
  'feedDefaultDays', 'mistDefaultDays', 'cleanDefaultDays']);
function reasonText(reason: string) {
  const value = reason.trim();
  if (!value || value.length > 500) throw new AccountInputError('Enter a reason up to 500 characters.');
  return value;
}
function accountVersion(version: number) {
  if (!Number.isSafeInteger(version) || version < 0) throw new AccountVersionError();
  return version;
}
function validatePatch(input: AccountPatch): AccountPatch {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AccountInputError('Invalid account changes.');
  const keys = Object.keys(input);
  if (!keys.length || keys.some(key => !patchFields.has(key as keyof AccountPatch))) throw new AccountInputError('Only profile and preference fields can be edited here.');
  const patch: AccountPatch = {};
  if ('name' in input) { if (typeof input.name !== 'string' || input.name.trim().length > 120) throw new AccountInputError('Invalid display name.'); patch.name = input.name.trim(); }
  if ('timezone' in input) { if (typeof input.timezone !== 'string') throw new AccountInputError('Invalid timezone.');
    if (input.timezone !== '') { try { new Intl.DateTimeFormat('en-US', { timeZone: input.timezone }); } catch { throw new AccountInputError('Invalid timezone.'); } }
    patch.timezone = input.timezone; }
  if ('dateFormat' in input) { if (typeof input.dateFormat !== 'string' || !['MMM d, yyyy', 'd MMM yyyy', 'yyyy-MM-dd'].includes(input.dateFormat)) throw new AccountInputError('Invalid date format.'); patch.dateFormat = input.dateFormat; }
  if ('measurement' in input) { if (input.measurement !== 'imperial' && input.measurement !== 'metric') throw new AccountInputError('Invalid measurement preference.'); patch.measurement = input.measurement; }
  if ('theme' in input) { if (!['system', 'cosmic', 'midnight'].includes(String(input.theme))) throw new AccountInputError('Invalid theme.'); patch.theme = input.theme; }
  for (const key of ['feedDefaultDays', 'mistDefaultDays', 'cleanDefaultDays'] as const) if (key in input) {
    const value = input[key]; if (!Number.isInteger(value) || value! < 1 || value! > 365) throw new AccountInputError('Care intervals must be whole days from 1 to 365.'); patch[key] = value;
  }
  return patch;
}
function assertBoundary(requestedActor: Actor, liveActor: Actor, requestedTargetId: string, target: Target, operation: AdminOperation) {
  if (!requestedActor?.id || requestedActor.id !== liveActor.id) throw new AccountInputError('Administrator identity changed.');
  if (target.id !== requestedTargetId) throw new AccountInputError('The locked target does not match this request.');
  if (!canManage(liveActor, target, operation)) throw new AccountInputError('This account cannot be changed by this administrator.');
}

export function createAccountAdminService(deps: ServiceDependencies) {
  async function updateAccount(actor: Actor, targetId: string, version: number, input: AccountPatch, reason: string): Promise<void> {
    const patch = validatePatch(input), why = reasonText(reason), expected = accountVersion(version);
    await deps.withMutation(targetId, 'edit', async (tx, liveActor, target) => {
      assertBoundary(actor, liveActor, targetId, target, 'edit');
      const current = await tx.user.findUnique({ where: { id: targetId }, select: { id: true, accountVersion: true } });
      if (!current || current.accountVersion !== expected) throw new AccountVersionError();
      const updated = await tx.user.updateMany({ where: { id: targetId, accountVersion: expected }, data: { ...patch, accountVersion: { increment: 1 } } });
      if (updated.count !== 1) throw new AccountVersionError();
      await deps.appendAudit(tx, { actorId: liveActor.id, targetId, action: 'account.profile.updated', reason: why,
        changes: { fieldsChanged: Object.keys(patch).sort().join(','), version: expected + 1 } });
    });
  }

  async function requestAdminEmailChange(actor: Actor, targetId: string, email: string, reason = 'Administrator requested verified email change'): Promise<void> {
    const normalized = email.trim().toLowerCase(), why = reasonText(reason);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) throw new AccountInputError('Enter a valid email address.');
    const prepared = await deps.withMutation(targetId, 'edit', async (tx, liveActor, target) => {
      assertBoundary(actor, liveActor, targetId, target, 'edit');
      const result = await deps.prepareEmailChange(tx, { userId: targetId, email: normalized, requestedByAdminId: liveActor.id });
      if (result.status === 'same') throw new AccountInputError('Enter a different email address.');
      if (result.status === 'unavailable') throw new AccountInputError('That email address is unavailable.');
      await deps.appendAudit(tx, { actorId: liveActor.id, targetId, action: 'account.email_change.requested', reason: why, changes: { result: 'pending_confirmation' } });
      return result;
    });
    try { await deps.deliverEmailChange(prepared, normalized); }
    catch (error) { await deps.cleanupEmailChange(prepared.tokenHash); throw error; }
  }

  async function setSuspended(actor: Actor, targetId: string, version: number, suspended: boolean, reason: string): Promise<void> {
    const expected = accountVersion(version), why = reasonText(reason);
    await deps.withMutation(targetId, 'suspend', async (tx, liveActor, target) => {
      assertBoundary(actor, liveActor, targetId, target, 'suspend');
      const current = await tx.user.findUnique({ where: { id: targetId }, select: { accountVersion: true, suspendedAt: true } });
      if (!current || current.accountVersion !== expected) throw new AccountVersionError();
      const updated = await tx.user.updateMany({ where: { id: targetId, accountVersion: expected }, data: { suspendedAt: suspended ? deps.now() : null,
        authVersion: deps.randomId(), emailChangeVersion: deps.randomId(), accountVersion: { increment: 1 } } });
      if (updated.count !== 1) throw new AccountVersionError();
      await Promise.all([tx.pendingEmailVerification.deleteMany({ where: { userId: targetId, consumedAt: null } }), tx.adminReauth.deleteMany({ where: { actorId: targetId } })]);
      await deps.appendAudit(tx, { actorId: liveActor.id, targetId, action: suspended ? 'account.suspended' : 'account.reinstated', reason: why,
        changes: { suspended, version: expected + 1 } });
    });
  }

  async function setRole(actor: Actor, targetId: string, version: number, role: AdminRole, reason: string): Promise<void> {
    const expected = accountVersion(version), why = reasonText(reason);
    if (!['user', 'admin', 'super_admin'].includes(role)) throw new AccountInputError('Invalid role.');
    await deps.withMutation(targetId, 'role', async (tx, liveActor, target) => {
      assertBoundary(actor, liveActor, targetId, target, 'role');
      const current = await tx.user.findUnique({ where: { id: targetId }, select: { accountVersion: true, role: true, emailVerified: true, isDemo: true } });
      if (!current || current.accountVersion !== expected) throw new AccountVersionError();
      if (role !== 'user' && (!current.emailVerified || current.isDemo)) throw new AccountInputError('Administrative roles require a verified, non-demo account.');
      const updated = await tx.user.updateMany({ where: { id: targetId, accountVersion: expected }, data: { role,
        authVersion: deps.randomId(), emailChangeVersion: deps.randomId(), accountVersion: { increment: 1 } } });
      if (updated.count !== 1) throw new AccountVersionError();
      await Promise.all([tx.pendingEmailVerification.deleteMany({ where: { userId: targetId, consumedAt: null } }), tx.adminReauth.deleteMany({ where: { actorId: targetId } })]);
      await deps.appendAudit(tx, { actorId: liveActor.id, targetId, action: 'account.role.updated', reason: why,
        changes: { previousRole: current.role, role, version: expected + 1 } });
    });
  }

  async function completeFacebookDeletion(actor: Actor, targetId: string, version: number, requestId: string,
    review: FacebookProvenanceReview, reason: string): Promise<void> {
    const expected = accountVersion(version), why = reasonText(reason);
    if (!requestId || review.name !== 'independent' && review.name !== 'remove' || review.image !== 'independent' && review.image !== 'remove' || review.email !== 'independent_verified')
      throw new AccountInputError('Complete every provenance review item.');
    await deps.withMutation(targetId, 'edit', async (tx, liveActor, target) => {
      assertBoundary(actor, liveActor, targetId, target, 'edit');
      await tx.$queryRaw`SELECT "id" FROM "FacebookDeletionRequest" WHERE "id" = ${requestId} FOR UPDATE`;
      const [request, current, methods] = await Promise.all([
        tx.facebookDeletionRequest.findUnique({ where: { id: requestId }, select: { id: true, userId: true, status: true } }),
        tx.user.findUnique({ where: { id: targetId }, select: { accountVersion: true, emailVerified: true, passwordHash: true, name: true, image: true } }),
        tx.account.findMany({ where: { userId: targetId }, select: { provider: true } }),
      ]);
      if (!request || request.userId !== targetId) throw new AccountInputError('The deletion request does not belong to this account.');
      if (request.status === 'completed') return;
      if (!current || current.accountVersion !== expected) throw new AccountVersionError();
      const providers = methods.map(method => method.provider);
      if (!remainingSignInAvailable('facebook', providers, deps.configuredProviders(), Boolean(current.passwordHash && current.emailVerified)))
        throw new AccountInputError('A different usable sign-in method is required before Facebook can be removed.');
      await tx.account.deleteMany({ where: { userId: targetId, provider: 'facebook' } });
      const remainingMethods = await tx.account.findMany({ where: { userId: targetId }, select: { provider: true } });
      if (remainingMethods.some(method => method.provider === 'facebook')) throw new AccountInputError('Facebook provider cleanup did not complete.');
      // The User lock still covers this transaction. Account DELETE triggers advance
      // its version once per link; compare subsequent writes against our own changes.
      const afterCleanup = await tx.user.findUnique({ where: { id: targetId }, select: { accountVersion: true } });
      if (!afterCleanup) throw new AccountVersionError();
      const identityChanged = providers.includes('facebook') ||
        (review.name === 'remove' && current.name !== null) || (review.image === 'remove' && current.image !== null);
      if (identityChanged) {
        const updated = await tx.user.updateMany({ where: { id: targetId, accountVersion: afterCleanup.accountVersion }, data: {
          ...(review.name === 'remove' ? { name: null } : {}), ...(review.image === 'remove' ? { image: null } : {}),
          authVersion: deps.randomId(), emailChangeVersion: deps.randomId(), accountVersion: { increment: 1 },
        } });
        if (updated.count !== 1) throw new AccountVersionError();
        await Promise.all([tx.pendingEmailVerification.deleteMany({ where: { userId: targetId, consumedAt: null } }), tx.adminReauth.deleteMany({ where: { actorId: targetId } })]);
      }
      const completed = await tx.facebookDeletionRequest.updateMany({ where: { id: requestId, userId: targetId, status: { not: 'completed' } }, data: { status: 'completed', completedAt: deps.now() } });
      if (completed.count !== 1) throw new AccountInputError('The deletion request changed while it was being completed.');
      // Invalidating bound email challenges can also advance the owned-write version.
      const final = await tx.user.findUnique({ where: { id: targetId }, select: { accountVersion: true } });
      if (!final) throw new AccountVersionError();
      await deps.appendAudit(tx, { actorId: liveActor.id, targetId, action: 'facebook.deletion.completed', reason: why,
        changes: { provider: 'facebook', status: 'completed', version: final.accountVersion } });
    });
  }
  return { updateAccount, requestAdminEmailChange, setSuspended, setRole, completeFacebookDeletion };
}

async function liveService() {
  const [{ withAdminMutation }, { appendAudit }, email, { prisma }, social] = await Promise.all([
    import('./actor'), import('./audit'), import('../email-challenge'), import('../db'), import('../social-auth'),
  ]);
  return createAccountAdminService({ withMutation: withAdminMutation, appendAudit,
    prepareEmailChange: email.prepareEmailChange,
    deliverEmailChange: email.deliverPreparedEmailChange,
    cleanupEmailChange: async tokenHash => { await prisma.pendingEmailVerification.deleteMany({ where: { tokenHash, consumedAt: null } }); },
    randomId: randomUUID, now: () => new Date(), configuredProviders: () => social.configuredSocialProviders(process.env) });
}
export async function updateAccount(actor: Actor, targetId: string, version: number, patch: AccountPatch, reason: string) {
  return (await liveService()).updateAccount(actor, targetId, version, patch, reason);
}
export async function requestAdminEmailChange(actor: Actor, targetId: string, email: string, reason?: string) {
  if (!(await import('../email-delivery')).emailDeliveryAvailable(email)) throw new AccountInputError('Email delivery is unavailable for this address.');
  return (await liveService()).requestAdminEmailChange(actor, targetId, email, reason);
}
export async function setAccountSuspended(actor: Actor, targetId: string, version: number, suspended: boolean, reason: string) {
  return (await liveService()).setSuspended(actor, targetId, version, suspended, reason);
}
export async function setAccountRole(actor: Actor, targetId: string, version: number, role: AdminRole, reason: string) {
  return (await liveService()).setRole(actor, targetId, version, role, reason);
}
export async function completeFacebookDeletion(actor: Actor, targetId: string, version: number, requestId: string, review: FacebookProvenanceReview, reason: string) {
  return (await liveService()).completeFacebookDeletion(actor, targetId, version, requestId, review, reason);
}

export type AccountSearchFilters = { query?: string; role?: AdminRole; demo?: boolean; verified?: boolean;
  suspended?: boolean; plan?: 'free' | 'pro'; cursor?: { createdAt: string; id: string }; limit?: number };
export async function searchAccounts(filters: AccountSearchFilters = {}) {
  const [{ requireAdminActor }, { prisma }] = await Promise.all([import('./actor'), import('../db')]);
  await requireAdminActor('admin');
  const take = Number.isSafeInteger(filters.limit) ? Math.max(1, Math.min(100, filters.limit!)) : 30;
  const query = filters.query?.trim().slice(0, 254);
  const where: Prisma.UserWhereInput = {};
  if (query) where.OR = [{ name: { contains: query, mode: 'insensitive' } }, { email: { contains: query, mode: 'insensitive' } }];
  if (filters.role) where.role = filters.role;
  if (filters.demo !== undefined) where.isDemo = filters.demo;
  if (filters.verified !== undefined) where.emailVerified = filters.verified ? { not: null } : null;
  if (filters.suspended !== undefined) where.suspendedAt = filters.suspended ? { not: null } : null;
  const and: Prisma.UserWhereInput[] = [];
  if (filters.plan) {
    const currentPro = effectiveProWhere(new Date());
    and.push(filters.plan === 'pro' ? currentPro : { NOT: currentPro });
  }
  if (filters.cursor) {
    const createdAt = new Date(filters.cursor.createdAt);
    if (!Number.isFinite(createdAt.getTime()) || !filters.cursor.id) throw new AccountInputError('Invalid account cursor.');
    and.push({ OR: [{ createdAt: { lt: createdAt } }, { createdAt, id: { lt: filters.cursor.id } }] });
  }
  if (and.length) where.AND = and;
  const rows = await prisma.user.findMany({ where, take: take + 1, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], select: {
    id: true, email: true, emailVerified: true, name: true, role: true, isDemo: true, demoPlan: true, demoLabel: true, suspendedAt: true, deletingAt: true,
    accountVersion: true, plan: true, stripeCustomerId: true, subscriptionStatus: true, billingLastCheckedAt: true, createdAt: true,
    _count: { select: { spiders: true, careDays: true } },
  } });
  const items = rows.slice(0, take).map(row => ({ ...row, entitlement: effectivePro(row) ? 'pro' as const : 'free' as const }));
  const last = items.at(-1);
  return { items, nextCursor: rows.length > take && last ? { createdAt: last.createdAt.toISOString(), id: last.id } : null };
}

export async function getAccountDetail(targetId: string) {
  const [{ requireAdminActor }, { prisma }] = await Promise.all([import('./actor'), import('../db')]);
  await requireAdminActor('admin');
  if (!targetId || targetId.length > 128) return null;
  const account = await prisma.user.findUnique({ where: { id: targetId }, select: {
    id: true, email: true, emailVerified: true, name: true, role: true, isDemo: true, demoPlan: true, demoLabel: true, suspendedAt: true, deletingAt: true,
    accountVersion: true, timezone: true, dateFormat: true, measurement: true, theme: true, feedDefaultDays: true,
    mistDefaultDays: true, cleanDefaultDays: true, plan: true, stripeCustomerId: true, stripeSubscriptionId: true,
    stripePriceId: true, subscriptionStatus: true, subscriptionCurrentPeriodEnd: true, billingLastCheckedAt: true,
    billingNextCheckAt: true, billingCheckFailures: true, createdAt: true, accounts: { select: { provider: true } },
    _count: { select: { spiders: true, careDays: true } },
  } });
  if (!account) return null;
  const ownerBinding = await prisma.protectedOwner.findUnique({ where: { id: 1 }, select: { userId: true } });
  const spiderWhere = { spider: { userId: targetId } };
  const [feedingCount, mistingCount, moltCount, observationCount, conditionCount, maintenanceCount,
    latestFeeding, latestMisting, latestMolt, latestObservation, latestCondition, latestMaintenance] = await Promise.all([
    prisma.feedingEvent.count({ where: spiderWhere }), prisma.mistingEvent.count({ where: spiderWhere }),
    prisma.moltEvent.count({ where: spiderWhere }), prisma.observationEvent.count({ where: spiderWhere }),
    prisma.bodyConditionEvent.count({ where: spiderWhere }),
    prisma.enclosureMaintenanceEvent.count({ where: { enclosure: { spider: { userId: targetId } } } }),
    prisma.feedingEvent.findFirst({ where: spiderWhere, orderBy: { date: 'desc' }, select: { date: true } }),
    prisma.mistingEvent.findFirst({ where: spiderWhere, orderBy: { date: 'desc' }, select: { date: true } }),
    prisma.moltEvent.findFirst({ where: spiderWhere, orderBy: { moltDate: 'desc' }, select: { moltDate: true } }),
    prisma.observationEvent.findFirst({ where: spiderWhere, orderBy: { date: 'desc' }, select: { date: true } }),
    prisma.bodyConditionEvent.findFirst({ where: spiderWhere, orderBy: { date: 'desc' }, select: { date: true } }),
    prisma.enclosureMaintenanceEvent.findFirst({ where: { enclosure: { spider: { userId: targetId } } }, orderBy: { date: 'desc' }, select: { date: true } }),
  ]);
  const latest = [latestFeeding?.date, latestMisting?.date, latestMolt?.moltDate, latestObservation?.date,
    latestCondition?.date, latestMaintenance?.date].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  return { ...account, owner: ownerBinding?.userId === account.id, entitlement: effectivePro(account) ? 'pro' as const : 'free' as const,
    care: { latest, feedingCount, mistingCount, moltCount, observationCount, conditionCount, maintenanceCount } };
}

export function stripeCustomerDashboardUrl(customerId: string | null, secret = process.env.STRIPE_SECRET_KEY): string | null {
  if (!customerId || !/^cus_[A-Za-z0-9]+$/.test(customerId)) return null;
  return `https://dashboard.stripe.com/${secret?.startsWith('sk_live_') ? '' : 'test/'}customers/${encodeURIComponent(customerId)}`;
}

export async function listAdminOperations() {
  const [{ requireAdminActor }, { prisma }] = await Promise.all([import('./actor'), import('../db')]);
  await requireAdminActor('admin');
  const [facebookRequests, billingFailures, checkoutIntents] = await Promise.all([
    prisma.facebookDeletionRequest.findMany({ where: { status: { not: 'completed' } }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], take: 100,
      select: { id: true, confirmationCode: true, status: true, createdAt: true, user: { select: { id: true, email: true, name: true,
        role: true, isDemo: true, accountVersion: true, emailVerified: true, accounts: { select: { provider: true } } } } } }),
    prisma.user.findMany({ where: { billingCheckFailures: { gt: 0 } }, orderBy: [{ billingCheckFailures: 'desc' }, { billingNextCheckAt: 'asc' }], take: 100,
      select: { id: true, email: true, name: true, stripeCustomerId: true, stripeSubscriptionId: true, subscriptionStatus: true,
        billingCheckFailures: true, billingLastCheckedAt: true, billingNextCheckAt: true, isDemo: true } }),
    prisma.billingCheckoutIntent.findMany({ orderBy: { createdAt: 'asc' }, take: 100, select: { id: true, userId: true, phase: true, createdAt: true } }),
  ]);
  return { facebookRequests, checkoutIntents: checkoutIntents.map(intent => ({ ...intent, recoveryExpired: Date.now() - intent.createdAt.getTime() >= 23 * 60 * 60 * 1000 })), billingFailures: billingFailures.map(row => ({ ...row, dashboardUrl: stripeCustomerDashboardUrl(row.stripeCustomerId) })) };
}
