import { guardServiceMaintenance } from '@/lib/admin/maintenance-access';
import { MaintenanceError, maintenanceResponse } from '@/lib/admin/maintenance-policy';
import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { reconcileStripeCustomer } from "@/lib/billing-service";
import { reconcileDueBilling } from "@/lib/billing-reconciliation";
import { isStaging } from "@/lib/staging-guard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

function authorized(request: Request, secret: string) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  const expected = createHash("sha256").update(secret).digest();
  const actual = createHash("sha256").update(token).digest();
  return Boolean(token) && timingSafeEqual(actual, expected);
}

export async function GET(request: Request): Promise<Response> {
  if (isStaging()) return response({ error: "Billing reconciliation is disabled." }, 503);
  const secret = process.env.CRON_SECRET;
  if (!secret?.trim()) return response({ error: "Billing reconciliation is not configured." }, 503);
  if (!authorized(request, secret)) return response({ error: "Unauthorized." }, 401);

  try { await guardServiceMaintenance(); } catch { return maintenanceResponse(); }
  try {
    const result = await reconcileDueBilling({
      prisma,
      reconcileCustomer: async (...args) => { await guardServiceMaintenance(); return reconcileStripeCustomer(...args); },
      now: new Date(),
      logger: { error: (entry) => console.error(entry) },
    });
    console.info({ event: "billing_reconciliation_completed", ...result });
    return response(result, result.failed ? 500 : 200);
  } catch (error) {
    if (error instanceof MaintenanceError) return maintenanceResponse();
    console.error({ event: "billing_reconciliation_run_failed", error: error instanceof Error ? error.message : "Unknown error" });
    return response({ error: "Billing reconciliation failed." }, 500);
  }
}
