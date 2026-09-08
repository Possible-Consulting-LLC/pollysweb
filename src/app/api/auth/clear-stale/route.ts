import { signOut } from "@/lib/auth";

/** Clears a JWT whose user id no longer exists in the database. */
export async function GET() {
  await signOut({ redirectTo: "/login" });
}
