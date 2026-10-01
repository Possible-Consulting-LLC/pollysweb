import { isStaging } from "./staging-guard";

type Environment = Record<string, string | undefined>;

export function isPublicSiteHost(env: Environment = process.env, requestHostname: string): boolean {
  if (isStaging(env)) return false;
  const canonical = env.AUTH_URL ?? env.NEXTAUTH_URL;
  if (!canonical) return false;
  try {
    const host = new URL(canonical).hostname;
    return requestHostname === host || requestHostname === wwwTwin(host);
  } catch {
    return false;
  }
}

export function wwwTwin(host: string): string {
  return host.startsWith("www.") ? host.slice(4) : `www.${host}`;
}
