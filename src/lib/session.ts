import { auth, signOut } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";

type SessionUser = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

async function loadSessionUser(): Promise<{
  user: SessionUser | null;
  stale: boolean;
}> {
  const session = await auth();
  const id = session?.user?.id;
  if (!id) return { user: null, stale: false };

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!existing) return { user: null, stale: true };
  return { user: session.user, stale: false };
}

/**
 * Resolve the signed-in user. JWTs that no longer match a DB row (reseed /
 * deleted account) are cleared via /api/auth/clear-stale — cookies cannot be
 * modified from a Server Component.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const { user, stale } = await loadSessionUser();
  if (stale) redirect("/api/auth/clear-stale");
  return user;
}

export async function requireUser() {
  const user = await getSessionUser();
  if (!user?.id) {
    redirect("/login");
  }
  return user;
}

/** For server actions: return null instead of redirecting (redirects break try/catch). */
export async function getActionUser() {
  const { user, stale } = await loadSessionUser();
  if (stale) {
    // Server Actions may mutate cookies.
    await signOut({ redirect: false });
    return null;
  }
  return user;
}
