import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { withAdminControl } from './actor';
import { appendAudit } from './audit';
import { MaintenanceError, maintenanceMode, type MaintenanceState } from './maintenance-policy';
/** Deliberately uncached. Missing singleton means unavailable, never open. */
export async function readMaintenanceState(db: Pick<Prisma.TransactionClient, 'siteSettings'> = prisma): Promise<MaintenanceState> {
  try {
    const state = await db.siteSettings.findUnique({ where: { id: 1 } });
    if (!state)
      throw new MaintenanceError();
    return state;
  }
  catch {
    throw new MaintenanceError();
  }
}
export type FeatureTelemetrySink = 'off' | 'posthog';
type SettingsRow = MaintenanceState & { featureTelemetrySink?: string };
async function change(actor: {
  id: string;
}, version: number, update: (current: SettingsRow) => Partial<SettingsRow>, action: string) {
  if (!Number.isSafeInteger(version) || version < 0)
    throw Error('Invalid maintenance version.');
  await withAdminControl(async (tx, live) => {
    if (live.id !== actor.id)
      throw Error('Administrator identity changed.');
    const current: SettingsRow = await readMaintenanceState(tx);
    if (current.version !== version)
      throw Error('Maintenance settings changed. Reload before trying again.');
    const data = update(current);
    const changed = await tx.siteSettings.updateMany({
      where: { id: 1, version },
      data: { ...data, version: { increment: 1 }, updatedBy: live.id }
    });
    if (changed.count !== 1)
      throw Error('Maintenance settings changed. Reload before trying again.');
    await appendAudit(tx, {
      actorId: live.id, targetId: null, action, reason: 'Maintenance control',
      changes: {
        version: version + 1, maintenanceDeadline: (data.deadline === undefined ? current.deadline : data.deadline)?.toISOString() ?? null,
        announcementEnabled: data.announcementEnabled ?? current.announcementEnabled,
        ...(data.featureTelemetrySink === undefined ? {} : {
          featureTelemetrySinkFrom: current.featureTelemetrySink ?? 'off', featureTelemetrySinkTo: data.featureTelemetrySink
        })
      }
    });
  });
}
export async function setMaintenance(actor: {
  id: string;
}, version: number, operation: 'start' | 'cancel' | 'reopen'): Promise<void> {
  if (!['start', 'cancel', 'reopen'].includes(operation))
    throw Error('Invalid maintenance control.');
  await change(actor, version, current => {
    const now = new Date();
    const mode = maintenanceMode(current, now);
    if (operation === 'cancel' && mode !== 'countdown')
      throw Error('The save window has ended. Reload and confirm reopening separately.');
    if (operation === 'reopen' && mode !== 'active')
      throw Error('Reopening requires active maintenance. Reload current status.');
    return { deadline: operation === 'start' ? current.deadline ?? new Date(now.getTime() + 60000) : null };
  }, `maintenance.${operation}`);
}
export async function setAnnouncement(actor: {
  id: string;
}, version: number, enabled: boolean, message: string): Promise<void> {
  if (typeof enabled !== 'boolean' || typeof message !== 'string' || message.length > 500 || /[<>\u0000-\u001f\u007f]/.test(message) || (enabled && !message.trim()))
    throw Error('Enter a plain text announcement of 1–500 characters.');
  await change(actor, version, () => ({ announcementEnabled: enabled, announcement: message.trim() }), 'maintenance.announcement');
}
export async function setFeatureTelemetrySink(actor: {
  id: string;
}, version: number, sink: FeatureTelemetrySink): Promise<void> {
  if (sink !== 'off' && sink !== 'posthog')
    throw Error('Invalid feature telemetry sink.');
  await change(actor, version, () => ({ featureTelemetrySink: sink }), 'maintenance.telemetry_sink');
}
