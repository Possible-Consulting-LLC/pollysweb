import { guardMaintenance } from './admin/maintenance-access';
import { MaintenanceError } from './admin/maintenance-policy';
import { cache } from "react";
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import { signOut } from "@/lib/auth";
import { getRequestSession } from "@/lib/raw-session";
import { resolveRequestIdentity } from "@/lib/admin/test-session-store";
import { TestContextError, type RequestIdentity } from "@/lib/admin/test-session";
import { mutationIdentity } from "@/lib/mutation-context";
export { getRequestSession } from "@/lib/raw-session";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
type SessionUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
  emailChangeReauthAt?: number;
  credentialVersion?: string;
};
/** Deduped per request so layout + page don't hit auth/DB twice. */
const loadSessionUser = cache(async (): Promise<{
  user: SessionUser | null;
  stale: boolean;
  identity: RequestIdentity | null;
}> => {
  const admitted = mutationIdentity.getStore();
  let identity;
  try {
    identity = admitted ? admitted.identity : await resolveRequestIdentity();
  }
  catch (error) {
    if (error instanceof MaintenanceError) redirect("/maintenance");
    if (error instanceof TestContextError)
      redirect("/testing-ended");
    throw error;
  }
  if (!identity)
    return {
      user: null, stale: false, identity: null
    };
  // The guard and the user-row read share no data dependency, so the read is
  // issued while the guard is in flight (one fewer DB round trip per request).
  // The guard is still awaited first: its failure always denies before the row
  // is consumed, exactly as when the two were strictly sequential.
  const userRead = prisma.user.findUnique({
    where: {
      id: identity.effectiveUserId
    }, select: {
      id: true, name: true, email: true, image: true, suspendedAt: true, deletingAt: true
    }
  });
  userRead.catch(() => {});
  await guardMaintenance('read',identity);
  const existing = await userRead;
  if (!existing || existing.suspendedAt || existing.deletingAt) {
    if (identity.testSessionId)
      throw new TestContextError();
    return {
      user: null, stale: true, identity
    };
  }
  if (identity.testSessionId)
    return {
      user: existing, stale: false, identity
    };
  const session = await getRequestSession();
  return {
    user: session?.user ?? null, stale: false, identity
  };
});
/**
 * Auth.js checks the password fingerprint on every request before returning a user.
 * Resolve the signed-in user. JWTs that no longer match a DB row (reseed /
 * deleted account) are cleared via /api/auth/clear-stale — cookies cannot be
 * modified from a Server Component.
 */
async function getSessionContext(): Promise<{ user: SessionUser | null; identity: RequestIdentity | null }> {
  try {
    // loadSessionUser is per-request cached; start it while the outer guard is
    // in flight so identity and user reads overlap the maintenance read. The
    // guard is awaited first and its failure always denies before the load is
    // consumed — the same denial surface as when this was strictly sequential.
    const load = loadSessionUser();
    load.catch(() => {});
    await guardMaintenance('read');
    const { user, stale, identity } = await load;
    if (stale)
      redirect("/api/auth/clear-stale");
    return { user, identity };
  }
  catch (error) {
    if (isRedirectError(error)) throw error;
    // Admitted form actions need the typed failure from withMutation so edits stay put.
    if (error instanceof MaintenanceError && mutationIdentity.getStore()) throw error;
    if (error instanceof TestContextError) redirect("/testing-ended");
    redirect("/maintenance");
  }
}
export async function getSessionUser(): Promise<SessionUser | null> {
  return (await getSessionContext()).user;
}
export async function requireUser() {
  const user = await getSessionUser();
  if (!user?.id) {
    redirect("/login");
  }
  return user;
}
export async function requireUserContext() {
  const context = await getSessionContext();
  if (!context.user?.id || !context.identity)
    redirect("/login");
  return { user: context.user, identity: context.identity };
}
/** For server actions: return null instead of redirecting (redirects break try/catch). */
export async function getActionUser() {
  const load = loadSessionUser();
  load.catch(() => {});
  await guardMaintenance('read');
  const { user, stale } = await load;
  if (stale) {
    // Server Actions may mutate cookies.
    await signOut({
      redirect: false
    });
    return null;
  }
  return user;
}
