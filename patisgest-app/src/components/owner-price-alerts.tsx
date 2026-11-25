"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { resolveOwnerPriceAlertCloud } from "@/lib/actions-price-alerts";
import { FREE_RECIPES_KEY_PREFIX, type FreeRecipe } from "@/lib/free-recipes";
import {
  DEMO_OWNER_ALERTS_KEY_PREFIX,
  resolveOwnerPriceAlert,
  type OwnerPriceAlert,
} from "@/lib/owner-price-guard";
import { dinars } from "@/lib/workspace-data";

export default function OwnerPriceAlerts({
  mode,
  scopeKey,
  initialAlerts = [],
}: {
  mode: "demo" | "supabase";
  scopeKey: string;
  initialAlerts?: OwnerPriceAlert[];
}) {
  const storageKey = `${DEMO_OWNER_ALERTS_KEY_PREFIX}${scopeKey}`;
  const [cloudAlerts, setCloudAlerts] = useState<OwnerPriceAlert[]>(initialAlerts);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newPrice, setNewPrice] = useState<string>("");
  const [feedback, setFeedback] = useState<{ kind: "success" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const demoSnapshot = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-owner-alerts", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-owner-alerts", cb);
      };
    },
    () => {
      if (mode !== "demo") return "";
      try {
        return window.localStorage.getItem(storageKey) ?? "[]";
      } catch {
        return "[]";
      }
    },
    () => "",
  );

  const alerts: OwnerPriceAlert[] =
    mode === "demo"
      ? (() => {
          if (!demoSnapshot) return [];
          try {
            const parsed = JSON.parse(demoSnapshot);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : cloudAlerts;

  const pendingAlerts = alerts.filter((a) => a.traiteStatut === "en_attente");
  if (pendingAlerts.length === 0 && !feedback) return null;

  function persistDemoAlerts(next: OwnerPriceAlert[], resolvedAlert?: OwnerPriceAlert) {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("patisgest-owner-alerts"));

      if (resolvedAlert && resolvedAlert.cibleType === "recette_libre" && resolvedAlert.cibleId) {
        const recKey = `${FREE_RECIPES_KEY_PREFIX}${scopeKey}`;
        const rawRec = window.localStorage.getItem(recKey);
        if (rawRec) {
          const recList = JSON.parse(rawRec) as FreeRecipe[];
          if (Array.isArray(recList)) {
            const updatedRecs = recList.map((r) =>
              r.id === resolvedAlert.cibleId
                ? {
                    ...r,
                    prixVenteDa: resolvedAlert.prixFinalDa ?? r.prixVenteDa,
                    statutPrix: (resolvedAlert.traiteStatut === "bloque" ? "bloque" : "valide") as FreeRecipe["statutPrix"],
                  }
                : r,
            );
            window.localStorage.setItem(recKey, JSON.stringify(updatedRecs));
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  function handleDecision(alert: OwnerPriceAlert, decision: "approuve" | "corrige" | "bloque") {
    setFeedback(null);
    const correctedVal = decision === "corrige" ? Number(newPrice) : null;
    if (decision === "corrige" && (!Number.isFinite(correctedVal) || (correctedVal ?? 0) <= 0)) {
      setFeedback({ kind: "error", text: "Entrez un prix positif valide en DA." });
      return;
    }

    if (mode === "demo") {
      try {
        const updated = resolveOwnerPriceAlert(alert, decision, correctedVal);
        persistDemoAlerts(
          alerts.map((a) => (a.id === alert.id ? updated : a)),
          updated,
        );
        setEditingId(null);
        setNewPrice("");
        setFeedback({
          kind: "success",
          text:
            decision === "approuve"
              ? `Prix de « ${alert.nomProduit} » approuvé (${dinars(alert.prixSaisiDa, false)}).`
              : decision === "corrige"
                ? `Prix de « ${alert.nomProduit} » corrigé à ${dinars(correctedVal ?? 0, false)}.`
                : `Tarif de « ${alert.nomProduit} » bloqué.`,
        });
      } catch (err) {
        setFeedback({ kind: "error", text: err instanceof Error ? err.message : "Erreur" });
      }
      return;
    }

    startTransition(async () => {
      const res = await resolveOwnerPriceAlertCloud(alert.id, decision, correctedVal);
      if (!res.ok) {
        setFeedback({ kind: "error", text: res.erreur ?? "Décision non enregistrée." });
      } else {
        const updated = resolveOwnerPriceAlert(alert, decision, correctedVal);
        setCloudAlerts(alerts.map((a) => (a.id === alert.id ? updated : a)));
        setEditingId(null);
        setNewPrice("");
        setFeedback({
          kind: "success",
          text:
            decision === "approuve"
              ? `Prix de « ${alert.nomProduit} » validé ✓`
              : decision === "corrige"
                ? `Prix corrigé à ${dinars(correctedVal ?? 0, false)} ✓`
                : `Tarif bloqué ✓`,
        });
      }
    });
  }

  const criticalCount = pendingAlerts.filter((a) => a.severite === "critical").length;

  return (
    <section
      aria-label="Alertes prix saisis par l’équipe"
      className="pg-card pg-card-pad pg-stack"
      style={criticalCount > 0 ? { borderColor: "var(--pg-bad-ink)" } : undefined}
    >
      <div className="pg-card-head">
        <div>
          <span className="pg-kicker">CONTRÔLE PATRON · PRIX ÉQUIPE</span>
          <h2>
            {pendingAlerts.length} prix saisi{pendingAlerts.length > 1 ? "s" : ""} à vérifier
          </h2>
          <p>
            Votre équipe peut proposer un prix sans bloquer le travail — vous êtes immédiatement averti pour valider ou corriger.
          </p>
        </div>
        {criticalCount > 0 && (
          <span className="pg-badge" data-tone="danger">
            {criticalCount} prix très bas !
          </span>
        )}
      </div>

      {feedback && (
        <div className="pg-notice" data-kind={feedback.kind}>
          {feedback.text}
        </div>
      )}

      <div className="space-y-3">
        {pendingAlerts.map((a) => (
          <article
            key={a.id}
            className="rounded-xl border p-4 space-y-3"
            style={{
              background: a.severite === "critical" ? "var(--pg-bad-bg)" : "var(--pg-warn-bg)",
              borderColor: a.severite === "critical" ? "var(--pg-bad-ink)" : "var(--pg-warn-ink)",
            }}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="pg-badge" data-tone={a.severite === "critical" ? "danger" : "warning"}>
                    {a.severite === "critical" ? "Alerte prix trop bas" : "Nouveau prix employé"}
                  </span>
                  <strong className="text-base">{a.nomProduit}</strong>
                  <span className="text-xs pg-muted">par {a.auteurNom}</span>
                </div>
                <p className="mt-1 text-sm font-semibold">{a.message}</p>
              </div>
              <div className="text-right">
                <strong className="text-lg block">{dinars(a.prixSaisiDa, false)}</strong>
                {a.coutEstimeDa != null && (
                  <span className="text-xs pg-muted block">
                    Coût : {dinars(a.coutEstimeDa, false)}
                    {a.prixConseilleDa != null ? ` · Conseillé : ${dinars(a.prixConseilleDa, false)}` : ""}
                  </span>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDecision(a, "approuve")}
                className="pg-button text-xs"
              >
                Valider ce prix
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(editingId === a.id ? null : a.id);
                  setNewPrice(String(a.prixConseilleDa ?? a.prixSaisiDa));
                }}
                className="pg-button pg-button-secondary text-xs"
              >
                Corriger le prix
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => handleDecision(a, "bloque")}
                className="pg-button pg-button-secondary text-xs"
              >
                Bloquer ce tarif
              </button>
            </div>

            {editingId === a.id && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <input
                  type="number"
                  min={1}
                  step="any"
                  value={newPrice}
                  onChange={(e) => setNewPrice(e.target.value)}
                  placeholder="Nouveau prix (DA)"
                  className="pg-input w-44"
                />
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => handleDecision(a, "corrige")}
                  className="pg-button text-xs"
                >
                  Appliquer {newPrice ? `${newPrice} DA` : ""}
                </button>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
