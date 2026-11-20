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

export type DashboardSale = { date:string; lignes:{articleId:string;qty:number}[] };
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
