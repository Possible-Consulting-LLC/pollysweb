import { LoginForm } from "@/components/auth/forms";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) redirect("/home");
  return <LoginForm />;
}
