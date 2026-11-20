import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, readAppearance } from "@/lib/appearance";
import { AppearanceProvider } from "@/components/appearance";
import ServiceWorkerSetup from "@/components/service-worker";
import "./globals.css";

export const metadata: Metadata = {
  title: "PâtisGest — Gestion pâtisserie",
  description: "Gérez vos stocks, recettes, fabrications et ventes dans le même espace, du laboratoire à la boutique.",
  applicationName: "PâtisGest",
  // NF-06 : installation sur tablette Android / PC.
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "PâtisGest" },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#6d28d9" },
    { media: "(prefers-color-scheme: dark)", color: "#1e1b4b" },
  ],
  width: "device-width",
  initialScale: 1,
  // Une caisse ne doit pas dézoomer sous le doigt du vendeur.
  maximumScale: 5,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initial = readAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
  return <html lang="fr" data-design={initial.design} data-mode={initial.modes[initial.design]}>
    <body className="antialiased"><AppearanceProvider initial={initial}>{children}</AppearanceProvider><ServiceWorkerSetup/></body>
  </html>;
}
