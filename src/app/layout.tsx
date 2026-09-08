import type { Metadata, Viewport } from "next";
import { Fraunces, Nunito } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
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
  title: "Spoodly Space",
  description: "Your little corner of the web. Track. Care. Celebrate.",
  applicationName: "Spoodly Space",
  icons: {
    icon: [{ url: "/api/brand/mark", type: "image/png" }],
    apple: [{ url: "/api/brand/mark" }],
  },
  appleWebApp: {
    capable: true,
    title: "Spoodly Space",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#6b4c7a",
};

/** Auth + DB theme lookup — keep the whole app request-rendered. */
export const dynamic = "force-dynamic";

async function resolveTheme() {
  try {
    const session = await auth();
    if (!session?.user?.id) return "system";
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { theme: true },
    });
    return normalizeTheme(user?.theme);
  } catch (error) {
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
  const theme = await resolveTheme();

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
        {children}
        <Analytics />
      </body>
    </html>
  );
}
