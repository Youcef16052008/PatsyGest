/**
 * Alertes de variation de prix fournisseur (> 10 %) calculées à partir de
 * l'historique des prix alimenté à chaque réception (migration 10).
 * Pur et testable : compare le dernier prix connu au précédent pour chaque
 * couple (article, fournisseur).
 */

export type PricePoint = {
  articleId: string;
  fournisseurId: string;
  datePrix: string;
  pu: number;
};

export type PriceAlert = {
  articleId: string;
  fournisseurId: string;
  latest: number;
  previous: number;
  deltaPct: number; // variation en % arrondie à1 décimale
  dateLatest: string;
};

export const PRICE_ALERT_THRESHOLD = 10;

/** Dernier prix vs précédent par couple (article, fournisseur) — seuil >10 %. */
export function computePriceAlerts(points: PricePoint[]): PriceAlert[] {
  const byKey = new Map<string, PricePoint[]>();
  for (const p of points) {
    const key = `${p.articleId}|${p.fournisseurId}`;
    const list = byKey.get(key) ?? [];
    list.push(p);
    byKey.set(key, list);
  }
  const alerts: PriceAlert[] = [];
  for (const [key, list] of byKey) {
    const sorted = [...list].sort((a, b) =>
      a.datePrix === b.datePrix ? 0 : a.datePrix < b.datePrix ? 1 : -1,
    );
    if (sorted.length < 2) continue;
    const latest = sorted[0];
    const previous = sorted[1];
    if (!(previous.pu > 0)) continue;
    const deltaPct = Math.round(((latest.pu - previous.pu) / previous.pu) * 1000) / 10;
    if (Math.abs(deltaPct) <= PRICE_ALERT_THRESHOLD) continue;
    const [articleId, fournisseurId] = key.split("|");
    alerts.push({
      articleId,
      fournisseurId,
      latest: latest.pu,
      previous: previous.pu,
      deltaPct,
      dateLatest: latest.datePrix,
    });
  }
  return alerts.sort((a, b) => Math.abs(b.deltaPct) - Math.abs(a.deltaPct));
}
