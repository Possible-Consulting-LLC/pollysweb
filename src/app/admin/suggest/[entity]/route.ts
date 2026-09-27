import { requireAdminActor } from '@/lib/admin/actor';
import { prisma } from '@/lib/db';
import { suggestionsFor, SUGGEST_ENTITIES, type SuggestEntity } from '@/lib/admin/suggest';
import { NextResponse } from 'next/server';

const noStore = { 'Cache-Control': 'no-store' };

/** Live-search suggestion endpoint (creator surfaces). Read-only lookups,
 * super_admin-gated like the pages they serve; one lightweight indexed query
 * per debounced typing pause. GET keeps these cancellable and cache-free. */
export async function GET(request: Request,
  context: { params: Promise<{ entity: string }> }) {
  try {
    await requireAdminActor('super_admin');
  } catch {
    return NextResponse.json({ error: 'Administrator access denied.' },
      { status: 403, headers: noStore });
  }
  const { entity } = await context.params;
  if (!SUGGEST_ENTITIES.includes(entity as SuggestEntity))
    return NextResponse.json({ error: 'Unknown entity.' }, { status: 404, headers: noStore });
  const query = new URL(request.url).searchParams.get('q') ?? '';
  const suggestions = await suggestionsFor(prisma, entity as SuggestEntity, query);
  return NextResponse.json({ suggestions }, { headers: noStore });
}
