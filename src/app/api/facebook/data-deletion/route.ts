import { guardServiceMaintenance } from '@/lib/admin/maintenance-access';
import { maintenanceResponse } from '@/lib/admin/maintenance-policy';
import { randomBytes } from 'node:crypto';
import { prisma } from '@/lib/db';
import { facebookDeletionOrigin, parseFacebookDeletionRequest } from '@/lib/facebook-deletion';
import { configuredSocialProviders } from '@/lib/social-auth';
import { remainingSignInAvailable } from '@/lib/social-disconnect-policy';

export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'no-store' };

export async function POST(request: Request) {
  const secret = process.env.AUTH_FACEBOOK_SECRET;
  let origin: string;
  try { origin = facebookDeletionOrigin(process.env); if (!secret) throw new Error(); }
  catch { return Response.json({ error: 'Deletion requests are temporarily unavailable.' }, { status: 503, headers }); }
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')) {
    return Response.json({ error: 'Expected a form-encoded signed_request.' }, { status: 415, headers });
  }
  let identity: ReturnType<typeof parseFacebookDeletionRequest>;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 16384) { await reader.cancel(); throw new Error(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const fields = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
    if (fields.getAll('signed_request').length !== 1) throw new Error();
    identity = parseFacebookDeletionRequest(fields.get('signed_request')!, secret!);
  } catch { return Response.json({ error: 'Invalid signed request.' }, { status: 400, headers }); }
  try { await guardServiceMaintenance(); } catch { return maintenanceResponse(); }
  try {
    const account = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: 'facebook', providerAccountId: identity.userId } },
      include: { user: { select: { passwordHash: true, emailVerified: true, accounts: { select: { provider: true } } } } },
    });
    const needsMethod = account && !remainingSignInAvailable('facebook', account.user.accounts.map(a => a.provider), configuredSocialProviders(process.env), Boolean(account.user.passwordHash && account.user.emailVerified));
    // Receipt only: older accounts lack profile-field provenance. A reviewer must
    // determine which Facebook-supplied fields can be erased without deleting care data.
    await guardServiceMaintenance();
    const receipt = await prisma.facebookDeletionRequest.upsert({
      where: { requestHash: identity.requestHash },
      create: {
        requestHash: identity.requestHash,
        subjectHash: identity.subjectHash,
        confirmationCode: randomBytes(24).toString('hex'),
        userId: account?.userId ?? null,
        status: needsMethod ? 'needs_sign_in_method' : 'pending_review',
      },
      update: {},
      select: { confirmationCode: true },
    });
    const url = new URL('/data-deletion', origin);
    url.searchParams.set('code', receipt.confirmationCode);
    return Response.json({ url: url.toString(), confirmation_code: receipt.confirmationCode }, { headers });
  } catch {
    // Never echo signed payloads, provider IDs, database details, or secrets.
    console.error('[facebook-deletion] Could not record deletion request');
    return Response.json({ error: 'Could not record your request. Please retry.' }, { status: 503, headers: {...headers, 'Retry-After':'60'} });
  }
}
