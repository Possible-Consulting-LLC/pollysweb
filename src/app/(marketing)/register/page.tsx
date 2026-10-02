import { RegisterForm } from "@/components/auth/forms";
import { getSessionUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { configuredSocialProviders } from "@/lib/social-auth";
import { socialErrorMessage } from "@/lib/social-error";

export default async function RegisterPage({ searchParams }: { searchParams?: Promise<{ error?: string }> }) {
  const user = await getSessionUser();
  if (user) redirect("/home");
  const params = searchParams ? await searchParams : {};
  return <RegisterForm providers={configuredSocialProviders(process.env)} socialError={socialErrorMessage(params.error)} />;
}
