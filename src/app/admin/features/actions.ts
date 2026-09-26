'use server';

import { revalidatePath } from 'next/cache';
import { withMutation } from '@/lib/mutation-boundary';
import { withAdminControl } from '@/lib/admin/actor';
import { appendAudit } from '@/lib/admin/audit';
import { syncFeatureRegistry } from '@/lib/admin/feature-sync';
import { isRegisteredFeatureKey } from '@/lib/features/registry';
import { MaintenanceError } from '@/lib/admin/maintenance-policy';

type Result = { error?: string; success?: boolean };

const value = (form: FormData, key: string) => String(form.get(key) ?? '').trim();
// Mirrors the audit allowlist's text rules so audited values never bounce late.
const metadataUnsafe = /[\u0000-\u001f\u007f@]/;

export async function syncRegistryAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'syncregistry', async () => {
    try {
      await withAdminControl(async (tx, actor) => {
        await syncFeatureRegistry(tx, actor.id, 'Sync the feature registry from code');
      });
      revalidatePath('/admin/features');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return { error: error instanceof Error ? error.message : 'The registry sync did not complete. Reload and try again.' };
    }
  });
}

export async function saveFeatureMetadataAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'savefeaturemetadata', async () => {
    try {
      const key = value(form, 'key');
      const name = value(form, 'name');
      const category = value(form, 'category');
      const description = value(form, 'description');
      const reason = value(form, 'reason');
      if (!key || key.length > 128) throw Error('A feature key is required.');
      if (!name || name.length > 120 || metadataUnsafe.test(name)) throw Error('Enter a name of 1–120 characters without @ or control characters.');
      if (!category || category.length > 40 || metadataUnsafe.test(category)) throw Error('Enter a category of 1–40 characters without @ or control characters.');
      if (!description || description.length > 500 || metadataUnsafe.test(description)) throw Error('Enter a description of 1–500 characters without @ or control characters.');
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      await withAdminControl(async (tx, actor) => {
        const row = await tx.feature.findUnique({ where: { key } });
        if (!row) throw Error('That feature is not in the catalog. Sync the registry first.');
        if (!isRegisteredFeatureKey(key)) throw Error('Orphaned features are locked until their key returns to the code registry.');
        const changes: Record<string, string | number | boolean | null> = { featureKey: key };
        const changed: string[] = [];
        if (row.name !== name) { changed.push('name'); changes.name = name; }
        if (row.category !== category) { changed.push('category'); changes.category = category; }
        if (row.description !== description) changed.push('description');
        if (changed.length === 0) throw Error('No metadata changes were entered.');
        changes.fieldsChanged = changed.join(',');
        await tx.feature.update({ where: { key }, data: { name, description, category } });
        await appendAudit(tx, { actorId: actor.id, targetId: row.id, action: 'feature.metadata', reason, changes });
      });
      revalidatePath('/admin/features');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return { error: error instanceof Error ? error.message : 'Feature metadata was not saved. Reload and check your administrator access.' };
    }
  });
}

export async function setFeatureReleaseAction(form: FormData): Promise<Result> {
  return withMutation(form, 'admin', 'setfeaturerelease', async () => {
    try {
      const key = value(form, 'key');
      const requested = String(form.get('active') ?? '');
      const reason = value(form, 'reason');
      if (!key || key.length > 128) throw Error('A feature key is required.');
      if (requested !== 'true' && requested !== 'false') throw Error('Choose release or retire.');
      if (!reason || reason.length > 500) throw Error('Enter a short reason without personal information.');
      const active = requested === 'true';
      await withAdminControl(async (tx, actor) => {
        const row = await tx.feature.findUnique({ where: { key } });
        if (!row) throw Error('That feature is not in the catalog. Sync the registry first.');
        if (!isRegisteredFeatureKey(key)) throw Error('Orphaned features are locked until their key returns to the code registry.');
        if (row.active === active) throw Error('The feature is already in that release state. Reload the catalog.');
        await tx.feature.update({ where: { key }, data: { active } });
        await appendAudit(tx, { actorId: actor.id, targetId: row.id, action: 'feature.release', reason,
          changes: { featureKey: key, previousActive: row.active, active } });
      });
      revalidatePath('/admin/features');
      return { success: true };
    } catch (error) {
      if (error instanceof MaintenanceError) throw error;
      return { error: error instanceof Error ? error.message : 'The release state was not changed. Reload and check your administrator access.' };
    }
  });
}
