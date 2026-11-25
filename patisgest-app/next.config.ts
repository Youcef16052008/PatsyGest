import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // L'Edge local n'expose pas forcément VERCEL_ENV à l'exécution : figer ce
  // booléen non secret à la compilation, en plus du contrôle côté serveur.
  env: {
    PATISGEST_PREVIEW_BLOCKED: process.env.VERCEL_ENV === "preview" ? "1" : "0",
    // Mode « tout gratuit » : pas d'essai, pas de verrouillage, pas de paiement
    // tant que l'abonnement n'est pas ouvert. Piloté par `lib/licence-mode.ts`.
    NEXT_PUBLIC_PATISGEST_MODE_GRATUIT: process.env.PATISGEST_MODE_GRATUIT ?? "1",
  },
  devIndicators: false,
  experimental: {
    // Sauvegarde : 4 Mio de fichier + l'enveloppe du formulaire, sous la
    // limite de 4,5 Mo du corps de requête sur l'hébergement de production.
    serverActions: { bodySizeLimit: "4.25mb" },
  },
  // Only the current sandbox preview host can reach development resources.
  allowedDevOrigins: process.env.E2B_SANDBOX_ID
    ? [`3000-${process.env.E2B_SANDBOX_ID}.e2b.app`]
    : [],
};

export default nextConfig;
