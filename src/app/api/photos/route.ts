import { guardMaintenance } from '@/lib/admin/maintenance-access';
import { maintenanceResponse } from '@/lib/admin/maintenance-policy';
import { resolveRequestIdentity } from "@/lib/admin/test-session-store";
import { prisma } from "@/lib/db";
import { getSupabaseAdmin } from "@/lib/supabase";
import { servePrivatePhoto } from "@/lib/photo-media-route";
import { SPOODS_BUCKET } from "@/lib/photo-media";
import { ownsPhotoReference } from "@/lib/photo-reference-owner";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  let identity;
  try { identity = await resolveRequestIdentity(); await guardMaintenance('read', identity); } catch { return maintenanceResponse(); }
  const response = await servePrivatePhoto(request, {
    userId: identity?.effectiveUserId ?? null,
    storageOrigin: process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "",
    ownsReference: (reference, userId) => ownsPhotoReference(reference, userId, prisma),
    download: async (path) => {
      await guardMaintenance('read', identity);
      const { data, error } = await getSupabaseAdmin().storage.from(SPOODS_BUCKET).download(path);
      if (error) {
        console.warn("[photos] download failed", error.message);
        return null;
      }
      return data;
    },
  });
  return response.status===503 ? maintenanceResponse() : response;
}
