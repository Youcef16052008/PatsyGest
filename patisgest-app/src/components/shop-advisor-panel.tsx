"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  analyzeShopHealth,
  DEFAULT_OVERHEAD_CONFIG,
  OVERHEAD_STORAGE_KEY_PREFIX,
  sanitizeOverheadConfig,
  type AlgerianVatRegime,
  type ShopActivity,
  type ShopOverheadConfig,
} from "@/lib/shop-advisor";
import type { DashboardSale } from "@/lib/dashboard-insights";
import {
  dinars,
  type StockArticle,
  type StockLot,
  type VentesJour,
} from "@/lib/workspace-data";
import { Icon } from "./workspace-icons";

export default function ShopAdvisorPanel({
  scopeKey,
  today,
  series,
  sales,
  articles,
  lots,
  shopIds,
  openCreditsDa,
  pendingPriceAlertsCount,
  estimatedMarginPct,
}: {
  scopeKey: string;
  today: string;
  series: VentesJour[] | null;
  sales: DashboardSale[] | null;
  articles: (StockArticle & { prixTTC?: number })[] | null;
  lots: StockLot[] | null;
  shopIds: string[] | null;
  openCreditsDa: number;
  pendingPriceAlertsCount: number;
  estimatedMarginPct: number | null;
}) {
  const storageKey = `${OVERHEAD_STORAGE_KEY_PREFIX}${scopeKey}`;
  const rawConfig = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-overhead-updated", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-overhead-updated", cb);
      };
    },
    () => {
      try {
        return window.localStorage.getItem(storageKey) ?? "__UNCONFIGURED__";
      } catch {
        return "__UNCONFIGURED__";
      }
    },
    () => "__UNCONFIGURED__",
  );

  const savedConfig = useMemo(() => {
    try {
      const raw = JSON.parse(rawConfig) as Partial<ShopOverheadConfig> | null;
      if (!raw || ![raw.monthlyRentDa, raw.monthlyPayrollDa, raw.monthlyUtilitiesDa, raw.openDaysPerMonth, raw.targetFoodCostPct]
        .every((value) => typeof value === "number" && Number.isFinite(value))) return null;
      return sanitizeOverheadConfig(raw);
    } catch {
      return null;
    }
  }, [rawConfig]);
  const configured = savedConfig !== null;
  const config = savedConfig ?? DEFAULT_OVERHEAD_CONFIG;

  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<ShopOverheadConfig | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);
  const [saveError, setSaveError] = useState(false);

  const report = useMemo(
    () =>
      analyzeShopHealth({
        today,
        config,
        series,
        sales,
        articles,
        lots,
        shopIds,
        openCreditsDa,
        pendingPriceAlertsCount,
        estimatedMarginPct,
      }),
    [today, config, series, sales, articles, lots, shopIds, openCreditsDa, pendingPriceAlertsCount, estimatedMarginPct],
  );

  const formConfig = draft ?? config;

  function openEditor() {
    setDraft(config);
    setSavedNotice(false);
    setSaveError(false);
    setShowSettings((v) => !v);
  }

  function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = sanitizeOverheadConfig(formConfig);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
      window.dispatchEvent(new Event("patisgest-overhead-updated"));
    } catch {
      setSaveError(true);
      return;
    }
    setSaveError(false);
    setDraft(null);
    setSavedNotice(true);
    setShowSettings(false);
  }

  const progressBarPct = Math.min(100, Math.max(0, report.todayProgressPct));

  return (
    <section className="pg-card pg-card-pad pg-stack pg-advisor-panel" aria-label="Objectif de ventes indicatif">
      <div className="pg-card-head">
        <div>
          <h2>Objectif de ventes indicatif</h2>
          <p>Une estimation à partir des charges et d’une marge supposée, pas un bénéfice réel.</p>
        </div>
        <button type="button" className="pg-button pg-button-secondary" onClick={openEditor} aria-expanded={showSettings}>
          <Icon name="settings" size={16} /> {showSettings ? "Fermer" : "Renseigner les charges"}
        </button>
      </div>
      {!configured && <p className="pg-muted text-sm">Renseignez et enregistrez vos charges pour calculer un objectif. Les valeurs proposées sont des exemples à adapter.</p>}
      {configured && !series && <p className="pg-muted text-sm">Les ventes sont indisponibles : l’objectif ne peut pas être comparé aujourd’hui.</p>}
      {configured && series && <div className="pg-breakeven-bar-wrap">
        <p><strong>{dinars(report.todayRevenueDa, false)}</strong> de ventes enregistrées / objectif estimé de <strong>{dinars(report.dailyBreakEvenDa, false)}</strong></p>
        <p className="pg-muted text-xs">Calcul basé sur {dinars(report.dailyFixedCostsDa, false)} de charges par jour et une marge estimée de {report.grossMarginPct} %. Vérifiez les charges et coûts avant toute décision.</p>
        <div className="h-3 w-full overflow-hidden rounded-full mt-2" style={{ background: "var(--pg-subtle)" }}>
          <div className="h-full rounded-full" style={{ width: `${progressBarPct}%`, background: "var(--pg-accent)" }} />
        </div>
      </div>}

      {savedNotice && (
        <div className="pg-notice" data-kind="success">
          Charges mensuelles mises à jour : votre objectif de ventes quotidien est recalculé.
        </div>
      )}

      {saveError && <div className="pg-notice" data-kind="error" role="alert">Impossible d’enregistrer les charges dans ce navigateur.</div>}
      {showSettings && (
        <form onSubmit={saveConfig} className="rounded-xl border p-4 grid gap-3 sm:grid-cols-3" style={{ background: "var(--pg-subtle)" }}>
          <div className="sm:col-span-3">
            <strong className="text-sm">Paramètres financiers de la boutique (calcul du seuil anti-perte)</strong>
            <p className="text-xs pg-muted">
              Adaptez ces montants à votre établissement : le résultat reste une estimation.
            </p>
          </div>
          <label className="pg-field">
            Activité principale
            <select
              className="pg-input"
              value={formConfig.shopActivity}
              onChange={(e) => setDraft({ ...formConfig, shopActivity: e.target.value as ShopActivity })}
            >
              <option value="mixte">Boulangerie + Pâtisserie + Cake</option>
              <option value="boulangerie">Boulangerie &amp; Viennoiserie</option>
              <option value="patisserie">Pâtisserie &amp; Orientale</option>
              <option value="cake_shop">Cake Shop &amp; Sur-mesure</option>
            </select>
          </label>
          <label className="pg-field">
            Régime TVA (Algérie · LF 2026)
            <select
              className="pg-input"
              value={formConfig.tvaRegime}
              onChange={(e) => setDraft({ ...formConfig, tvaRegime: e.target.value as AlgerianVatRegime })}
            >
              <option value="ifu_0">Artisan IFU · 0 % TVA (prix net DA)</option>
              <option value="reel_dz">Régime Réel · TVA 9 % / 19 %</option>
            </select>
          </label>
          <label className="pg-field">
            Loyer mensuel (DA)
            <input
              type="number"
              min={0}
              max={50000000}
              className="pg-input"
              value={formConfig.monthlyRentDa}
              onChange={(e) => setDraft({ ...formConfig, monthlyRentDa: Number(e.target.value) })}
            />
          </label>
          <label className="pg-field">
            Salaires équipe + gérant / mois (DA)
            <input
              type="number"
              min={0}
              max={50000000}
              className="pg-input"
              value={formConfig.monthlyPayrollDa}
              onChange={(e) => setDraft({ ...formConfig, monthlyPayrollDa: Number(e.target.value) })}
            />
          </label>
          <label className="pg-field">
            Électricité, gaz, eau, emballages / mois (DA)
            <input
              type="number"
              min={0}
              max={50000000}
              className="pg-input"
              value={formConfig.monthlyUtilitiesDa}
              onChange={(e) => setDraft({ ...formConfig, monthlyUtilitiesDa: Number(e.target.value) })}
            />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="pg-field">
              Jours ouverts / mois
              <input
                type="number"
                min={1}
                max={31}
                className="pg-input"
                value={formConfig.openDaysPerMonth}
                onChange={(e) => setDraft({ ...formConfig, openDaysPerMonth: Number(e.target.value) })}
              />
            </label>
            <label className="pg-field">
              Coût matières (%)
              <input
                type="number"
                min={10}
                max={85}
                className="pg-input"
                value={formConfig.targetFoodCostPct}
                onChange={(e) => setDraft({ ...formConfig, targetFoodCostPct: Number(e.target.value) })}
              />
            </label>
          </div>
          <div className="sm:col-span-3 flex flex-wrap gap-2">
            <button type="submit" className="pg-button">
              Enregistrer et recalculer
            </button>
            <button
              type="button"
              className="pg-button pg-button-secondary"
              onClick={() => {
                setDraft(null);
                setShowSettings(false);
              }}
            >
              Annuler
            </button>
          </div>
        </form>
      )}

    </section>
  );
}
