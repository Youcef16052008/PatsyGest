"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import {
  ATTENTE_SERVEUR,
  snapshotAttenteClotureNavigateur,
} from "@/lib/file-attente-cloture";

export default function NetworkStatusPill({ inline = false }: { inline?: boolean }) {
  const online = useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );

  // H10-06/H11-09 : plus de balayage JSON maison qui renvoyait 0 sur une
  // valeur corrompue. Le snapshot est stable et signale toute file illisible.
  const attente = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("online", cb);
      window.addEventListener("patisgest-sale-queue", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("online", cb);
        window.removeEventListener("patisgest-sale-queue", cb);
      };
    },
    snapshotAttenteClotureNavigateur,
    () => ATTENTE_SERVEUR,
  );
  const queuedCount = attente.tickets;
  const fileAVerifier = attente.illisible;

  if (online && queuedCount === 0 && !fileAVerifier) {
    if (!inline) return null;
    return (
      <span className="pg-badge" data-tone="success" title="Connexion Internet active">
        Connecté ✓
      </span>
    );
  }

  if (!online) {
    return (
      <div
        role="status"
        className="pg-notice flex flex-wrap items-center justify-between gap-2"
        data-kind="warning"
      >
        <span>
          <strong>Mode hors-ligne actif</strong> · Pas d’inquiétude : vos ventes continuent d’être
          sauvegardées sur cet appareil{queuedCount > 0 ? ` (${queuedCount} ticket${queuedCount > 1 ? "s" : ""} en attente)` : ""}.
          {fileAVerifier ? " Une file locale est illisible : ne l’effacez pas, faites-la vérifier." : ""}
        </span>
        <Link href="/hors-ligne" className="pg-text-link text-xs">
          Voir l’espace hors-ligne →
        </Link>
      </div>
    );
  }

  return (
    <div
      role="status"
      className="pg-notice flex flex-wrap items-center justify-between gap-2"
      data-kind={fileAVerifier ? "warning" : "success"}
    >
      <span>
        <strong>Connexion rétablie</strong> ·{" "}
        {queuedCount > 0
          ? `${queuedCount} ticket${queuedCount > 1 ? "s" : ""} enregistré${queuedCount > 1 ? "s" : ""} hors-ligne prêt${queuedCount > 1 ? "s" : ""} à synchroniser.`
          : "une file locale est illisible. Ne l’effacez pas : faites-la vérifier avant de synchroniser."}
        {fileAVerifier && queuedCount > 0
          ? " Une autre file locale est illisible : ne l’effacez pas, faites-la vérifier."
          : ""}
      </span>
      <Link href="/caisse" className="pg-button text-xs">
        Synchroniser maintenant →
      </Link>
    </div>
  );
}
