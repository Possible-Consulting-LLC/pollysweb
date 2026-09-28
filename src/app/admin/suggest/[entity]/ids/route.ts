import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { selectableRows, SELECTABLE_ENTITIES, type SelectableEntity } from '@/lib/admin/suggest';
import { NextResponse } from 'next/server';

const noStore = { 'Cache-Control': 'no-store' };

/** S13c select-all endpoint (`/admin/suggest/[entity]/ids`): the multi-select
 * accordions fetch EVERY selectable row matching the active view — id +
 * display fields only, one indexed count-free capped query per CLICK (never
 * per keystroke). Read-only, super_admin-gated like the pages it serves;
 * single-mode picker entities fail closed (404) per the owner's rule. */
export async function GET(request: Request,
  context: { params: Promise<{ entity: string }> }) {
  try {
    await requireAdminActor('super_admin');
  } catch {
    return NextResponse.json({ error: 'Administrator access denied.' },
      { status: 403, headers: noStore });
  }
  const { entity } = await context.params;
  if (!SELECTABLE_ENTITIES.includes(entity as SelectableEntity))
    return NextResponse.json({ error: 'Unknown entity.' }, { status: 404, headers: noStore });
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const rows = await selectableRows(prisma, entity as SelectableEntity, query);
  return NextResponse.json({ rows }, { headers: noStore });
}
