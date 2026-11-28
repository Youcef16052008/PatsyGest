"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { submitEmployeePriceProposalCloud } from "@/lib/actions-price-alerts";
import {
  DEMO_OWNER_ALERTS_KEY_PREFIX,
  evaluateEmployeePriceSubmission,
  type OwnerPriceAlert,
  type PriceAlertProductCategory,
} from "@/lib/owner-price-guard";
import { dateLisible, plusJours, quantite, type ProductionItem } from "@/lib/workspace-data";
import { useLocale } from "./locale-provider";

export type KitchenCakeItem = {
  id: string;
  numero: string;
  client: string;
  eventDate: string;
  portions: number;
  statut: string;
  notes?: string | null;
};

type KitchenStage = "a_faire" | "en_preparation" | "cuisson_deco" | "pret_boutique";

const STAGE_LABEL: Record<KitchenStage, string> = {
  a_faire: "À préparer",
  en_preparation: "En préparation",
  cuisson_deco: "Cuisson / Déco",
  pret_boutique: "Prêt boutique ✓",
};

const STAGE_TONE: Record<KitchenStage, "planned" | "warning" | "success"> = {
  a_faire: "planned",
  en_preparation: "warning",
  cuisson_deco: "warning",
  pret_boutique: "success",
};

const STAGES_KEY_PREFIX = "patisgest.kitchen_stages.v1.";

export default function KitchenLabScreen({
  mode,
  scopeKey,
  today,
  auteurNom,
  auteurRole,
  orders,
  cakes = [],
}: {
  mode: "demo" | "supabase";
  scopeKey: string;
  today: string;
  auteurNom: string;
  auteurRole: string;
  orders: ProductionItem[] | null;
  cakes?: KitchenCakeItem[] | null;
}) {
  const tomorrow = plusJours(today, 1);
  const { locale, t } = useLocale();
  const stageLabels: Record<KitchenStage, string> = locale === "ar"
    ? {
        a_faire: "قيد الانتظار",
        en_preparation: t.stagePrep,
        cuisson_deco: t.stageBake,
        pret_boutique: t.stageReady,
      }
    : STAGE_LABEL;
  const stageStorageKey = `${STAGES_KEY_PREFIX}${scopeKey}`;
  const alertsStorageKey = `${DEMO_OWNER_ALERTS_KEY_PREFIX}${scopeKey}`;

  const stagesSnapshot = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-kitchen-stages", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-kitchen-stages", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(stageStorageKey) ?? "{}";
      } catch {
        return "{}";
      }
    },
    () => "{}",
  );

  const stages: Record<string, KitchenStage> = (() => {
    try {
      const parsed = JSON.parse(stagesSnapshot);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  })();

  const [showPriceForm, setShowPriceForm] = useState(false);
  const [priceFeedback, setPriceFeedback] = useState<{ kind: "success" | "warning" | "error"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [stageError, setStageError] = useState("");
  const [ordersLimit, setOrdersLimit] = useState(8);

  function setStage(itemId: string, nextStage: KitchenStage) {
    try {
      const next = { ...stages, [itemId]: nextStage };
      window.localStorage.setItem(stageStorageKey, JSON.stringify(next));
      window.dispatchEvent(new Event("patisgest-kitchen-stages"));
      setStageError("");
    } catch {
      setStageError("Impossible d’enregistrer ce repère sur cet appareil.");
    }
  }

  function currentStage(itemId: string, rawStatut: string): KitchenStage {
    if (stages[itemId]) return stages[itemId];
    if (rawStatut === "termine" || rawStatut === "produit" || rawStatut === "livre") return "pret_boutique";
    if (rawStatut === "encours" || rawStatut === "partiel") return "en_preparation";
    return "a_faire";
  }

  async function handlePriceProposal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPriceFeedback(null);
    const fd = new FormData(e.currentTarget);
    const nomProduit = String(fd.get("nom") ?? "").trim();
    const categorie = String(fd.get("categorie") ?? "gateau_entier") as PriceAlertProductCategory;
    const prixSaisiDa = Number(fd.get("prix"));
    const coutRaw = String(fd.get("cout") ?? "").trim();
    const coutEstimeDa = coutRaw ? Number(coutRaw) : null;

    if (!nomProduit || !Number.isFinite(prixSaisiDa) || prixSaisiDa <= 0) {
      setPriceFeedback({ kind: "error", text: "Indiquez un nom et un prix positif en DA." });
      return;
    }

    if (mode === "demo") {
      const alert = evaluateEmployeePriceSubmission({
        cibleType: "nouveau_produit",
        nomProduit,
        categorie,
        prixSaisiDa,
        coutEstimeDa,
        auteurNom,
        auteurRole: auteurRole === "proprietaire" ? "labo" : auteurRole,
      });
      if (alert) {
        try {
          const raw = window.localStorage.getItem(alertsStorageKey);
          const list: OwnerPriceAlert[] = raw ? JSON.parse(raw) : [];
          window.localStorage.setItem(alertsStorageKey, JSON.stringify([alert, ...(Array.isArray(list) ? list : [])]));
          window.dispatchEvent(new Event("patisgest-owner-alerts"));
        } catch {
          /* ignore */
        }
        setPriceFeedback({
          kind: alert.severite === "critical" ? "warning" : "success",
          text:
            alert.severite === "critical"
              ? `Prix enregistré (${prixSaisiDa} DA). Alerte envoyée au patron : prix jugé très bas, vérification demandée.`
              : `Prix de « ${nomProduit} » (${prixSaisiDa} DA) enregistré. Une notification vient d’être envoyée au patron.`,
        });
      }
      e.currentTarget.reset();
      setShowPriceForm(false);
      return;
    }

    setBusy(true);
    try {
      const res = await submitEmployeePriceProposalCloud({
        cibleType: "nouveau_produit",
        nomProduit,
        categorie,
        prixSaisiDa,
        coutEstimeDa,
      });
      if (!res.ok) {
        setPriceFeedback({ kind: "error", text: res.erreur ?? "Impossible d’envoyer." });
      } else {
        setPriceFeedback({
          kind: res.alert?.severite === "critical" ? "warning" : "success",
          text:
            res.alert?.severite === "critical"
              ? `Prix enregistré (${prixSaisiDa} DA). Le patron a reçu une alerte « prix très bas ».`
              : res.alert
                ? `Prix de « ${nomProduit} » enregistré et signalé au patron ✓`
                : `Nouveau produit « ${nomProduit} » enregistré ✓`,
        });
        e.currentTarget.reset();
        setShowPriceForm(false);
      }
    } finally {
      setBusy(false);
    }
  }

  const todayCakes = (cakes ?? []).filter((c) => c.statut !== "annule" && c.statut !== "livre" && c.eventDate === today);
  const tomorrowCakes = (cakes ?? []).filter((c) => c.statut !== "annule" && c.statut !== "livre" && c.eventDate === tomorrow);
  const activeOrders = (orders ?? []).filter((o) => o.statut !== "annule" && (o.date === today || o.date === tomorrow || o.statut !== "termine"))
    .slice().sort((a, b) => Number(a.statut === "termine") - Number(b.statut === "termine") || (a.date || "9999").localeCompare(b.date || "9999"));

  return (
    <section className="pg-stack" aria-label="Écran Cuisine et Laboratoire">
      <div className="pg-card pg-card-pad flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="pg-kicker">MODE ÉCRAN CUISINE / LABO</span>
          <h2>{t.kitchenTitle}</h2>
          <p className="pg-muted text-sm">{t.kitchenSub}</p>
        </div>
        <button
          type="button"
          onClick={() => setShowPriceForm((v) => !v)}
          className="pg-button"
        >
          {showPriceForm ? "Fermer" : t.kitchenBtnNew}
        </button>
      </div>

      <p className="pg-kitchen-local-note">Les repères d’avancement ci-dessous sont enregistrés uniquement sur cet appareil. Ils ne modifient pas le statut officiel des commandes ou des fournées.</p>
      {stageError && <p className="pg-notice" data-kind="error" role="alert">{stageError}</p>}
      {priceFeedback && (
        <div className="pg-notice" data-kind={priceFeedback.kind}>
          {priceFeedback.text}
        </div>
      )}

      {showPriceForm && (
        <form onSubmit={handlePriceProposal} className="pg-card pg-card-pad pg-stack">
          <div>
            <h3>Proposer un nouveau gâteau, tarte, cake ou recette</h3>
            <p className="text-xs pg-muted">
              Vous pouvez saisir le prix tout de suite pour ne pas bloquer la vente. Le propriétaire recevra un rappel automatique (et une alerte si le prix semble trop bas).
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="pg-field sm:col-span-2">
              Nom du gâteau / tarte / cake *
              <input name="nom" required maxLength={160} placeholder="Ex : Tarte citron meringuée" className="pg-input" />
            </label>
            <label className="pg-field">
              Catégorie
              <select name="categorie" className="pg-input">
                <option value="gateau_entier">Gâteau entier / Anniversaire</option>
                <option value="tarte">Tarte</option>
                <option value="cake">Cake</option>
                <option value="recette">Recette / Part</option>
                <option value="viennoiserie">Viennoiserie</option>
              </select>
            </label>
            <label className="pg-field">
              Prix proposé (DA) *
              <input name="prix" type="number" min={1} step="any" required placeholder="Ex : 2200" className="pg-input" />
            </label>
            <label className="pg-field sm:col-span-2">
              Coût matières estimé (DA, optionnel)
              <input name="cout" type="number" min={0} step="any" placeholder="Ex : 950 (aide à détecter un prix trop bas)" className="pg-input" />
            </label>
            <div className="sm:col-span-2 flex items-end">
              <button type="submit" disabled={busy} className="pg-button">
                {busy ? "Envoi…" : "Enregistrer & notifier le patron"}
              </button>
            </div>
          </div>
        </form>
      )}

      <div className="pg-kitchen-grid">
        <div className="pg-card pg-card-pad pg-stack">
          <div className="pg-card-head">
            <div>
              <h3>Gâteaux sur commande (Aujourd’hui &amp; Demain)</h3>
              <p>{dateLisible(today)} &amp; {dateLisible(tomorrow)}</p>
            </div>
            {cakes !== null && <span className="pg-badge" data-tone="planned">
              {todayCakes.length + tomorrowCakes.length} commande(s)
            </span>}
          </div>

          {cakes === null ? (
            <p className="pg-notice" data-kind="warning" role="status">Les commandes ne sont pas disponibles ou la liste est incomplète.</p>
          ) : todayCakes.length + tomorrowCakes.length === 0 ? (
            <p className="text-sm pg-muted">Aucun gâteau sur commande prévu aujourd’hui ou demain.</p>
          ) : (
            <div className="space-y-3">
              {[...todayCakes, ...tomorrowCakes].map((c) => {
                const st = currentStage(`cake-${c.id}`, c.statut);
                return (
                  <article key={c.id} className="rounded-xl border p-3.5 space-y-2.5" style={{ background: "var(--pg-subtle)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="text-base">{c.client} · {c.portions} parts</strong>
                        <span className="block text-xs pg-muted">
                          {c.eventDate === today ? "AUJOURD’HUI" : "DEMAIN"} · {c.numero}
                          {c.notes ? ` · ${c.notes}` : ""}
                        </span>
                      </div>
                      <span className="pg-badge" data-tone={STAGE_TONE[st]}>
                        {stageLabels[st]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["en_preparation", "cuisson_deco", "pret_boutique"] as KitchenStage[]).map((target) => (
                        <button
                          key={target}
                          type="button"
                          onClick={() => setStage(`cake-${c.id}`, target)}
                          aria-pressed={st === target}
                          aria-label={`${stageLabels[target]} · ${c.client}`}
                          className={st === target ? "pg-button text-xs" : "pg-button pg-button-secondary text-xs"}
                        >
                          {stageLabels[target]}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <div className="pg-card pg-card-pad pg-stack">
          <div className="pg-card-head">
            <div>
              <h3>Fournées &amp; préparations atelier</h3>
              <p>Cochez l’avancement au fur et à mesure</p>
            </div>
            {orders !== null && <span className="pg-badge" data-tone="planned">
              {activeOrders.length} fournée(s)
            </span>}
          </div>

          {orders === null ? (
            <p className="pg-notice" data-kind="warning" role="status">Les fournées ne sont pas disponibles pour le moment.</p>
          ) : activeOrders.length === 0 ? (
            <p className="text-sm pg-muted">Aucune fournée planifiée pour le moment.</p>
          ) : (
            <div className="space-y-3">
              {activeOrders.slice(0, ordersLimit).map((o) => {
                const st = currentStage(`of-${o.id}`, o.statut);
                return (
                  <article key={o.id} className="rounded-xl border p-3.5 space-y-2.5" style={{ background: "var(--pg-subtle)" }}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <strong className="text-base">{o.title}</strong>
                        <span className="block text-xs pg-muted">
                          Quantité : <b>{quantite(o.planned)}</b> · {o.date ? dateLisible(o.date) : "Atelier"}
                        </span>
                      </div>
                      <span className="pg-badge" data-tone={STAGE_TONE[st]}>
                        {stageLabels[st]}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["en_preparation", "cuisson_deco", "pret_boutique"] as KitchenStage[]).map((target) => (
                        <button
                          key={target}
                          type="button"
                          onClick={() => setStage(`of-${o.id}`, target)}
                          aria-pressed={st === target}
                          aria-label={`${stageLabels[target]} · ${o.title} · ${o.numero}`}
                          className={st === target ? "pg-button text-xs" : "pg-button pg-button-secondary text-xs"}
                        >
                          {stageLabels[target]}
                        </button>
                      ))}
                    </div>
                  </article>
                );
              })}
              {activeOrders.length > ordersLimit && <button type="button" className="pg-button pg-button-secondary" onClick={() => setOrdersLimit((limit) => limit + 8)}>Afficher plus de fournées ({activeOrders.length - ordersLimit} restantes)</button>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
