import { LoginForm } from "@/components/auth/forms";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/home");
  return <LoginForm />;
}
