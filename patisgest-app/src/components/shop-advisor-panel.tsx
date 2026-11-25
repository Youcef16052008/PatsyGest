"use client";

import Link from "next/link";
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

const DEFAULT_SNAPSHOT = JSON.stringify(DEFAULT_OVERHEAD_CONFIG);

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
        return window.localStorage.getItem(storageKey) ?? DEFAULT_SNAPSHOT;
      } catch {
        return DEFAULT_SNAPSHOT;
      }
    },
    () => DEFAULT_SNAPSHOT,
  );

  const config = useMemo(() => {
    try {
      return sanitizeOverheadConfig(JSON.parse(rawConfig) as Partial<ShopOverheadConfig>);
    } catch {
      return DEFAULT_OVERHEAD_CONFIG;
    }
  }, [rawConfig]);

  const [showSettings, setShowSettings] = useState(false);
  const [draft, setDraft] = useState<ShopOverheadConfig | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

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
    setShowSettings((v) => !v);
  }

  function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    const cleaned = sanitizeOverheadConfig(formConfig);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(cleaned));
      window.dispatchEvent(new Event("patisgest-overhead-updated"));
    } catch {
      // ignore storage quota errors
    }
    setDraft(null);
    setSavedNotice(true);
    setShowSettings(false);
  }

  const scoreTone =
    report.status === "sain" ? "success" : report.status === "vigilance" ? "warning" : "danger";
  const progressBarPct = Math.min(100, Math.max(2, report.todayProgressPct));
  const sevTone = (sev: string) =>
    sev === "critique"
      ? "danger"
      : sev === "urgent"
        ? "warning"
        : sev === "bravo"
          ? "success"
          : "planned";
  const sevLabel = (sev: string) =>
    sev === "critique"
      ? "Critique"
      : sev === "urgent"
        ? "Action rapide"
        : sev === "bravo"
          ? "Objectif atteint"
          : "Conseil pro";

  return (
    <section className="pg-card pg-card-pad pg-stack pg-advisor-panel" aria-label="Robot Conseiller & Seuil de rentabilité">
      {/* Bandeau exécutif : Score Santé + Jauge Break-Even du jour */}
      <div className="pg-advisor-top">
        <div className="pg-advisor-score-box">
          <div className="pg-advisor-score-ring" data-tone={scoreTone}>
            <strong>{report.score}</strong>
            <span>/ 100</span>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="pg-kicker">ROBOT CONSEILLER ANTI-FERMETURE</span>
              <span className="pg-badge" data-tone={scoreTone}>
                {report.statusLabel}
              </span>
            </div>
            <h2 className="mt-1">
              {report.remainingToBreakEvenTodayDa > 0
                ? `Encore ${dinars(report.remainingToBreakEvenTodayDa, false)} à vendre aujourd’hui`
                : `Objectif du jour atteint (${dinars(report.todayRevenueDa, false)})`}
            </h2>
            <p className="text-xs pg-muted mt-0.5">
              {report.remainingToBreakEvenTodayDa > 0 ? (
                <>
                  Seuil pour couvrir vos charges du jour ({dinars(report.dailyFixedCostsDa, false)}/j) :{" "}
                  <b>{dinars(report.dailyBreakEvenDa, false)}</b>
                  {report.equivalentTopProduct
                    ? ` · soit ~${report.equivalentTopProduct.units} ${report.equivalentTopProduct.unit} de ${report.equivalentTopProduct.nom}`
                    : ""}
                  {report.equivalentTickets ? ` (~${report.equivalentTickets} tickets)` : ""}.
                </>
              ) : (
                <>
                  Charges quotidiennes couvertes · bénéfice net estimé aujourd’hui :{" "}
                  <b className="text-emerald-700">+{dinars(Math.max(0, report.todayNetResultDa), false)}</b>
                  {report.avgTicketDa ? ` · Panier moyen : ${dinars(report.avgTicketDa, false)}` : ""}.
                </>
              )}
            </p>
          </div>
        </div>

        <div className="pg-advisor-actions">
          <button
            type="button"
            className="pg-button pg-button-secondary"
            onClick={openEditor}
            aria-expanded={showSettings}
          >
            <Icon name="settings" size={16} />
            {showSettings ? "Fermer réglages" : "Charges & loyer"}
          </button>
        </div>
      </div>

      {/* Jauge visuelle de rentabilité du jour + repères 30 jours */}
      <div className="pg-breakeven-bar-wrap">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold mb-1.5">
          <span>
            Objectif du jour : <b>{dinars(report.todayRevenueDa, false)}</b> /{" "}
            {dinars(report.dailyBreakEvenDa, false)} ({Math.min(200, report.todayProgressPct)} %)
          </span>
          <span className="pg-muted">
            CA 30j : {dinars(report.revenue30dDa, false)} ({report.monthCoveragePct} % du seuil mensuel{" "}
            {dinars(report.monthlyBreakEvenDa, false)})
            {report.avgTicketDa ? ` · Ticket moyen : ${dinars(report.avgTicketDa, false)}` : ""}
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full" style={{ background: "var(--pg-subtle)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${progressBarPct}%`,
              background:
                report.todayProgressPct >= 100
                  ? "var(--pg-ok-ink)"
                  : report.todayProgressPct >= 60
                    ? "var(--pg-accent)"
                    : "var(--pg-warn-ink)",
            }}
          />
        </div>
      </div>

      {savedNotice && (
        <div className="pg-notice" data-kind="success">
          Charges mensuelles mises à jour : votre objectif de ventes quotidien est recalculé.
        </div>
      )}

      {showSettings && (
        <form onSubmit={saveConfig} className="rounded-xl border p-4 grid gap-3 sm:grid-cols-3" style={{ background: "var(--pg-subtle)" }}>
          <div className="sm:col-span-3">
            <strong className="text-sm">Paramètres financiers de la boutique (calcul du seuil anti-perte)</strong>
            <p className="text-xs pg-muted">
              Adaptez ces montants à votre boulangerie, viennoiserie, pâtisserie ou cake shop pour un calcul exact.
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

      {/* Recommandations priorisées du Robot */}
      <div className="grid gap-3 md:grid-cols-2">
        {report.recommendations.slice(0, 4).map((rec) => (
          <article key={rec.id} className="pg-advisor-card" data-severity={rec.severity}>
            <div className="flex items-start justify-between gap-2">
              <span className="pg-badge" data-tone={sevTone(rec.severity)}>
                {sevLabel(rec.severity)}
              </span>
              <Link href={rec.actionHref} className="pg-text-link text-xs">
                {rec.actionLabel} →
              </Link>
            </div>
            <h3 className="mt-2 text-sm font-bold">{rec.title}</h3>
            <p className="mt-1 text-xs pg-muted leading-relaxed">{rec.detail}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
