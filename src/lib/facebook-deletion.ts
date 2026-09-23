import { createHmac, timingSafeEqual } from 'node:crypto';

export function parseFacebookDeletionRequest(signedRequest: string, secret: string, now = Date.now()) {
  if (!secret || signedRequest.length > 8192) throw new Error('Invalid Facebook request');
  const parts = signedRequest.split('.');
  if (parts.length !== 2 || !parts.every(part => /^[A-Za-z0-9_-]+$/.test(part))) throw new Error('Invalid Facebook request');
  const [signature, payload] = parts;
  const actual = Buffer.from(signature, 'base64url');
  const expected = createHmac('sha256', secret).update(payload).digest();
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid Facebook signature');
  const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  if (!data || data.algorithm !== 'HMAC-SHA256' || typeof data.user_id !== 'string' || !/^\d{1,100}$/.test(data.user_id) ||
      !Number.isSafeInteger(data.issued_at) || data.issued_at <= 0 || data.issued_at > Math.floor(now / 1000) + 300) throw new Error('Invalid Facebook payload');
  // Do not retain Facebook IDs or the signed payload in the request ledger.
  const subjectHash = createHmac('sha256', secret).update(`facebook-deletion:${data.user_id}`).digest('hex');
  const requestHash = createHmac('sha256', secret).update(`facebook-deletion-request:${payload}`).digest('hex');
  return { userId: data.user_id as string, subjectHash, requestHash };
}

export function facebookDeletionOrigin(env: Record<string, string | undefined>): string {
  const origin = new URL(env.EMAIL_VERIFICATION_ORIGIN ?? env.AUTH_URL ?? '');
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Deletion origin is not configured');
  return origin.origin;
}
