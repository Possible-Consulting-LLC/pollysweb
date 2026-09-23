/** Disabled providers and unverified email/password must not be treated as recovery methods. */
export function remainingSignInAvailable(removing: string, linked: string[], configured: string[], verifiedPassword: boolean): boolean {
  return verifiedPassword || linked.some(provider => provider !== removing && configured.includes(provider));
}
export function recentSocialAuthentication(timestamp: number | undefined, now = Date.now()): boolean {
  return typeof timestamp === 'number' && Number.isSafeInteger(timestamp) && timestamp <= now && now - timestamp <= 5 * 60_000;
}
