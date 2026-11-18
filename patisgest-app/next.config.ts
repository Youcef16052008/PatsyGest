import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
