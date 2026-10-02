import { guardMaintenance } from '@/lib/admin/maintenance-access';
import { TestContextError } from "@/lib/admin/test-session";
import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { resolveRequestIdentity, anonymousMutationContext } from "@/lib/admin/test-session-store";
import { MutationContextProvider } from "@/components/mutation-context";
import { TestSessionBanner } from "@/components/admin/test-session-banner";
import { SiteStatus } from "@/components/layout/site-status";
import { hasMaintenanceBypass } from "@/lib/admin/maintenance-access";
import { getUserDefaults } from "@/lib/spiders";
import { BRAND_ICON_SRC } from "@/lib/brand";
import { normalizeTheme } from "@/lib/constants";
import "./globals.css";

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Nunito({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
});

export const metadata: Metadata = {
  title: "Polly's Web",
  description: "Your little corner of the web. Track. Care. Celebrate.",
  applicationName: "Polly's Web",
  icons: {
    icon: [{ url: BRAND_ICON_SRC }],
    apple: [{ url: BRAND_ICON_SRC }],
  },
  appleWebApp: {
    capable: true,
    title: "Polly's Web",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#6b4c7a",
};

/** Auth + DB theme lookup — keep the whole app request-rendered. */
export const dynamic = "force-dynamic";

async function resolveTheme(identity: Awaited<ReturnType<typeof resolveRequestIdentity>>) {
  try {
    if (!identity) return "system";
    await guardMaintenance('read',identity);
    const user = await getUserDefaults(identity.effectiveUserId);
    return normalizeTheme(user?.theme);
  } catch (error) {
    // During `next build`, Next may probe routes statically before dynamism
    // is finalized. auth() throws DYNAMIC_SERVER_USAGE — that is expected.
    const digest =
      typeof error === "object" &&
      error !== null &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string"
        ? (error as { digest: string }).digest
        : null;
    if (digest !== "DYNAMIC_SERVER_USAGE") {
      console.error("[layout] theme lookup failed", error);
    }
    return "system";
  }
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  let identity = null;
  let invalidTestContext = false;
  try { identity = await resolveRequestIdentity(); } catch(error) {
    identity = null;
    invalidTestContext = error instanceof TestContextError;
  }
  const theme = await resolveTheme(identity);
  let context="";
  try { context=identity?.contextVersion ?? (invalidTestContext ? "" : anonymousMutationContext()); } catch { /* Static fallback does not need auth. */ }
  const maintenanceBypass = identity ? await hasMaintenanceBypass(identity) : false;

  return (
    <html
      lang="en"
      data-theme={theme}
      className={`${display.variable} ${body.variable} h-full`}
    >
      <body className="min-h-full antialiased">
        <div
          aria-hidden
          className="cosmic-orbit pointer-events-none fixed inset-0 -z-10"
        />
        <MutationContextProvider value={context}>
          <SiteStatus bypass={maintenanceBypass} canHaveBypass={Boolean(identity)} />
          <TestSessionBanner identity={identity} invalid={invalidTestContext} />
          {children}
        </MutationContextProvider>
        <Analytics />
      </body>
    </html>
  );
}
