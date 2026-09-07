import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }
  return session.user;
}

/** For server actions: return null instead of redirecting (redirects break try/catch). */
export async function getActionUser() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return session.user;
}
