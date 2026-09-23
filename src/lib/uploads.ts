import { guardMaintenance } from './admin/maintenance-access';
import { MaintenanceError } from './admin/maintenance-policy';
import { mkdir, writeFile } from "fs/promises";
import { prisma } from "./db";
import { admittedUpload } from "./upload-admission";
import type { Prisma } from "@prisma/client";
import path from "path";
import { randomUUID } from "node:crypto";
import { getActionUser } from "./session";
import { allowAction, RATE_LIMIT_MESSAGE } from "./rate-limit";
import { validateRasterUpload, uploadValidationMessage } from "./upload-validation";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { SPOODS_BUCKET, storagePathFromReference, storageReference } from "./photo-media";
import {
  createPhotoCleanupService,
  detachPhotoRecord,
  type DetachPhotoTransaction,
  type PhotoCleanupResult,
  type PhotoCleanupTransaction,
} from './photo-cleanup';


import { getPhotoSizeError } from "./upload-limits";

function objectPath(prefix: string, ext: string) {
  const safePrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64) || "spood";
  return `${safePrefix}/${randomUUID()}.${ext}`;
}

/** Persist an image to the `spoods` bucket (with local development fallback). */
export async function saveImageUpload(
  file: File,
  prefix: string,
): Promise<{ url: string } | { error: string }> {
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo to upload." };
  }
  const sizeError = getPhotoSizeError(file);
  if (sizeError) return { error: sizeError };

  const user = await getActionUser();
  if (!user?.id) return { error: "Please sign in again." };
  if (!await allowAction("upload", user.id)) return { error: RATE_LIMIT_MESSAGE };

  let verified;
  try {
    verified = await validateRasterUpload(Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    return { error: uploadValidationMessage(error) };
  }
  const { bytes, extension: safeExt, contentType } = verified;
  const pathInBucket = objectPath(prefix, safeExt);

  if (isSupabaseConfigured()) {
    try {
      const supabase = getSupabaseAdmin();
      const assertOwner = async (tx: Prisma.TransactionClient) => {
        await guardMaintenance('write', undefined, tx);
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`;
        const current = await tx.user.findUnique({ where: { id: user.id! }, select: { deletingAt: true, suspendedAt: true } });
        if (!current || current.deletingAt || current.suspendedAt) throw new Error("Account unavailable for uploads.");
        if (prefix !== user.id && !await tx.spider.findFirst({ where: { id: prefix, userId: user.id! }, select: { id: true } })) throw new Error("Invalid upload owner.");
      };
      let activeTx: Prisma.TransactionClient;
      await admittedUpload({
        reserve: () => prisma.$transaction(async tx => {
          await assertOwner(tx);
          await tx.ownedUpload.create({ data: { key: pathInBucket, userId: user.id! } });
        }),
        underAccountLock: work => prisma.$transaction(async tx => {
          await assertOwner(tx); activeTx = tx; return work();
        }, { maxWait: 10_000, timeout: 45_000 }),
        upload: async () => {
          await guardMaintenance('write', undefined, activeTx);
          const result = await supabase.storage.from(SPOODS_BUCKET).upload(pathInBucket, bytes, { contentType, upsert: false, cacheControl: "3600" });
          if (result.error) throw result.error;
          return result;
        },
        settle: async () => { await activeTx.ownedUpload.update({ where: { key: pathInBucket }, data: { settled: true } }); },
      });

      return { url: storageReference(pathInBucket) };
    } catch (error) {
      if(error instanceof MaintenanceError) throw error;
      console.error("[upload] supabase upload failed", error);
      return {
        error:
          "Couldn’t upload to Supabase Storage. Check SUPABASE_URL and the anon/service key on this deploy.",
      };
    }
  }

  // Disk fallback is only for explicit local development.
  if (process.env.NODE_ENV !== "development") return { error: "Photo storage is not configured." };
  try {
    const filename = `${randomUUID()}.${safeExt}`;
    const dir = path.join(process.cwd(), "public", "uploads");
    await mkdir(dir, { recursive: true });
    await guardMaintenance('write');
    await writeFile(path.join(dir, filename), bytes);
    return { url: `/uploads/${filename}` };
  } catch (error) {
    console.error("[upload] local disk unavailable and Supabase not configured", error);
    return {
      error:
        "Photo uploads need Supabase Storage. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    };
  }
}

const photoCleanup = createPhotoCleanupService({
  keyFromReference: reference => storagePathFromReference(
    reference,
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  ),
  referenceVariants: key => {
    const origin = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
    return {
      exact: [storageReference(key)],
      prefixes: origin ? [
        `${origin}/storage/v1/object/public/${SPOODS_BUCKET}/${key}`,
        `${origin}/storage/v1/object/sign/${SPOODS_BUCKET}/${key}`,
      ] : [],
    };
  },
  withLocked: (userId, work) => prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} FOR UPDATE`;
    return work(tx as unknown as PhotoCleanupTransaction);
  }, { maxWait: 10_000, timeout: 45_000 }),
  remove: async key => {
    if (!isSupabaseConfigured()) throw new Error('Photo storage is not configured.');
    const { error } = await getSupabaseAdmin().storage.from(SPOODS_BUCKET).remove([key]);
    if (error) throw error;
  },
});

/** Record cleanup ownership in the same transaction that detaches the photo. */
export async function detachStoredPhotoRecord(
  tx: Prisma.TransactionClient,
  input: { photoId: string; spiderId: string; userId: string },
) {
  return detachPhotoRecord(
    tx as unknown as DetachPhotoTransaction,
    input,
    photoCleanup.prepare,
  );
}

/** Delete only a settled, keeper-owned object that has no remaining relation.
 * Provider uncertainty leaves the OwnedUpload row as a durable retry record. */
export async function cleanupDetachedPhoto(url: string, userId: string): Promise<PhotoCleanupResult> {
  return photoCleanup.cleanup(url, userId);
}

/** Strict cleanup of this request's settled, unattached remote object. Failure
 * retains the durable ledger for operator cleanup; never infer settlement. */
export async function cleanupUnattachedUpload(url:string,userId:string):Promise<void> {
  const result = await cleanupDetachedPhoto(url, userId);
  if (result === 'pending') console.warn('[upload] Unattached object remains in cleanup ledger.');
}
