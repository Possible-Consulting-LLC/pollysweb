import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { narrowRows, NARROW_ENTITIES, type NarrowEntity } from '@/lib/admin/suggest';
import { NextResponse } from 'next/server';

const noStore = { 'Cache-Control': 'no-store' };

/** Live-search narrowing endpoint (creator surfaces). Typing narrows the
 * RENDERED LIST to matches spanning ALL rows with a truthful total and paging
 * over the matches (UX Task 8 ruling 1+3). Read-only, super_admin-gated like
 * the pages they serve; two lightweight indexed queries per debounced typing
 * pause (count + page select). GET keeps these cancellable and cache-free. */
export async function GET(request: Request,
  context: { params: Promise<{ entity: string }> }) {
  try {
    await requireAdminActor('super_admin');
  } catch {
    return NextResponse.json({ error: 'Administrator access denied.' },
      { status: 403, headers: noStore });
  }
  const { entity } = await context.params;
  if (!NARROW_ENTITIES.includes(entity as NarrowEntity))
    return NextResponse.json({ error: 'Unknown entity.' }, { status: 404, headers: noStore });
  const params = new URL(request.url).searchParams;
  const query = params.get('q') ?? '';
  const page = Number.parseInt(params.get('page') ?? '', 10);
  const pageSize = Number.parseInt(params.get('pageSize') ?? '', 10);
  const narrowed = await narrowRows(prisma, entity as NarrowEntity, query,
    Number.isFinite(page) ? page : 1, Number.isFinite(pageSize) ? pageSize : 10);
  return NextResponse.json(narrowed, { headers: noStore });
}
