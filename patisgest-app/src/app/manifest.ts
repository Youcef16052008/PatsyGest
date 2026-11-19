import type { MetadataRoute } from "next";

/**
 * Manifeste PWA (NF-02 + NF-06 : tablette Android 9+, installable).
 * Servi sur /manifest.webmanifest. `display: standalone` évite la barre
 * d'adresse sur tablette : c'est ce qui rend la caisse crédible au comptoir.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PâtisGest — Gestion pâtisserie",
    short_name: "PâtisGest",
    description:
      "Coût réel, marge réelle, caisse hors-ligne. Du laboratoire à la boutique.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#f8fafc",
    theme_color: "#6d28d9",
    lang: "fr",
    dir: "ltr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Raccourcis du quotidien : un vendeur ouvre la caisse en un geste.
    shortcuts: [
      { name: "Caisse", short_name: "Caisse", url: "/caisse" },
      { name: "Tableau de bord", short_name: "Pilotage", url: "/tableau-de-bord" },
    ],
  };
}
