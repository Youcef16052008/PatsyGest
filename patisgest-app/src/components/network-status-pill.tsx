"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";

function readQueueLength(): number {
  try {
    let total = 0;
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (!k || !k.startsWith("patisgest.saleQueue.v1")) continue;
      const raw = window.localStorage.getItem(k);
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) total += parsed.length;
    }
    return total;
  } catch {
    return 0;
  }
}

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

  const queuedCount = useSyncExternalStore(
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
    readQueueLength,
    () => 0,
  );

  if (online && queuedCount === 0) {
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
      data-kind="success"
    >
      <span>
        <strong>Connexion rétablie</strong> · {queuedCount} ticket{queuedCount > 1 ? "s" : ""} enregistré
        {queuedCount > 1 ? "s" : ""} hors-ligne prêt{queuedCount > 1 ? "s" : ""} à synchroniser.
      </span>
      <Link href="/caisse" className="pg-button text-xs">
        Synchroniser maintenant →
      </Link>
    </div>
  );
}
