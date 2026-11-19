"use client";

import { useEffect, useState } from "react";

/**
 * Enregistrement du service worker (NF-02 : caisse utilisable sans internet).
 *
 * Choix : on n'utilise PAS de bibliothèque (Serwist/next-pwa) — 2 dépendances
 * et un plugin de build en plus pour ~150 lignes de cache. Le SW est servi tel
 * quel depuis /public/sw.js, donc il ne dépend pas du bundle Next et reste
 * inspectable sur la tablette d'un pilote.
 *
 * Développement : le SW est désactivé. Un cache persistant pendant le dev
 * masque les modifications et produit des « ça ne se met pas à jour ».
 * Pour tester le hors-ligne en local : `npm run build && npm start`.
 */
export default function ServiceWorkerSetup() {
  const [majPrete, setMajPrete] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let annule = false;

    async function enregistrer() {
      try {
        const inscription = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
        if (annule) return;
        // Une nouvelle version installée attend : proposer le rechargement
        // plutôt que d'appliquer la mise à jour au milieu d'une saisie.
        inscription.addEventListener("updatefound", () => {
          const nouveau = inscription.installing;
          nouveau?.addEventListener("statechange", () => {
            if (nouveau.state === "installed" && navigator.serviceWorker.controller) {
              setMajPrete(true);
            }
          });
        });
      } catch {
        // Pas de SW (navigateur ancien, contexte non sécurisé) : l'app
        // fonctionne en ligne comme avant. Aucun blocage.
      }
    }

    void enregistrer();
    return () => {
      annule = true;
    };
  }, []);

  if (!majPrete) return null;

  return (
    <div className="pg-sw-update" role="status">
      <span>Nouvelle version disponible.</span>
      <button
        type="button"
        onClick={() => {
          navigator.serviceWorker.controller?.postMessage("SKIP_WAITING");
          window.location.reload();
        }}
      >
        Recharger
      </button>
    </div>
  );
}
