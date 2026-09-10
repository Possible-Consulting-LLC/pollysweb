import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function RootPage() {
  const user = await getSessionUser();
  redirect(user ? "/home" : "/login");
}
