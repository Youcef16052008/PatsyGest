import { estLotEligible, plusJours, type StockArticle, type StockLot, type VentesJour } from './workspace-data.ts';

/** Indicateurs descriptifs, pas prévisions ni avis comptable. */
export function dashboardInsights(series: VentesJour[] | null, articles: StockArticle[] | null, lots: StockLot[] | null, today: string) {
  const previous = series?.filter(d => d.day >= plusJours(today,-13) && d.day <= plusJours(today,-7)) ?? [];
  const recent = series?.filter(d => d.day >= plusJours(today,-6) && d.day <= today) ?? [];
  const sum = (days: VentesJour[]) => Math.round(days.reduce((acc,d)=>acc+d.ttc,0)*100)/100;
  const thisWeek = series && recent.length===7 ? sum(recent) : null;
  const lastWeek = series && previous.length===7 ? sum(previous) : null;
  const variation = thisWeek!==null && lastWeek!==null && lastWeek>0 ? (thisWeek-lastWeek)/lastWeek*100 : null;
  const shortages = articles && lots ? articles.filter(a=>a.niveau==='produit').map(a=>{
    const qty=lots.filter(l=>l.articleId===a.id && estLotEligible(l,today)).reduce((sum,l)=>sum+l.qte,0);
    return {id:a.id,nom:a.nom,unite:a.unite,qty:Math.round(qty*10000)/10000,seuil:Number(a.seuil), manque:Math.max(0,Math.round((Number(a.seuil)-qty)*10000)/10000)};
  }).filter(a=>a.qty<=a.seuil).sort((a,b)=>a.qty-a.seuil-(b.qty-b.seuil)) : null;
  return {thisWeek,lastWeek,variation,shortages};
}

export type DashboardSale = {
  date: string;
  totalTTC?: number;
  modePaiement?: string | null;
  lignes: { articleId: string; qty: number; totalTTC?: number }[];
};

/** Moyenne observée sur sept jours calendaires, sans prétendre prédire la demande. */
export function productVelocity(sales: DashboardSale[] | null, articles: StockArticle[] | null, lots: StockLot[] | null, today:string, shopIds: string[] | null) {
  if (!sales || !articles || !lots || !shopIds) return null;
  const start=plusJours(today,-6);
  const totals=new Map<string,number>();
  for(const sale of sales) {
    if(sale.date.slice(0,10)<start || sale.date.slice(0,10)>today) continue;
    for(const l of sale.lignes) if(Number.isFinite(l.qty)&&l.qty>0) totals.set(l.articleId,(totals.get(l.articleId)??0)+l.qty);
  }
  return articles.filter(a=>a.niveau==='produit' && (totals.get(a.id)??0)>0).map(a=>{
    const sold=totals.get(a.id)??0;
    const stock=lots.filter(l=>l.articleId===a.id && shopIds.includes(l.siteId) && estLotEligible(l,today)).reduce((n,l)=>n+l.qte,0);
    return {id:a.id,nom:a.nom,unite:a.unite,sold,stock,days:stock/(sold/7)};
  }).sort((a,b)=>a.days-b.days || a.nom.localeCompare(b.nom,"fr"));
}

export type TopProduct = {
  id: string;
  nom: string;
  unite: string;
  qty: number;
  revenueDa: number;
  sharePct: number;
};

export function topSellingProducts(
  sales: DashboardSale[] | null,
  articles: (StockArticle & { prixTTC?: number })[] | null,
  today: string,
  days = 7,
): TopProduct[] | null {
  if (!sales || !articles) return null;
  const start = plusJours(today, -(days - 1));
  const artById = new Map(articles.map((a) => [a.id, a]));
  const agg = new Map<string, { qty: number; revenue: number }>();

  for (const sale of sales) {
    const d = sale.date.slice(0, 10);
    if (d < start || d > today) continue;
    for (const l of sale.lignes) {
      if (!Number.isFinite(l.qty) || l.qty <= 0) continue;
      const art = artById.get(l.articleId);
      const rev =
        l.totalTTC != null && Number.isFinite(l.totalTTC)
          ? l.totalTTC
          : art?.prixTTC != null && Number.isFinite(art.prixTTC)
            ? l.qty * art.prixTTC
            : 0;
      const prev = agg.get(l.articleId) ?? { qty: 0, revenue: 0 };
      agg.set(l.articleId, {
        qty: prev.qty + l.qty,
        revenue: prev.revenue + rev,
      });
    }
  }

  const list = [...agg.entries()]
    .map(([id, val]) => {
      const art = artById.get(id);
      return {
        id,
        nom: art?.nom ?? "Produit",
        unite: art?.unite ?? "pcs",
        qty: Math.round(val.qty * 100) / 100,
        revenueDa: Math.round(val.revenue * 100) / 100,
      };
    })
    .sort((a, b) => b.revenueDa - a.revenueDa || b.qty - a.qty)
    .slice(0, 5);

  const maxMetric = Math.max(1, ...list.map((p) => (p.revenueDa > 0 ? p.revenueDa : p.qty)));
  return list.map((p) => ({
    ...p,
    sharePct: Math.round(((p.revenueDa > 0 ? p.revenueDa : p.qty) / maxMetric) * 100),
  }));
}

export type TodayCashSummary = {
  totalDa: number;
  cashDa: number;
  cardDa: number;
  transferDa: number;
  tickets: number;
};

export function computeCashSummary(sales: DashboardSale[] | null, today: string): TodayCashSummary | null {
  if (!sales) return null;
  let total = 0;
  let cash = 0;
  let card = 0;
  let transfer = 0;
  let tickets = 0;
  for (const s of sales) {
    if (s.date.slice(0, 10) !== today) continue;
    const t = Math.round((Number(s.totalTTC ?? 0) + Number.EPSILON) * 100);
    if (!Number.isFinite(t) || t < 0) continue;
    total += t;
    tickets += 1;
    if (s.modePaiement === "carte") card += t;
    else if (s.modePaiement === "cheque_virement") transfer += t;
    else cash += t;
  }
  return {
    totalDa: total / 100,
    cashDa: cash / 100,
    cardDa: card / 100,
    transferDa: transfer / 100,
    tickets,
  };
}
