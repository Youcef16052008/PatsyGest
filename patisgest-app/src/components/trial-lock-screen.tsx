"use client";

import { useState } from "react";
import type { ServerLicenseBundle, TrialLockReason } from "@/lib/trial-lock-client";

export default function TrialLockScreen({
  clientNom,
  reason,
  expiresAtMs,
  masterPhone,
  onServerBundle,
  onLogout,
}: {
  clientNom?: string;
  reason: TrialLockReason;
  expiresAtMs?: number;
  masterPhone?: string | null;
  onServerBundle?: (bundle: ServerLicenseBundle) => Promise<void> | void;
  onLogout?: () => void;
}) {
  const [checking, setChecking] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const titre =
    reason === "clock_rollback"
      ? "Horloge appareil modifiée — accès verrouillé"
      : reason === "suspended"
        ? "Compte temporairement suspendu"
        : "Période d’essai expirée — application verrouillée";

  const explication =
    reason === "clock_rollback"
      ? "Un recul important de l’heure système a été détecté hors-ligne. Par sécurité, l’accès reste bloqué sur cet appareil jusqu’à reconnexion Internet et validation par l’administrateur Master."
      : reason === "suspended"
        ? "Cet espace a été suspendu par l’administrateur Master. Reconnectez-vous à Internet après régularisation."
        : "Votre période d’essai gratuite est terminée. L’application reste verrouillée définitivement (même hors-ligne) jusqu’au rétablissement d’Internet et à la validation du paiement dans l’espace Master.";

  async function recheckOnline() {
    if (checking) return;
    setChecking(true);
    setStatusMsg("Vérification en cours auprès du serveur…");
    try {
      const res = await fetch("/api/licence/statut", { cache: "no-store" });
      if (!res.ok) {
        setStatusMsg("Serveur inaccessible ou session expirée. Vérifiez votre connexion Internet.");
        return;
      }
      const json = (await res.json()) as {
        ok?: boolean;
        verrouille?: boolean;
        statutAbonnement?: string;
        signedBundle?: ServerLicenseBundle;
      };
      if (json.signedBundle && onServerBundle) {
        await onServerBundle(json.signedBundle);
      }
      if (json.statutAbonnement === "paye" && !json.verrouille) {
        setStatusMsg("Paiement confirmé ! Réouverture de votre espace…");
        window.location.reload();
      } else {
        setStatusMsg("Compte toujours en attente de validation de paiement par Master.");
      }
    } catch {
      setStatusMsg("Aucune connexion Internet détectée. Connectez l’appareil pour vérifier la licence.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pg-lock-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 p-5 backdrop-blur-sm"
    >
      <div className="w-full max-w-lg rounded-2xl border border-rose-300 bg-white p-6 shadow-2xl">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
          Verrouillage licence PâtisGest
        </div>
        <h1 id="pg-lock-title" className="text-xl font-extrabold text-slate-900">
          {titre}
        </h1>
        {clientNom && (
          <p className="mt-1 text-sm font-semibold text-violet-800">{clientNom}</p>
        )}
        <p className="mt-3 text-sm leading-relaxed text-slate-700">{explication}</p>
        {expiresAtMs && reason === "expired" && (
          <p className="mt-2 text-xs text-slate-500">
            Fin d’essai enregistrée :{" "}
            {new Intl.DateTimeFormat("fr-FR", {
              dateStyle: "long",
              timeStyle: "short",
            }).format(new Date(expiresAtMs))}
          </p>
        )}
        {masterPhone && (
          <p className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">
            Contact Master / activation : <strong>{masterPhone}</strong>
          </p>
        )}
        {statusMsg && (
          <p role="status" className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs font-semibold text-amber-900">
            {statusMsg}
          </p>
        )}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={recheckOnline}
            disabled={checking}
            className="pg-button flex-1"
          >
            {checking ? "Vérification…" : "Vérifier l’activation en ligne"}
          </button>
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="pg-button pg-button-secondary"
            >
              Déconnexion
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
