import { z } from "zod";
import Google from "next-auth/providers/google";
import Apple from "next-auth/providers/apple";
import Facebook from "next-auth/providers/facebook";
import { getToken } from "next-auth/jwt";
import { matchesCredentialFingerprint, userCredentialSource } from "./credential-version";

export type SocialProviderId = "google" | "apple" | "facebook";
type SocialAuthEnvironment = Record<string, string | undefined>;

const providerCredentials = {
  google: ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
  apple: ["AUTH_APPLE_ID", "AUTH_APPLE_SECRET"],
  facebook: ["AUTH_FACEBOOK_ID", "AUTH_FACEBOOK_SECRET"],
} as const;

/** Safe to send to the UI: returns IDs only, never credential values. */
export function configuredSocialProviders(env: SocialAuthEnvironment): SocialProviderId[] {
  return (Object.keys(providerCredentials) as SocialProviderId[]).filter((provider) =>
    providerCredentials[provider].every((key) => Boolean(env[key]?.trim())),
  );
}

type SocialSignInInput = {
  account?: { type: string; provider: string; providerAccountId: string } | null;
  user: { email?: string | null };
  profile?: { email?: unknown; email_verified?: unknown };
};

type ProviderIdentity = { provider: string; providerAccountId: string };
const emailSchema = z.string().email();

/**
 * Returns true only when this callback proves ownership of the keeper email.
 * Google exposes an explicit verification claim. Facebook returns the primary
 * email granted by its email permission, so a matching callback email is the
 * provider assertion available for that account.
 */
export function socialProviderVerifiedEmail({ account, user, profile }: SocialSignInInput): boolean {
  if (!account || (account.type !== "oauth" && account.type !== "oidc")) return false;
  if (account.provider !== "google" && account.provider !== "facebook") return false;
  const keeperEmail = emailSchema.safeParse(user.email);
  const providerEmail = emailSchema.safeParse(profile?.email);
  if (!keeperEmail.success || !providerEmail.success ||
      keeperEmail.data.toLowerCase() !== providerEmail.data.toLowerCase()) return false;
  return account.provider === "facebook" || profile?.email_verified === true;
}

export function socialSignInRejectionUrl(provider: string, email: string | null | undefined): string | null {
  if (provider === "facebook" && !emailSchema.safeParse(email).success) {
    return "/login?error=FacebookEmailUnavailable";
  }
  return null;
}

/** Authorizes only; Auth.js owns keeper resolution and authenticated linking. */
export async function isSocialSignInAllowed(
  { account, user, profile }: SocialSignInInput,
  hasLinkedAccount: (identity: ProviderIdentity) => Promise<boolean>,
  authenticatedLinking = false,
): Promise<boolean> {
  if (!account || (account.type !== "oauth" && account.type !== "oidc")) return true;
  if (account.provider === "google" && profile?.email_verified === false) return false;

  // Providers may omit email on subsequent sign-ins. Identity is the stored link,
  // never a match on the email claim. Lookup failures must propagate (fail closed).
  if (await hasLinkedAccount({
    provider: account.provider,
    providerAccountId: account.providerAccountId,
  })) return true;

  // The keeper has already proved ownership of their existing account. Linking
  // the provider ID does not need a second email claim from that provider.
  if (authenticatedLinking) return true;

  if (!emailSchema.safeParse(user.email).success) return false;
  if (account.provider === "google" && profile?.email_verified !== true) return false;
  return true;
}

type SessionKeeper = { id: string; passwordHash: string | null; authVersion: string };

/** Reject a stale session before Auth.js can use it to link an OAuth account. */
export async function hasValidSocialLinkSession(
  request: Request | undefined,
  secret: string,
  findKeeper: (id: string) => Promise<SessionKeeper | null>,
  authUrl?: string,
): Promise<"none" | "valid" | "invalid"> {
  if (!request) return "invalid";
  // Match NextAuth's AUTH_URL/NEXTAUTH_URL override and Auth.js cookie defaults.
  const cookie = socialSessionCookie(authUrl ?? request.url);
  const secureCookie = cookie.options.secure;
  // Auth.js linking consumes the session cookie, not Authorization headers.
  const req = { headers: new Headers({ cookie: request.headers.get("cookie") ?? "" }) };
  const rawToken = await getToken({ req, secureCookie, cookieName: cookie.name, raw: true });
  if (!rawToken) return "none";
  const token = await getToken({ req, secureCookie, cookieName: cookie.name, secret });
  if (!token?.sub) return "invalid";
  const keeper = await findKeeper(token.sub);
  return keeper !== null && matchesCredentialFingerprint(
    token.credentialVersion, userCredentialSource(keeper), secret,
  ) ? "valid" : "invalid";
}

/** Auth.js restores identity fields after account(); no provider tokens need persistence. */
export function socialAuthProviders(env: SocialAuthEnvironment) {
  const factories = {
    google: () => Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET, account: () => ({}) }),
    apple: () => Apple({ clientId: env.AUTH_APPLE_ID, clientSecret: env.AUTH_APPLE_SECRET, account: () => ({}) }),
    facebook: () => Facebook({ clientId: env.AUTH_FACEBOOK_ID, clientSecret: env.AUTH_FACEBOOK_SECRET, account: () => ({}) }),
  };
  return configuredSocialProviders(env).map((provider) => factories[provider]());
}

export function socialSessionCookie(url: string) {
  const secure = new URL(url).protocol === "https:";
  return {
    name: secure ? "__Secure-authjs.session-token" : "authjs.session-token",
    options: { httpOnly: true, sameSite: secure ? "none" as const : "lax" as const, path: "/", secure },
  };
}
