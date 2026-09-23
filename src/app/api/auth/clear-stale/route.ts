import { NextResponse } from "next/server";
import { auth, signOut } from "@/lib/auth";

/** Clears an invalid JWT without allowing this GET route to log out a valid user. */
export async function GET(request: Request) {
  const session = await auth();
  if (session?.user?.id) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const { stopTestSession } = await import("@/lib/admin/test-session-store");
  await stopTestSession();
  await signOut({ redirectTo: "/login" });
}
