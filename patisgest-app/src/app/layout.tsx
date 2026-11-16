import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "PâtisGest — Gestion pâtisserie",
  description:
    "PâtisGest : ton coût VRAI, ta marge RÉELLE. Stocks, recettes, production, caisse.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-slate-100 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
