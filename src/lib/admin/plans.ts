import 'server-only';
import type { Prisma } from '@prisma/client';
import { appendAudit } from './audit';
import { effectiveSubscriptionWhere } from './legacy-entitlements';

export type PlanType = 'STANDARD' | 'CUSTOM' | 'INTERNAL';
export type BillingInterval = 'MONTHLY' | 'ANNUAL';
export type PlanInput = { name: string; description: string; planType: PlanType;
  maxSpiders: number | null; active: boolean; public: boolean };
export type BillingOptionInput = { interval: BillingInterval; basePriceCents: number; active: boolean };
export type PlanSummary = {
  id: string; name: string; description: string; planType: PlanType;
  maxSpiders: number | null; active: boolean; public: boolean; sortOrder: number; updatedAt: Date;
  billingOptionCount: number; enabledFeatureCount: number; subscriptionCount: number;
  billingOptions: Array<{ id: string; interval: BillingInterval; basePriceCents: number; active: boolean }>;
};
type PlansDb = Pick<Prisma.TransactionClient, 'plan' | 'planBillingOption' | 'featurePlanTranslation' | 'userSubscription'>;
/** appendAudit accepts the full client; plan services only need these delegates. */
const auditTx = (tx: PlansDb): Prisma.TransactionClient => tx as Prisma.TransactionClient;

const PLAN_TYPES: readonly PlanType[] = ['STANDARD', 'CUSTOM', 'INTERNAL'];
const INTERVALS: readonly BillingInterval[] = ['MONTHLY', 'ANNUAL'];
// Mirrors the audit allowlist's text rules so audited plan names never bounce late.
const unsafeText = /[\u0000-\u001f\u007f@]/;

export function validatePlanInput(input: { name: string; description: string; planType: string;
  maxSpiders: number | null; active: boolean; public: boolean }): PlanInput | Error {
  const name = input.name.trim();
  if (!name || name.length > 80 || unsafeText.test(name))
    return new Error('Enter a plan name of 1–80 characters without @ or control characters.');
  // Descriptions are optional: blank input is stored as an empty string.
  const description = input.description.trim();
  if (description.length > 500 || unsafeText.test(description))
    return new Error('Enter a description of at most 500 characters without @ or control characters.');
  if (!PLAN_TYPES.includes(input.planType as PlanType))
    return new Error('Choose a plan type: standard, custom, or internal.');
  // Only null (unlimited) or a positive integer spood allowance is accepted.
  if (input.maxSpiders !== null &&
      (!Number.isInteger(input.maxSpiders) || input.maxSpiders <= 0))
    return new Error('Set a positive whole spood allowance, or leave it empty for unlimited.');
  if (typeof input.active !== 'boolean' || typeof input.public !== 'boolean')
    return new Error('Choose release and visibility states.');
  return { name, description, planType: input.planType as PlanType,
    maxSpiders: input.maxSpiders, active: input.active, public: input.public };
}

export function validateBillingOptionInput(input: { interval: string; basePriceCents: number;
  active: boolean }, context: { activeIntervals?: readonly string[] } = {}): BillingOptionInput | Error {
  if (!INTERVALS.includes(input.interval as BillingInterval))
    return new Error('Choose a billing interval: monthly or annual.');
  if (!Number.isInteger(input.basePriceCents) || input.basePriceCents < 0)
    return new Error('Enter a whole, nonnegative price in cents.');
  if (typeof input.active !== 'boolean') return new Error('Choose active or inactive.');
  // Service-layer enforcement of one active option per (planId, interval); a
  // deactivated row may be replaced by a newly active one at any time.
  if (input.active && context.activeIntervals?.includes(input.interval))
    return new Error('An active billing option already exists for that interval. Deactivate it first.');
  return { interval: input.interval as BillingInterval, basePriceCents: input.basePriceCents, active: input.active };
}

/** Pure branch decision: history forces deactivation, a clean slate may be deleted. */
export function deleteActionFor(historyCount: number): 'deactivated' | 'deleted' {
  if (!Number.isInteger(historyCount) || historyCount < 0) throw new Error('Invalid history count.');
  return historyCount > 0 ? 'deactivated' : 'deleted';
}

/** Effective-subscription history on a plan: any row whose status is
 * TRIALING/ACTIVE/PAST_DUE and not expired forces deactivation over deletion. */
export async function planHistoryCount(tx: Pick<PlansDb, 'userSubscription'>,
  planId: string): Promise<number> {
  return tx.userSubscription.count({ where: { planId, ...effectiveSubscriptionWhere() } });
}

async function loadPlan(tx: PlansDb, planId: string) {
  if (!planId || planId.length > 128) throw new Error('A valid plan is required.');
  const row = await tx.plan.findUnique({ where: { id: planId }, include: { billingOptions: true } });
  if (!row) throw new Error('That plan no longer exists. Reload the catalog.');
  return row;
}

/** Creates an inactive, non-public plan. Audits plan.create. */
export async function createPlan(tx: PlansDb, actorId: string, input: { name: string;
  description: string; planType: string; maxSpiders: number | null; active: boolean; public: boolean },
  reason: string): Promise<string | Error> {
  const validated = validatePlanInput(input);
  if (validated instanceof Error) return validated;
  const sortOrder = (await tx.plan.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
  const row = await tx.plan.create({ data: { ...validated, sortOrder: sortOrder + 1 } });
  await appendAudit(auditTx(tx), { actorId, targetId: row.id, action: 'plan.create', reason,
    changes: { planName: validated.name, planType: validated.planType,
      maxSpiders: validated.maxSpiders, active: validated.active, public: validated.public } });
  return row.id;
}

/** Audits plan.update; public-visibility changes record public/previousPublic. */
export async function updatePlan(tx: PlansDb, actorId: string, planId: string,
  input: { name: string; description: string; planType: string; maxSpiders: number | null;
    active: boolean; public: boolean }, reason: string): Promise<'updated' | Error> {
  const row = await loadPlan(tx, planId);
  const validated = validatePlanInput(input);
  if (validated instanceof Error) return validated;
  const changes: Record<string, string | number | boolean | null> = {};
  const changed: string[] = [];
  if (row.name !== validated.name) { changed.push('name'); changes.planName = validated.name; }
  if (row.description !== validated.description) changed.push('description');
  if (row.planType !== validated.planType) { changed.push('planType'); changes.planType = validated.planType; }
  if (row.maxSpiders !== validated.maxSpiders) { changed.push('maxSpiders'); changes.maxSpiders = validated.maxSpiders; }
  if (row.active !== validated.active) { changed.push('active'); changes.previousActive = row.active; changes.active = validated.active; }
  if (row.public !== validated.public) { changed.push('public'); changes.previousPublic = row.public; changes.public = validated.public; }
  if (changed.length === 0) return new Error('No plan changes were entered.');
  if (!changes.planName) changes.planName = row.name;
  changes.fieldsChanged = changed.join(',');
  await tx.plan.update({ where: { id: planId }, data: validated });
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.update', reason, changes });
  return 'updated';
}

/** Copies identity (suffixed " (copy)", inactive, not public), billing options,
 * and feature translations (same featureId + enabled values), so a duplicate is
 * a true starting point rather than a blank matrix. Audits plan.duplicate. */
export async function duplicatePlan(tx: PlansDb, actorId: string, planId: string,
  reason: string): Promise<string | Error> {
  const row = await loadPlan(tx, planId);
  const translations = await tx.featurePlanTranslation.findMany({ where: { planId } });
  const base = row.name.length > 73 ? row.name.slice(0, 73) : row.name;
  const name = `${base} (copy)`;
  const sortOrder = (await tx.plan.aggregate({ _max: { sortOrder: true } }))._max.sortOrder ?? -1;
  const created = await tx.plan.create({ data: { name, description: row.description, planType: row.planType,
    maxSpiders: row.maxSpiders, active: false, public: false, sortOrder: sortOrder + 1 } });
  for (const option of row.billingOptions)
    await tx.planBillingOption.create({ data: { planId: created.id, interval: option.interval,
      basePriceCents: option.basePriceCents, active: option.active, sortOrder: option.sortOrder } });
  for (const translation of translations)
    await tx.featurePlanTranslation.create({ data: { planId: created.id,
      featureId: translation.featureId, enabled: translation.enabled } });
  await appendAudit(auditTx(tx), { actorId, targetId: created.id, action: 'plan.duplicate', reason,
    changes: { planName: created.name } });
  return created.id;
}

/** Internal engine for deletePlan, split out so the guarded branch is testable
 * before the UserSubscription table exists. Audits plan.delete on both branches. */
export async function deletePlanWithHistory(tx: PlansDb, actorId: string, planId: string,
  reason: string, historyCount: number): Promise<'deactivated' | 'deleted' | Error> {
  const row = await loadPlan(tx, planId);
  const action = deleteActionFor(historyCount);
  if (action === 'deactivated') {
    await tx.plan.update({ where: { id: planId }, data: { active: false } });
  } else {
    await tx.plan.delete({ where: { id: planId } });
  }
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.delete', reason,
    changes: { planName: row.name, result: action } });
  return action;
}

/** Plans with any subscription history are deactivated, never deleted. */
export async function deletePlan(tx: PlansDb, actorId: string, planId: string,
  reason: string): Promise<'deactivated' | 'deleted' | Error> {
  return deletePlanWithHistory(tx, actorId, planId, reason, await planHistoryCount(tx, planId));
}

/** Adds or updates the row for one interval, rejecting a second active option
 * of an existing interval. Audits plan.billing_options. */
export async function saveBillingOption(tx: PlansDb, actorId: string, planId: string,
  input: { interval: string; basePriceCents: number; active: boolean },
  reason: string): Promise<'saved' | Error> {
  const row = await loadPlan(tx, planId);
  const existing = await tx.planBillingOption.findMany({ where: { planId } });
  // The check covers the submitted interval too: an active row must be
  // deactivated before a new active option for the same interval is accepted.
  const validated = validateBillingOptionInput(input,
    { activeIntervals: existing.filter(option => option.active).map(option => option.interval) });
  if (validated instanceof Error) return validated;
  const existingRow = existing.find(option => option.interval === validated.interval);
  if (existingRow) {
    if (existingRow.basePriceCents === validated.basePriceCents && existingRow.active === validated.active)
      return new Error('No billing option changes were entered.');
    await tx.planBillingOption.update({ where: { id: existingRow.id },
      data: { basePriceCents: validated.basePriceCents, active: validated.active } });
  } else {
    const sortOrder = Math.max(-1, ...existing.map(option => option.sortOrder));
    await tx.planBillingOption.create({ data: { planId, interval: validated.interval,
      basePriceCents: validated.basePriceCents, active: validated.active, sortOrder: sortOrder + 1 } });
  }
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.billing_options', reason,
    changes: { planName: row.name, billingInterval: validated.interval,
      basePriceCents: validated.basePriceCents, active: validated.active } });
  return 'saved';
}

/** Toggles one billing option row; activation respects the one-active-per-interval rule. */
export async function setBillingOptionActive(tx: PlansDb, actorId: string, planId: string,
  optionId: string, active: boolean, reason: string): Promise<'saved' | Error> {
  const row = await loadPlan(tx, planId);
  const option = row.billingOptions.find(candidate => candidate.id === optionId);
  if (!option) return new Error('That billing option no longer exists. Reload the editor.');
  if (active) {
    const clash = row.billingOptions.some(candidate =>
      candidate.active && candidate.interval === option.interval && candidate.id !== optionId);
    if (clash) return new Error('An active billing option already exists for that interval. Deactivate it first.');
  }
  if (option.active === active) return new Error('The billing option is already in that state. Reload the editor.');
  await tx.planBillingOption.update({ where: { id: optionId }, data: { active } });
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.billing_options', reason,
    changes: { planName: row.name, billingInterval: option.interval,
      basePriceCents: option.basePriceCents, active } });
  return 'saved';
}

/** Swaps sortOrder with the adjacent plan; the list order is the edit surface. */
export async function reorderPlan(tx: PlansDb, actorId: string, planId: string,
  direction: 'up' | 'down', reason: string): Promise<'moved' | Error> {
  if (direction !== 'up' && direction !== 'down') return new Error('Choose to move the plan up or down.');
  const row = await loadPlan(tx, planId);
  const plans = await tx.plan.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  const index = plans.findIndex(candidate => candidate.id === planId);
  if (index < 0) return new Error('That plan no longer exists. Reload the catalog.');
  const neighbor = direction === 'up' ? plans[index - 1] : plans[index + 1];
  if (!neighbor) return new Error('The plan is already at that end of the list.');
  await tx.plan.update({ where: { id: planId }, data: { sortOrder: neighbor.sortOrder } });
  await tx.plan.update({ where: { id: neighbor.id }, data: { sortOrder: row.sortOrder } });
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.update', reason,
    changes: { planName: row.name, fieldsChanged: 'sortOrder' } });
  return 'moved';
}

/** Bulk support: flips release/visibility flags on one plan with a derived
 * reason. A plan already in the requested state is still audited (one entry
 * per plan per bulk action) with fieldsChanged 'none'. Audits plan.update. */
export async function setPlanFlags(tx: PlansDb, actorId: string, planId: string,
  flags: { active?: boolean; public?: boolean }, reason: string): Promise<'updated' | Error> {
  const row = await loadPlan(tx, planId);
  const data: { active?: boolean; public?: boolean } = {};
  const changes: Record<string, string | number | boolean | null> = {};
  const changed: string[] = [];
  if (flags.active !== undefined && flags.active !== row.active) {
    data.active = flags.active; changed.push('active');
    changes.previousActive = row.active; changes.active = flags.active;
  }
  if (flags.public !== undefined && flags.public !== row.public) {
    data.public = flags.public; changed.push('public');
    changes.previousPublic = row.public; changes.public = flags.public;
  }
  if (Object.keys(data).length > 0) await tx.plan.update({ where: { id: planId }, data });
  changes.planName = row.name;
  changes.fieldsChanged = changed.length > 0 ? changed.join(',') : 'none';
  await appendAudit(auditTx(tx), { actorId, targetId: planId, action: 'plan.update', reason, changes });
  return 'updated';
}

/** Billing-option, enabled-feature, and subscription counts (real queries),
 * filtered server-side by a case-insensitive name search and paged by offset. */
export type ListPlansQuery = { search?: string; page: number; pageSize: number };
export async function listPlans(tx: PlansDb, query: ListPlansQuery):
  Promise<{ plans: PlanSummary[]; total: number }> {
  const page = Math.max(1, Math.trunc(query.page) || 1);
  const pageSize = Math.max(1, Math.trunc(query.pageSize) || 1);
  const search = (query.search ?? '').trim();
  const where: Prisma.PlanWhereInput = search
    ? { name: { contains: search, mode: 'insensitive' } } : {};
  const [rows, total] = await Promise.all([
    tx.plan.findMany({ where, include: { billingOptions: true, featureTranslations: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * pageSize, take: pageSize }),
    tx.plan.count({ where }),
  ]);
  const effectiveSubscriptions = await tx.userSubscription.findMany({
    where: effectiveSubscriptionWhere(), select: { planId: true } });
  const subscriptionCounts = new Map<string, number>();
  for (const row of effectiveSubscriptions)
    subscriptionCounts.set(row.planId, (subscriptionCounts.get(row.planId) ?? 0) + 1);
  return { total, plans: rows.map(row => ({
    id: row.id, name: row.name, description: row.description,
    planType: row.planType as PlanType, maxSpiders: row.maxSpiders,
    active: row.active, public: row.public, sortOrder: row.sortOrder, updatedAt: row.updatedAt,
    billingOptionCount: row.billingOptions.length,
    enabledFeatureCount: row.featureTranslations.filter(translation => translation.enabled).length,
    subscriptionCount: subscriptionCounts.get(row.id) ?? 0,
    billingOptions: row.billingOptions.map(option => ({ id: option.id,
      interval: option.interval as BillingInterval,
      basePriceCents: option.basePriceCents, active: option.active })),
  })) };
}
