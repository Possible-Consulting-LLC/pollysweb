import { guardMaintenance } from '@/lib/admin/maintenance-access';
import { prisma } from '@/lib/db';
import type { RequestIdentity } from '@/lib/admin/test-session';
import { stopTestSessionAction } from '@/app/actions/admin-test-session';
export async function TestSessionBanner({ identity, invalid }: {
    identity: RequestIdentity | null;
    invalid: boolean;
}) {
    if (!identity?.testSessionId && !invalid)
        return null;
    try { await guardMaintenance('read', identity); } catch { identity = null; invalid = true; }
    const target = identity?.testSessionId ? await prisma.user.findUnique({ where: { id: identity.effectiveUserId }, select: { name: true, demoLabel: true, demoPlan: true } }).catch(() => null) : null;
    return <aside role="status" className="sticky top-0 z-50 border-b border-amber-700 bg-amber-100 px-4 py-3 text-amber-950">
  <strong>{invalid ? 'Testing session ended' : `Testing as ${target?.name ?? target?.demoLabel ?? 'Demo account'} — ${target?.demoPlan === 'pro' ? 'Pro' : 'Free'}`}</strong>
  <p className="text-sm">Changes persist in real demo records. Testing applies across tabs in this browser. Reload other tabs before saving.</p>
  <form action={stopTestSessionAction}><button className="mt-2 rounded-lg border border-current px-3 py-1 font-semibold">Return to admin</button></form>
 </aside>;
}
