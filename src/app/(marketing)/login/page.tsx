import { LoginForm } from "@/components/auth/forms";
import { getRequestSession } from "@/lib/raw-session";
import { allowMaintenanceLogin } from "@/lib/admin/maintenance-access";
import { redirect } from "next/navigation";
import { configuredSocialProviders } from "@/lib/social-auth";
import { socialErrorMessage } from "@/lib/social-error";

export default async function LoginPage({ searchParams }: { searchParams?: Promise<{ error?: string; created?: string; emailChanged?: string; methodDisconnected?: string }> }) {
  const params = searchParams ? await searchParams : {};
  const socialError = socialErrorMessage(params.error);
  const user = (await getRequestSession().catch(() => null))?.user;
  if (user?.id && await allowMaintenanceLogin(user.id)) {
    if (socialError && params.error) redirect(`/settings?error=${encodeURIComponent(params.error)}`);
    redirect("/home");
  }
  return <>{params.methodDisconnected === "1" ? <p role="status" className="mb-4 rounded-2xl bg-[var(--hover)] p-4 text-[var(--midnight)]">Sign-in method disconnected. Sign in with one of your remaining methods.</p> : null}<LoginForm providers={configuredSocialProviders(process.env)} socialError={socialError} accountCreated={params.created === "1"} emailChanged={params.emailChanged === "1"} /></>;
}
