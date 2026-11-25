import Link from "next/link";
import {
  computeCashSummary,
  dashboardInsights,
  topSellingProducts,
  type DashboardSale,
} from "@/lib/dashboard-insights";
import {
  dateLisible,
  dinars,
  indexLots,
  quantite,
  stockArticle,
  type ProductionItem,
  type StockArticle,
  type StockLot,
  type VentesJour,
} from "@/lib/workspace-data";
import { whatsappOrderUrl } from "@/lib/whatsapp";
import { sumOpenCreditsDa, type CreditEntry } from "@/lib/credits";
import type { OwnerPriceAlert } from "@/lib/owner-price-guard";
import ProductionBoard from "./production-board";
import SalesChart from "./sales-chart";
import CashClosingQuickWidget from "./cash-closing-quick";
import CreditsWorkspace from "./credits-workspace";
import ExpressOnboarding from "./express-onboarding";
import OwnerPriceAlerts from "./owner-price-alerts";
import KitchenLabScreen from "./kitchen-lab-screen";
import { Tr } from "./locale-provider";
import { Icon } from "./workspace-icons";
import { Notice } from "./workspace-ui";

export type DashboardUpcomingCake = {
  id: string;
  numero: string;
  client: string;
  telephone: string | null;
  eventDate: string;
  portions: number;
  prixTotalDa: number;
  acompteDa: number;
  resteDa: number;
  statut: string;
  notes?: string | null;
};

type CloseStatus = { id: string; site: string; closed: boolean; cashDeclared: boolean }[] | null;

export default function PilotDashboard({
  nom,
  shop,
  today,
  owner,
  articles,
  lots,
  orders,
  series,
  closing,
  sales,
  shopIds,
  estimatedMarginDa = null,
  estimatedMarginPct = null,
  upcomingCakes = [],
  mode = "demo",
  scopeKey = "demo",
  ownerPhoneDefault = "",
  initialCredits = [],
  creditsTableAvailable = true,
  initialOwnerAlerts = [],
  onDemoImportPack,
}: {
  nom: string;
  shop: string;
  today: string;
  owner: boolean;
  articles: (StockArticle & { prixTTC?: number })[] | null;
  lots: StockLot[] | null;
  orders: ProductionItem[] | null;
  series: VentesJour[] | null;
  closing: CloseStatus;
  sales: DashboardSale[] | null;
  shopIds: string[] | null;
  estimatedMarginDa?: number | null;
  estimatedMarginPct?: number | null;
  upcomingCakes?: DashboardUpcomingCake[];
  mode?: "demo" | "supabase";
  scopeKey?: string;
  ownerPhoneDefault?: string;
  initialCredits?: CreditEntry[];
  creditsTableAvailable?: boolean;
  initialOwnerAlerts?: OwnerPriceAlert[];
  onDemoImportPack?: () => void;
}) {
  const insight = dashboardInsights(series, articles, lots, today);
  const topProducts = topSellingProducts(sales, articles, today, 7);
  const cashToday = computeCashSummary(sales, today);
  const todaySales = series?.at(-1);
  const byArticle = indexLots(lots ?? []);
  const low =
    articles && lots
      ? articles
          .map((a) => ({ a, ...stockArticle(a, byArticle.get(a.id) ?? [], today) }))
          .filter((x) => x.signals.some((s) => s.label === "Rupture" || s.label === "Stock bas"))
      : null;

  const activeCakes = upcomingCakes.filter((c) => c.statut !== "livre" && c.statut !== "annule");
  const totalResteCakes = Math.round(activeCakes.reduce((sum, c) => sum + Math.max(0, c.resteDa), 0));
  const todayCakesCount = activeCakes.filter((c) => c.eventDate === today).length;
  const todayRevenue = todaySales?.ttc ?? 0;

  const displayedMarginDa =
    estimatedMarginDa !== null
      ? estimatedMarginDa
      : todayRevenue > 0
        ? Math.round(todayRevenue * 0.55)
        : 0;
  const displayedMarginPct =
    estimatedMarginPct !== null
      ? estimatedMarginPct
      : todayRevenue > 0
        ? 55
        : null;

  const alreadyClosed = Boolean(closing && closing.length > 0 && closing.every((c) => c.closed));
  const openCreditsTotal = sumOpenCreditsDa(initialCredits);
  const showExpressOnboarding = owner && articles !== null && articles.length === 0;

  return (
    <div className="pg-dashboard pg-pilot-home pg-stack">
      <header className="pg-dashboard-lead">
        <div className="pg-dash-copy">
          <p className="pg-kicker">
            {shop} · {owner ? "TABLEAU DE BORD PATRON" : "LABORATOIRE"}
          </p>
          <h1>Bonjour {nom}.</h1>
          <p className="pg-page-description">
            {owner
              ? "Ventes, bénéfice estimé, commandes à livrer et caisse du jour — tout l’essentiel en un coup d’œil."
              : "Vos fournées à préparer et les quantités disponibles en stock."}
          </p>
          <div className="pg-dash-hero-actions">
            {owner ? (
              <>
                <Link className="pg-button" href="/caisse">
                  <Icon name="receipt" size={17} /> Ouvrir la caisse
                </Link>
                <Link className="pg-button pg-button-secondary" href="/cake-design">
                  <Icon name="cake" size={17} /> Nouvelle commande gâteau
                </Link>
              </>
            ) : (
              <>
                <Link className="pg-button" href="/production">
                  Voir la production
                </Link>
                <Link className="pg-button pg-button-secondary" href="/stocks">
                  Voir les stocks
                </Link>
              </>
            )}
          </div>
        </div>
        <span className="pg-dash-date">
          <Icon name="calendar" size={16} /> {dateLisible(today, "full")}
        </span>
      </header>

      {owner && (
        <>
          <OwnerPriceAlerts
            mode={mode}
            scopeKey={scopeKey}
            initialAlerts={initialOwnerAlerts}
          />
          {showExpressOnboarding && (
            <ExpressOnboarding
              initialShopName={shop}
              mode={mode}
              onDemoImportPack={onDemoImportPack}
            />
          )}
          {/* 4 cartes KPI fortes */}
          <section className="pg-home-kpis" aria-label="Indicateurs clés du jour">
            <Link href="/caisse" className="pg-card pg-metric">
              <div>
                <span><Tr fr="Ventes du jour" ar="مبيعات اليوم" /></span>
                <span className="pg-emblem">
                  <Icon name="trend" size={18} />
                </span>
              </div>
              <strong>{series ? dinars(todayRevenue, false) : "—"}</strong>
              <small>
                {series
                  ? `${todaySales?.tickets ?? 0} ticket${(todaySales?.tickets ?? 0) > 1 ? "s" : ""}${
                      insight.variation !== null
                        ? ` · ${insight.variation >= 0 ? "+" : ""}${insight.variation.toFixed(0)} % vs sem. dern.`
                        : ""
                    }`
                  : "Lecture indisponible"}
              </small>
            </Link>

            <Link href="/recettes" className="pg-card pg-metric">
              <div>
                <span><Tr fr="Bénéfice estimé (aujourd’hui)" ar="الربح التقديري (اليوم)" /></span>
                <span className="pg-emblem" style={{ background: "var(--pg-ok-bg)", color: "var(--pg-ok-ink)" }}>
                  <Icon name="check" size={18} />
                </span>
              </div>
              <strong>{series ? dinars(displayedMarginDa, false) : "—"}</strong>
              <small>
                {displayedMarginPct !== null
                  ? `Marge estimée ~${displayedMarginPct.toFixed(0)} % · voir Recettes & Coûts`
                  : "Enregistrez vos ventes ou recettes"}
              </small>
            </Link>

            <Link href="/cake-design" className="pg-card pg-metric">
              <div>
                <span><Tr fr="Commandes & gâteaux" ar="الطلبيات والحلويات" /></span>
                <span className="pg-emblem" style={{ background: "var(--pg-violet-bg)", color: "var(--pg-violet-ink)" }}>
                  <Icon name="cake" size={18} />
                </span>
              </div>
              <strong>{activeCakes.length} à livrer</strong>
              <small>
                {todayCakesCount > 0 ? `${todayCakesCount} aujourd’hui · ` : ""}
                Reste à encaisser : {dinars(totalResteCakes, false)}
              </small>
            </Link>

            <Link href="/stocks?filtre=alerte" className="pg-card pg-metric">
              <div>
                <span><Tr fr="Alertes stock" ar="تنبيهات المخزون" /></span>
                <span
                  className="pg-emblem"
                  style={
                    (low?.length ?? 0) > 0
                      ? { background: "var(--pg-warn-bg)", color: "var(--pg-warn-ink)" }
                      : { background: "var(--pg-ok-bg)", color: "var(--pg-ok-ink)" }
                  }
                >
                  <Icon name="alert" size={18} />
                </span>
              </div>
              <strong>{low === null ? "—" : `${low.length} alerte${low.length > 1 ? "s" : ""}`}</strong>
              <small>
                {low === null
                  ? "Stock indisponible"
                  : low.length === 0
                    ? "Tous les stocks sont bons ✓"
                    : `${low
                        .slice(0, 2)
                        .map((x) => x.a.nom)
                        .join(", ")}`}
              </small>
            </Link>
          </section>

          {/* 2 visuels clairs côte à côte */}
          <div className="grid gap-4 lg:grid-cols-2">
            <SalesChart series={series} />

            <section className="pg-card pg-card-pad pg-stack">
              <div className="pg-card-head">
                <div>
                  <h2>Top 5 des produits les plus vendus</h2>
                  <p>Sur les 7 derniers jours · ce qui fait votre chiffre</p>
                </div>
                <Link className="pg-text-link" href="/caisse">
                  Voir les ventes →
                </Link>
              </div>
              {topProducts === null ? (
                <Notice kind="warning">Détail des ventes par produit indisponible.</Notice>
              ) : topProducts.length === 0 ? (
                <p className="pg-muted text-sm">Aucune vente enregistrée sur les 7 derniers jours.</p>
              ) : (
                <ul className="space-y-3">
                  {topProducts.map((p, idx) => (
                    <li key={p.id} className="space-y-1">
                      <div className="flex items-center justify-between gap-2 text-sm">
                        <span className="font-bold">
                          <span className="pg-muted mr-1.5">#{idx + 1}</span>
                          {p.nom}
                        </span>
                        <span className="text-right font-bold">
                          {quantite(p.qty, p.unite)}
                          {p.revenueDa > 0 ? ` · ${dinars(p.revenueDa, false)}` : ""}
                        </span>
                      </div>
                      <div className="h-2.5 w-full overflow-hidden rounded-full" style={{ background: "var(--pg-subtle)" }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(8, p.sharePct)}%`,
                            background: "var(--pg-accent)",
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          {/* 2 blocs opérationnels simples */}
          <div className="grid gap-4 lg:grid-cols-2">
            <section className="pg-card pg-card-pad pg-stack">
              <div className="pg-card-head">
                <div>
                  <h2>Prochaines commandes à livrer</h2>
                  <p>Mariages, anniversaires · acomptes &amp; WhatsApp client</p>
                </div>
                <Link className="pg-text-link" href="/cake-design">
                  Tout voir →
                </Link>
              </div>
              {activeCakes.length === 0 ? (
                <div className="pg-empty">
                  <b>Aucune commande en attente</b>
                  <p>Enregistrez vos commandes spéciales (mariage, anniversaire) avec acompte.</p>
                  <Link href="/cake-design" className="pg-button pg-button-secondary mt-2">
                    + Ajouter une commande
                  </Link>
                </div>
              ) : (
                <ul className="space-y-3">
                  {activeCakes.slice(0, 4).map((c) => {
                    const wa = whatsappOrderUrl({
                      phone: c.telephone,
                      client: c.client,
                      numero: c.numero,
                      eventDate: c.eventDate,
                      parts: c.portions,
                      resteDa: c.resteDa,
                    });
                    return (
                      <li key={c.id} className="rounded-xl border p-3 text-sm space-y-2" style={{ background: "var(--pg-subtle)" }}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <b>{c.client}</b> · <span className="pg-muted">{c.portions} parts</span>
                            <div className="text-xs pg-muted">
                              Retrait : <b>{dateLisible(c.eventDate, "full")}</b>
                              {c.notes ? ` · ${c.notes}` : ""}
                            </div>
                          </div>
                          {wa && (
                            <a
                              href={wa}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                            >
                              WhatsApp
                            </a>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          <span className="pg-badge" data-tone="success">
                            Acompte : {dinars(c.acompteDa, false)}
                          </span>
                          <span className="pg-badge" data-tone={c.resteDa > 0 ? "warning" : "success"}>
                            Reste : {dinars(c.resteDa, false)}
                          </span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <CashClosingQuickWidget
              today={today}
              shop={shop}
              mode={mode}
              siteId={shopIds?.[0] ?? ""}
              expectedCashDa={cashToday?.cashDa ?? todayRevenue}
              cardDa={cashToday?.cardDa ?? 0}
              transferDa={cashToday?.transferDa ?? 0}
              totalVentesDa={todayRevenue}
              resteEncaisserDa={totalResteCakes + openCreditsTotal}
              tickets={cashToday?.tickets ?? todaySales?.tickets ?? 0}
              alreadyClosed={alreadyClosed}
              ownerPhoneDefault={ownerPhoneDefault}
            />
          </div>

          {(mode === "demo" || creditsTableAvailable) && (
            <CreditsWorkspace
              mode={mode}
              scopeKey={scopeKey}
              shop={shop}
              today={today}
              initialCredits={initialCredits}
              compact
            />
          )}
        </>
      )}

      {!owner && (
        <>
          <KitchenLabScreen
            mode={mode}
            scopeKey={scopeKey}
            today={today}
            auteurNom={nom}
            auteurRole="labo"
            orders={orders ?? []}
            cakes={upcomingCakes.map((c) => ({
              id: c.id,
              numero: c.numero,
              client: c.client,
              eventDate: c.eventDate,
              portions: c.portions,
              statut: c.statut,
              notes: c.notes,
            }))}
          />
          <section className="pg-card pg-card-pad">
            <h2>Stocks à vérifier</h2>
            {low === null ? (
              <Notice kind="warning">Stock indisponible.</Notice>
            ) : low.length === 0 ? (
              <p>Aucune rupture ou alerte de seuil.</p>
            ) : (
              <ul className="pg-home-rows">
                {low.slice(0, 6).map((x) => (
                  <li key={x.a.id}>
                    <b>{x.a.nom}</b>
                    <span>
                      {quantite(x.quantity, x.a.unite)} · seuil {quantite(x.a.seuil, x.a.unite)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      {!owner && <ProductionBoard orders={orders} preview />}
    </div>
  );
}
