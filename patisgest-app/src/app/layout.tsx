import type { Metadata } from "next";
import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { APPEARANCE_COOKIE, readAppearance } from "@/lib/appearance";
import { AppearanceProvider } from "@/components/appearance";
import "./globals.css";

export const metadata: Metadata = {
  title: "PâtisGest — Gestion pâtisserie",
  description: "Gérez vos stocks, recettes, fabrications et ventes dans le même espace, du laboratoire à la boutique.",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const initial = readAppearance((await cookies()).get(APPEARANCE_COOKIE)?.value);
  return <html lang="fr" data-design={initial.design} data-mode={initial.modes[initial.design]}>
    <body className="antialiased"><AppearanceProvider initial={initial}>{children}</AppearanceProvider></body>
  </html>;
}
