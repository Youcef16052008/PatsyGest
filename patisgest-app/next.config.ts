import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Lorsque l'application est lancée depuis la racine du dépôt (workspace npm),
// charger un éventuel `.env.local` ou `.env` racine en repli sans jamais
// écraser `process.env` ni `patisgest-app/.env.local`.
for (const envName of [".env.local", ".env"]) {
  const rootEnvPath = path.resolve(process.cwd(), "..", envName);
  if (fs.existsSync(rootEnvPath) && typeof process.loadEnvFile === "function") {
    process.loadEnvFile(rootEnvPath);
  }
}

const nextConfig: NextConfig = {
  output: "standalone",
  // L'Edge local n'expose pas forcément VERCEL_ENV à l'exécution : figer ce
  // booléen non secret à la compilation, en plus du contrôle côté serveur.
  env: {
    PATISGEST_PREVIEW_BLOCKED: process.env.VERCEL_ENV === "preview" ? "1" : "0",
    // Mode « tout gratuit » : pas d'essai, pas de verrouillage, pas de paiement
    // tant que l'abonnement n'est pas ouvert. Piloté par `lib/licence-mode.ts`.
    NEXT_PUBLIC_PATISGEST_MODE_GRATUIT: process.env.PATISGEST_MODE_GRATUIT ?? "1",
  },
  devIndicators: false,
  // Tesseract.js doit rester un paquet Node externe : le worker WASM et les
  // modèles sont chargés depuis des chemins de fichiers explicites.
  serverExternalPackages: ["tesseract.js", "tesseract.js-core"],
  outputFileTracingIncludes: {
    "/api/invoice-ocr": [
      "./node_modules/tesseract.js/**/*",
      "./node_modules/tesseract.js/src/worker-script/**/*",
      "./node_modules/tesseract.js-core/**/*",
      "./public/tessdata/**/*",
    ],
  },
  experimental: {
    // Sauvegarde : 4 Mio de fichier + l'enveloppe du formulaire, sous la
    // limite de 4,5 Mo du corps de requête sur l'hébergement de production.
    serverActions: { bodySizeLimit: "4.25mb" },
  },
  // Allow AI Studio preview and sandbox dev hosts to reach development resources.
  allowedDevOrigins: [
    "*.run.app",
    ...(process.env.E2B_SANDBOX_ID
      ? [`3000-${process.env.E2B_SANDBOX_ID}.e2b.app`]
      : []),
  ],
  async headers() {
    const isProd = process.env.NODE_ENV === "production";
    const securityHeaders = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
      ...(isProd
        ? [
            { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
            { key: "X-Frame-Options", value: "DENY" },
            {
              key: "Content-Security-Policy",
              value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
            },
          ]
        : []),
    ];
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
