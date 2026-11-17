/**
 * Rapprochement caisse / clôture : compare le « vendu » déclaré dans la
 * clôture (six flux) aux ventes réelles de la caisse pour le même jour et
 * le même site. Lecture seule — aucun flux n'est modifié.
 * Pur et testable.
 */

export type ClosingLine = {
  articleId: string;
  code?: string;
  name?: string;
  vendu: number;
};

export type ClosingRecord = {
  id: string;
  date: string;
  siteId: string;
  revision: number;
  lignes: ClosingLine[];
};

export type SaleLine = { articleId: string; qty: number };

export type SaleRecord = {
  siteId: string;
  date: string;
  lignes: SaleLine[];
};

export type ReconLine = {
  articleId: string;
  code: string;
  name: string;
  declare: number; // vendu déclaré (clôture)
  caisse: number;  // ventes réelles (caisse)
  ecart: number;   // caisse - déclaré (arrondi4 décimales)
};

export type ReconEntry = {
  clotureId: string;
  date: string;
  siteId: string;
  revision: number;
  lignes: ReconLine[];
  ecartTotalHT?: never; // réservé futur : pas de calcul de prix ici
};

function round4(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/**
 * Pour chaque clôture (dernière révision d'un couple date+site), compare
 * chaque ligne déclarée aux ventes caisse du même jour/site. Les ventes sans
 * ligne de clôture apparaissent en écart « non déclaré ».
 */
export function computeReconciliation(
  clotures: ClosingRecord[],
  sales: SaleRecord[],
): ReconEntry[] {
  // Garder uniquement la dernière révision par (date, site).
  const latest = new Map<string, ClosingRecord>();
  for (const c of clotures) {
    const key = `${c.date}|${c.siteId}`;
    const prev = latest.get(key);
    if (!prev || c.revision > prev.revision) latest.set(key, c);
  }

  const salesByKey = new Map<string, Map<string, number>>();
  for (const s of sales) {
    const key = `${s.date}|${s.siteId}`;
    const byArticle = salesByKey.get(key) ?? new Map<string, number>();
    for (const line of s.lignes) {
      byArticle.set(line.articleId, round4((byArticle.get(line.articleId) ?? 0) + line.qty));
    }
    salesByKey.set(key, byArticle);
  }

  const entries: ReconEntry[] = [];
  for (const c of latest.values()) {
    const byArticle = salesByKey.get(`${c.date}|${c.siteId}`) ?? new Map<string, number>();
    const seen = new Set<string>();
    const lignes: ReconLine[] = [];
    for (const line of c.lignes) {
      seen.add(line.articleId);
      const caisse = byArticle.get(line.articleId) ?? 0;
      lignes.push({
        articleId: line.articleId,
        code: line.code ?? line.articleId.slice(0, 8),
        name: line.name ?? "",
        declare: round4(line.vendu),
        caisse,
        ecart: round4(caisse - line.vendu),
      });
    }
    // Ventes d'un produit absent de la clôture : non déclaré.
    for (const [articleId, qty] of byArticle) {
      if (seen.has(articleId)) continue;
      lignes.push({ articleId, code: articleId.slice(0, 8), name: "", declare: 0, caisse: qty, ecart: qty });
    }
    lignes.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    entries.push({ clotureId: c.id, date: c.date, siteId: c.siteId, revision: c.revision, lignes });
  }
  return entries.sort((a, b) => (a.date === b.date ? b.revision - a.revision : a.date < b.date ? 1 : -1));
}
