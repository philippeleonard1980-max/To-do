import type { Metadata, Viewport } from "next";

import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { getViewer } from "@/lib/auth";
import { isMockProvider } from "@/lib/ai";

export const metadata: Metadata = {
  title: { default: "AI Talk", template: "%s · AI Talk" },
  description:
    "Create characters, give them a voice, and talk to them. An open AI roleplay and companion chat platform.",
};

export const viewport: Viewport = {
  themeColor: "#0b0b14",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();
  const theme = viewer?.settings.theme ?? "dark";

  return (
    <html lang="en" data-theme={theme === "system" ? undefined : theme} suppressHydrationWarning>
      <body className="min-h-dvh">
        <SiteHeader
          viewer={
            viewer && {
              username: viewer.username,
              displayName: viewer.displayName,
              avatarUrl: viewer.avatarUrl,
              role: viewer.role,
              plan: viewer.plan,
              credits: viewer.credits,
            }
          }
          mockProvider={isMockProvider()}
        />
        <main className="mx-auto w-full">{children}</main>
      </body>
    </html>
  );
}
