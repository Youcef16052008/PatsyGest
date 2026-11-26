import { indexLots, plusJours, quantite, stockArticle, type ProductionItem, type StockArticle, type StockLot } from './workspace-data.ts';

export type DayCake = { id: string; client: string; eventDate: string; statut: string };
export type DayAction = { id: string; title: string; explanation: string; action: string; href: string; urgent: boolean };

export function cakeDayLabel(cake: DayCake) {
  const labels: Record<string, string> = { demande: 'demande', devis: 'devis', acompte: 'acompte reçu', confirme: 'confirmée', produit: 'prête' };
  return `${cake.client} (${labels[cake.statut] ?? 'statut à vérifier'})`;
}

export function productionDayLabel(order: ProductionItem) {
  return Number.isFinite(order.planned) && order.planned > 0
    ? `${order.title} · ${quantite(order.planned)} prévu${order.planned > 1 ? 's' : ''}`
    : order.title;
}

/** Observations issues des données disponibles, pas un diagnostic ou une prévision. */
export function ownerDayPlan({ today, articles, lots, cakes, orders, creditsDa, creditsAvailable, salesAvailable }: {
  today: string; articles: StockArticle[] | null; lots: StockLot[] | null;
  cakes: DayCake[] | null; orders: ProductionItem[] | null; creditsDa: number;
  creditsAvailable: boolean; salesAvailable: boolean;
}) {
  const tomorrow = plusJours(today, 1);
  const activeCakes = cakes?.filter(c => c.statut !== 'livre' && c.statut !== 'annule') ?? [];
  const dueCakes = activeCakes.filter(c => c.eventDate <= today).sort((a, b) => a.eventDate.localeCompare(b.eventDate));
  const tomorrowCakes = activeCakes.filter(c => c.eventDate === tomorrow);
  const tomorrowOrders = orders?.filter(o => o.date === tomorrow && ['planifie', 'encours', 'partiel'].includes(o.statut)) ?? [];
  const actions: DayAction[] = [];
  const expired = lots?.filter(l => !l.bloque && l.qte > 0 && l.dlc && l.dlc < today) ?? [];
  if (articles && lots && expired.length) actions.push({ id: 'expired', title: `${expired.length} lot${expired.length > 1 ? 's' : ''} à date dépassée`, explanation: 'Écartez ces lots et vérifiez les dates avant toute vente ou utilisation.', action: 'Vérifier les lots', href: '/stocks?filtre=alerte', urgent: true });
  if (dueCakes.length) actions.push({ id: 'cakes', title: `${dueCakes.length} commande${dueCakes.length > 1 ? 's' : ''} à vérifier aujourd’hui ou en retard`, explanation: `Vérifiez le statut, le retrait et le règlement : ${dueCakes.slice(0, 2).map(c => c.client).join(', ')}.`, action: 'Voir les commandes', href: '/cake-design', urgent: true });
  const expiring = lots?.filter(l => !l.bloque && l.qte > 0 && l.dlc && l.dlc >= today && l.dlc <= plusJours(today, 2)) ?? [];
  if (articles && lots && expiring.length) actions.push({ id: 'expiring', title: `${expiring.length} lot${expiring.length > 1 ? 's' : ''} avec une date limite proche`, explanation: 'Vérifiez les dates et prévoyez leur utilisation en priorité, si les lots sont encore propres à la consommation.', action: 'Vérifier les dates', href: '/stocks?filtre=alerte', urgent: false });
  if (articles && lots) {
    const index = indexLots(lots);
    const low = articles.map(a => ({ a, stock: stockArticle(a, index.get(a.id) ?? [], today) })).filter(x => x.stock.signals.some(s => s.label === 'Rupture' || s.label === 'Stock bas'));
    if (low.length) actions.push({ id: 'stock', title: `${low.length} article${low.length > 1 ? 's' : ''} en rupture ou en stock bas`, explanation: `${low.slice(0, 2).map(x => x.a.nom).join(', ')}${low.length > 2 ? '…' : ''} : vérifiez les quantités et réapprovisionnez si nécessaire.`, action: 'Voir les stocks', href: '/stocks?filtre=alerte', urgent: false });
  }
  if (creditsAvailable && salesAvailable && creditsDa > 0) actions.push({ id: 'credits', title: 'Crédits clients à suivre', explanation: `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(creditsDa)} DA restent à encaisser. Vérifiez les échéances et relancez si besoin.`, action: 'Ouvrir le carnet', href: '/caisse#carnet-credits', urgent: false });
  return { actions, tomorrowCakes, tomorrowOrders };
}
