import { allowMaintenanceLogin } from './admin/maintenance-access';
import NextAuth from "next-auth";
import { headers, cookies } from "next/headers";
import Credentials from "next-auth/providers/credentials";
import type { PrismaClient } from "@prisma/client";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { z } from "zod";
import { prisma } from "./db";
import { credentialFingerprint, matchesCredentialFingerprint, userCredentialSource } from "./credential-version";
import { allowAction } from "./rate-limit";
import { verifyPassword } from "./password-policy";
import { canUsePasswordAccount } from "./email-verification";
import { hasValidSocialLinkSession, isSocialSignInAllowed, socialAuthProviders, socialProviderVerifiedEmail, socialSessionCookie, socialSignInRejectionUrl } from "./social-auth";

function sessionSecret() {
  const secret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("Authentication secret is not configured.");
  return secret;
}

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const { handlers, auth, signIn, signOut } = NextAuth(async (request) => {
  // Server Actions initialize without a Request. Match Auth.js's protocol fallback
  // there, and its configured origin override on both actions and callback routes.
  const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
  const cookieUrl = authUrl ?? request?.url ??
    `${(await headers()).get("x-forwarded-proto")?.replace(/:$/, "") ?? "https"}://localhost`;
  const adapter = PrismaAdapter(prisma);
  // OAuth keeper writes must roll back if cutoff arrives before commit. This
  // login gate uses the supplied connection and never resolves an Auth.js session.
  const writeAdapter = <T>(userId: string | undefined, work: (txAdapter: ReturnType<typeof PrismaAdapter>) => Promise<T>) =>
    prisma.$transaction(async (tx) => {
      if (!await allowMaintenanceLogin(userId, tx)) throw Error('Maintenance');
      // These adapter methods use model delegates only; no nested transaction API.
      const result = await work(PrismaAdapter(tx as PrismaClient));
      if (!await allowMaintenanceLogin(userId, tx)) throw Error('Maintenance');
      return result;
    }, { isolationLevel: 'ReadCommitted' });
  const markSocialEmailVerified = (userId: string, email: string) =>
    prisma.$transaction(async (tx) => {
      if (!await allowMaintenanceLogin(userId, tx)) throw Error('Maintenance');
      await tx.user.updateMany({
        where: { id: userId, emailVerified: null, email: { equals: email, mode: "insensitive" } },
        data: { emailVerified: new Date() },
      });
      if (!await allowMaintenanceLogin(userId, tx)) throw Error('Maintenance');
    }, { isolationLevel: 'ReadCommitted' });
  return {
    trustHost: true,
    // Required on Vercel — without this, every /api/auth/* route returns
    // "There was a problem with the server configuration."
    secret: process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET,
    session: { strategy: "jwt" },
    cookies: { sessionToken: socialSessionCookie(cookieUrl) },
    adapter: {
      ...adapter,
      // Registration stores lowercase emails. Keep OAuth creation and Auth.js's
      // collision check on the same identity, including older mixed-case rows.
      createUser: async (user) => {
        return writeAdapter(undefined, async (txAdapter) => txAdapter.createUser!({ ...user, email: user.email.toLowerCase() }));
      },
      updateUser: async (user) => {
        return writeAdapter(user.id, async (txAdapter) => txAdapter.updateUser!(user));
      },
      linkAccount: async (account) => {
        await writeAdapter(account.userId, async (txAdapter) => txAdapter.linkAccount!(account));
      },
      getUserByEmail: (email) => prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
      }),
    },
    pages: {
      signIn: "/login",
      error: "/login",
    },

    providers: [
      ...socialAuthProviders(process.env),
      Credentials({
        name: "Email",
        credentials: {
          email: { label: "Email", type: "email" },
          password: { label: "Password", type: "password" },
        },
        async authorize(raw, request) {
          const parsed = credentialsSchema.safeParse(raw);
          if (!parsed.success) return null;

          try {
            if (!await allowAction("login", parsed.data.email.toLowerCase(), request.headers)) return null;
            const user = await prisma.user.findFirst({
              where: { email: { equals: parsed.data.email, mode: "insensitive" } },
            });
            if (!user?.passwordHash || user.suspendedAt || user.deletingAt) return null;
            if (!canUsePasswordAccount(user, new Date(), process.env.PASSWORD_EMAIL_VERIFICATION_GRACE_START)) return null;

            const valid = await verifyPassword(
              parsed.data.password,
              user.passwordHash,
            );
            if (!valid || !await allowMaintenanceLogin(user.id)) return null;

            return {
              credentialVersion: credentialFingerprint(userCredentialSource(user), sessionSecret()),
              id: user.id,
              email: user.email,
              name: user.name ?? user.email.split("@")[0],
            };
          } catch (error) {
            console.error("[auth] database error during authorize", error);
            return null;
          }
        },
      }),
    ],
    events: { async signOut(message) {
      const { revokeAdminProof } = await import('./admin/reauth-store'); await revokeAdminProof();
      if ('token' in message && message.token?.sub) {
        const { revokeTestSessionsForActor } = await import('./admin/test-session-store');
        await revokeTestSessionsForActor(message.token.sub);
      }
    } },
    callbacks: {
      async signIn({ user, account, profile }) {
        // Deny credentials and OAuth callback/link completion while testing.
        if ((await cookies()).get("spoodly-test-session")?.value) return false;
        let authenticatedLinking = false;
        if (account?.type === "oauth" || account?.type === "oidc") {
          const { authorizeAdminSocialReauth } = await import('./admin/reauth-store');
          if (!await authorizeAdminSocialReauth(request, account)) return false;
          const sessionStatus = await hasValidSocialLinkSession(
            request,
            sessionSecret(),
            (id) => prisma.user.findUnique({
              where: { id },
              select: { id: true, passwordHash: true, authVersion: true, emailChangeVersion: true, adminVersion: true, suspendedAt: true, deletingAt: true },
            }),
            process.env.AUTH_URL ?? process.env.NEXTAUTH_URL,
          );
          if (sessionStatus === "invalid") {
            console.warn("[auth] social sign-in denied", { provider: account.provider, reason: "invalid_link_session" });
            return false;
          }
          authenticatedLinking = sessionStatus === "valid";
        }
        const allowed = await isSocialSignInAllowed({ user, account, profile }, async (identity) => {
          const linkedAccount = await prisma.account.findUnique({
            where: { provider_providerAccountId: identity },
            select: { userId: true },
          });
          return linkedAccount !== null;
        }, authenticatedLinking);
        if (!allowed && account?.type === "oauth") {
          console.warn("[auth] social sign-in denied", {
            provider: account.provider,
            reason: z.string().email().safeParse(user.email).success ? "provider_policy" : "missing_or_invalid_email",
          });
          const rejectionUrl = socialSignInRejectionUrl(account.provider, user.email);
          if (rejectionUrl) return rejectionUrl;
        }
        if (!allowed) return false;
        const loginId = account?.type === "oauth" || account?.type === "oidc"
          ? (await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: account.provider, providerAccountId: account.providerAccountId } }, select: { userId:true } }))?.userId
          : user.id;
        return allowMaintenanceLogin(loginId);
      },
      async jwt({ token, user, account, profile }) {
        if (user) {
          token.sub = user.id;
          token.credentialVersion = "credentialVersion" in user ? user.credentialVersion : undefined;
          if (account?.type === "oauth" || account?.type === "oidc") token.emailChangeReauthAt = Date.now();
          else delete token.emailChangeReauthAt;
        }
        if (!token.sub) return null;
        if (user && !await allowMaintenanceLogin(token.sub)) return null;
        if (user?.email && socialProviderVerifiedEmail({ user, account, profile })) {
          await markSocialEmailVerified(token.sub, user.email);
        }
        const current = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { id: true, passwordHash: true, authVersion: true, emailVerified: true, emailChangeVersion: true, adminVersion: true, suspendedAt: true, deletingAt: true },
        });
        if (!current || current.suspendedAt || current.deletingAt) return null;
        if (!canUsePasswordAccount(current, new Date(), process.env.PASSWORD_EMAIL_VERIFICATION_GRACE_START)) return null;
        const source = userCredentialSource(current);
        // OAuth's user.id must be the resolved keeper ID, never the provider account ID.
        if (user && (account?.type === "oauth" || account?.type === "oidc")) {
          token.credentialVersion = credentialFingerprint(source, sessionSecret());
        }
        if (!matchesCredentialFingerprint(token.credentialVersion, source, sessionSecret())) return null;
        if (user && account && (account.type === 'oauth' || account.type === 'oidc')) {
          const { completeAdminSocialReauth } = await import('./admin/reauth-store');
          if (!await completeAdminSocialReauth(request, account, token.sub, token.credentialVersion as string)) return null;
        }
        return token;
      },
      async session({ session, token }) {
        if (session.user && token.sub) {
          session.user.id = token.sub;
          if (typeof token.credentialVersion === "string") session.user.credentialVersion = token.credentialVersion;
          if (typeof token.emailChangeReauthAt === "number" && Number.isSafeInteger(token.emailChangeReauthAt) &&
              token.emailChangeReauthAt <= Date.now() && Date.now() - token.emailChangeReauthAt <= 5 * 60_000) {
            session.user.emailChangeReauthAt = token.emailChangeReauthAt;
          }
        }
        return session;
      },
    },
  };
});
