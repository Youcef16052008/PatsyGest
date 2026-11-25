"use client";
import { demoLots, demoOrders, DEMO_SITES } from "@/lib/demo-workspace";
import { cakeTotals, recipeCost } from "@/lib/patisgest-store";
import { plusJours, serieVentes } from "@/lib/workspace-data";
import PilotDashboard, { type DashboardUpcomingCake } from "./pilot-dashboard";
import { PACK_PATISSERIE_DZ } from "@/lib/pack-patisserie-dz";
import type { Role } from "@/lib/permissions";
import DashboardWorkspace from "./dashboard-workspace";
import DemoCaisse from "./demo-caisse";
import { useDemoWorkspace } from "./demo-workspace";

export default function DemoDashboard({ nom, shop, role }: { nom: string; shop: string; role: Role }) {
  const { data, save } = useDemoWorkspace();
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

  function importPackIntoDemo() {
    if (!data) return;
    const existingCodes = new Set(data.articles.map((a) => a.code.toLowerCase()));
    const added = PACK_PATISSERIE_DZ.filter((item) => !existingCodes.has(item.code.toLowerCase())).map((item) => ({
      id: crypto.randomUUID(),
      code: item.code,
      nom: item.nom,
      niveau: item.niveau,
      unite: item.unite,
      seuil: item.seuil,
      prix: item.prixDa,
      tva: 0,
    }));
    if (added.length > 0) {
      save({ ...data, articles: [...data.articles, ...added] });
    }
  }
  if (role !== "vendeur") {
    const owner = role === "proprietaire";
    const closing =
      owner && data
        ? DEMO_SITES.filter((s) => s.type === "boutique").map((s) => {
            const items = data.closings
              .filter((c) => c.date === today && c.site === s.id)
              .sort((a, b) => b.revision - a.revision);
            return {
              id: s.id,
              site: s.label,
              closed: items.length > 0,
              cashDeclared: items[0]?.caisseBilan != null,
            };
          })
        : null;

    // Calcul du bénéfice estimé du jour à partir des recettes réelles
    let estimatedMarginDa: number | null = null;
    let estimatedMarginPct: number | null = null;
    if (owner && data) {
      const unitCostByProduct = new Map<string, number>();
      for (const r of data.recipes) {
        try {
          const c = recipeCost(data, r.id);
          if (c.missingPrices.length === 0 && Number.isFinite(c.perUnit)) {
            unitCostByProduct.set(r.productId, c.perUnit);
          }
        } catch {
          /* ignore incomplete recipe */
        }
      }
      const todaySales = data.sales.filter((s) => s.date.slice(0, 10) === today);
      if (todaySales.length > 0) {
        let rev = 0;
        let cost = 0;
        for (const s of todaySales) {
          rev += s.totalTTC;
          const lines = s.lines && s.lines.length > 0 ? s.lines : [{ articleId: s.articleId, qty: s.qty }];
          for (const l of lines) {
            const uc = unitCostByProduct.get(l.articleId);
            if (uc != null) cost += uc * l.qty;
          }
        }
        estimatedMarginDa = Math.round(rev - cost);
        estimatedMarginPct = rev > 0 ? Math.round(((rev - cost) / rev) * 1000) / 10 : null;
      } else {
        estimatedMarginDa = 0;
        estimatedMarginPct = null;
      }
    }

    const upcomingCakes: DashboardUpcomingCake[] =
      owner && data
        ? data.cakes
            .slice()
            .sort((a, b) => a.eventDate.localeCompare(b.eventDate))
            .map((c) => {
              const t = cakeTotals(c);
              return {
                id: c.id,
                numero: c.numero,
                client: c.client,
                telephone: c.telephone || null,
                eventDate: c.eventDate,
                portions: c.portions,
                prixTotalDa: c.priceCents / 100,
                acompteDa: t.paid / 100,
                resteDa: t.balance / 100,
                statut: c.status,
                notes: c.notes || null,
              };
            })
        : [];

    const mappedSales =
      owner && data
        ? data.sales.map((s) => ({
            date: s.date,
            totalTTC: s.totalTTC,
            modePaiement: s.modePaiement ?? "especes",
            lignes:
              s.lines?.map((l) => ({
                articleId: l.articleId,
                qty: l.qty,
                totalTTC: l.totalTTC,
              })) ?? [{ articleId: s.articleId, qty: s.qty, totalTTC: s.totalTTC }],
          }))
        : null;

    return (
      <PilotDashboard
        nom={nom}
        shop={shop}
        today={today}
        owner={owner}
        articles={
          data?.articles.map((a) => ({
            id: a.id,
            nom: a.nom,
            code: a.code,
            niveau: a.niveau,
            unite: a.unite,
            seuil: a.seuil,
            prixTTC: Math.round(a.prix * (1 + a.tva / 100) * 100) / 100,
          })) ?? null
        }
        lots={data ? demoLots(data) : null}
        orders={data ? demoOrders(data) : null}
        series={owner && data ? serieVentes(data.sales, today, 30) : null}
        sales={mappedSales}
        shopIds={DEMO_SITES.filter((s) => s.type === "boutique").map((s) => s.id)}
        closing={closing}
        estimatedMarginDa={estimatedMarginDa}
        estimatedMarginPct={estimatedMarginPct}
        upcomingCakes={upcomingCakes}
        mode="demo"
        scopeKey="demo"
        onDemoImportPack={importPackIntoDemo}
      />
    );
  }
  const seller = true;
  return (
    <DashboardWorkspace
      nom={nom}
      shop={shop}
      today={today}
      seller={seller}
      canReadRecipes={!seller}
      series={data ? serieVentes(data.sales, today) : null}
      articles={data?.articles ?? null}
      lots={data ? demoLots(data) : null}
      orders={data ? demoOrders(data) : null}
      caisse={<DemoCaisse dashboard shop={shop} />}
    />
  );
}
