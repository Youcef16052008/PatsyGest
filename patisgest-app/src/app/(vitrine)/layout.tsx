import "../globals.css";
import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

/**
 * Mise en page des vitrines publiques.
 *
 * Volontairement séparée de la mise en page de l'application : une vitrine
 * n'a ni navigation interne, ni bandeau hors-ligne, ni session. Un visiteur
 * ne doit pas voir « Caisse » ou « Session expirée ».
 *
 * Le service worker de caisse n'est PAS monté ici : il met en cache le
 * catalogue de vente interne, jamais un catalogue public.
 */
export const metadata: Metadata = {
  title: "Vitrine — PâtisGest",
  description: "Le catalogue en ligne d'une pâtisserie artisanale.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#4c1d95",
};

export default function VitrineLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-white text-slate-900" data-vitrine>
      {children}
    </div>
  );
}
