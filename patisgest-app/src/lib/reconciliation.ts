/**
 * Rapprochement caisse / clôture en DEUX BILANS SÉPARÉS :
 *  1. `computeReconciliation`     : bilan PRODUITS (quantités par article, site et jour —
 *                                   vendu caisse vs vendu déclaré, pertes et report).
 *  2. `computeCashReconciliation` : bilan ESPÈCES / TIROIR (en DA TTC par site et jour —
 *                                   fond de caisse + ventes espèces − sorties justifiées
 *                                   vs espèces comptées ; carte/virement et imports Z
 *                                   présentés séparément, jamais confondus avec le tiroir).
 *
 * Lecture seule — aucun stock ni vente n'est modifié. Pur et testable.
 */

export type ClosingLine = {
  articleId: string;
  code?: string;
  name?: string;
  vendu: number;
  produit?: number;
  reporte?: number;
  jete?: number;
  casse?: number;
  offert?: number;
};

/** Comptage facultatif du tiroir de caisse (DA TTC), distinct des quantités produits. */
export type CashDrawerDeclaration = {
  fondInitial: number;
  sortiesEspeces: number;
  especesComptees: number;
  motifSortie?: string;
};

export type ClosingRecord = {
  id: string;
  date: string;
  siteId: string;
  revision: number;
  lignes: ClosingLine[];
  caisseBilan?: CashDrawerDeclaration | null;
};

export type SaleLine = { articleId: string; qty: number };

export type SaleRecord = {
  siteId: string;
  date: string;
  lignes: SaleLine[];
  totalTTC?: number;
  source?: string | null;
  modePaiement?: string | null;
};

export type ReconLine = {
  articleId: string;
  code: string;
  name: string;
  declare: number; // vendu déclaré (clôture)
  caisse: number;  // ventes réelles (caisse, paniers multiproduits inclus)
  ecart: number;   // caisse - déclaré (arrondi 4 décimales)
  pertes?: number; // jeté + casse déclarés
  reporte?: number;
};

export type ReconEntry = {
  clotureId: string;
  date: string;
  siteId: string;
  revision: number;
  lignes: ReconLine[];
  ecartTotalHT?: never; // jamais de montant dans le bilan quantités
};

export type CashReconEntry = {
  clotureId: string;
  date: string;
  siteId: string;
  revision: number;
  fondInitial: number;
  ventesEspecesTTC: number;
  ventesCarteTTC: number;
  ventesAutreTTC: number;
  /** Ventes caisse antérieures au suivi du mode de règlement (non ajoutées d'office au tiroir). */
  ventesModeNonPreciseTTC: number;
  /** Imports Z externes (présentés à part : leur répartition espèces/carte n'est pas dans le CSV). */
  ventesImportZTTC: number;
  sortiesEspeces: number;
  motifSortie: string;
  /** Fond initial + ventes espèces enregistrées − sorties d'espèces (DA TTC). */
  attenduTiroir: number;
  especesComptees: number;
  /** Espèces comptées − attendu tiroir (0 = équilibré, <0 = manquant, >0 = excédent). */
  ecartEspeces: number;
  nbTicketsCaisse: number;
};

function round4(n: number): number {
  return Math.round((n + Number.EPSILON) * 10_000) / 10_000;
}

function toCents(n: number): number {
  return Math.round((n + Number.EPSILON) * 100);
}

function latestClosings(clotures: readonly ClosingRecord[]): ClosingRecord[] {
  const latest = new Map<string, ClosingRecord>();
  for (const c of clotures) {
    const key = `${c.date}|${c.siteId}`;
    const prev = latest.get(key);
    if (!prev || c.revision > prev.revision) latest.set(key, c);
  }
  return [...latest.values()].sort((a, b) =>
    a.date === b.date ? b.revision - a.revision : a.date < b.date ? 1 : -1,
  );
}

/**
 * Bilan 1 — PRODUITS (quantités).
 * Pour chaque clôture (dernière révision d'un couple date+site), compare
 * chaque ligne déclarée aux ventes caisse du même jour/site (paniers multi-lignes
 * sommés par article). Les ventes sans ligne de clôture apparaissent en écart « non déclaré ».
 */
export function computeReconciliation(
  clotures: ClosingRecord[],
  sales: SaleRecord[],
): ReconEntry[] {
  const latest = latestClosings(clotures);

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
  for (const c of latest) {
    const byArticle = salesByKey.get(`${c.date}|${c.siteId}`) ?? new Map<string, number>();
    const seen = new Set<string>();
    const lignes: ReconLine[] = [];
    for (const line of c.lignes) {
      seen.add(line.articleId);
      const caisse = byArticle.get(line.articleId) ?? 0;
      const pertes = round4((Number(line.jete) || 0) + (Number(line.casse) || 0));
      const reporte = round4(Number(line.reporte) || 0);
      lignes.push({
        articleId: line.articleId,
        code: line.code ?? line.articleId.slice(0, 8),
        name: line.name ?? "",
        declare: round4(line.vendu),
        caisse,
        ecart: round4(caisse - line.vendu),
        ...(line.jete !== undefined || line.casse !== undefined ? { pertes } : {}),
        ...(line.reporte !== undefined ? { reporte } : {}),
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
  return entries;
}

/**
 * Bilan 2 — ESPÈCES / TIROIR DE CAISSE (en DA TTC, séparé des quantités produits).
 * Calculé en centimes entiers pour chaque clôture ayant renseigné un comptage tiroir.
 */
export function computeCashReconciliation(
  clotures: readonly ClosingRecord[],
  sales: readonly SaleRecord[],
): CashReconEntry[] {
  const latest = latestClosings(clotures);
  type Bucket = {
    especes: number;
    carte: number;
    autre: number;
    inconnu: number;
    importZ: number;
    tickets: number;
  };
  const byKey = new Map<string, Bucket>();

  for (const s of sales) {
    const ttc = Number(s.totalTTC ?? 0);
    if (!Number.isFinite(ttc) || ttc === 0) continue;
    const cents = toCents(ttc);
    const key = `${s.date}|${s.siteId}`;
    const b = byKey.get(key) ?? { especes: 0, carte: 0, autre: 0, inconnu: 0, importZ: 0, tickets: 0 };
    if (s.source === "z-import" || s.source === "z") {
      b.importZ += cents;
    } else {
      b.tickets += 1;
      if (s.modePaiement === "especes") b.especes += cents;
      else if (s.modePaiement === "carte") b.carte += cents;
      else if (s.modePaiement === "cheque_virement") b.autre += cents;
      else b.inconnu += cents;
    }
    byKey.set(key, b);
  }

  const out: CashReconEntry[] = [];
  for (const c of latest) {
    if (!c.caisseBilan) continue;
    const d = c.caisseBilan;
    const b = byKey.get(`${c.date}|${c.siteId}`) ?? {
      especes: 0,
      carte: 0,
      autre: 0,
      inconnu: 0,
      importZ: 0,
      tickets: 0,
    };
    const fondCents = toCents(d.fondInitial);
    const sortiesCents = toCents(d.sortiesEspeces);
    const compteesCents = toCents(d.especesComptees);
    const attenduCents = fondCents + b.especes - sortiesCents;
    const ecartCents = compteesCents - attenduCents;

    out.push({
      clotureId: c.id,
      date: c.date,
      siteId: c.siteId,
      revision: c.revision,
      fondInitial: fondCents / 100,
      ventesEspecesTTC: b.especes / 100,
      ventesCarteTTC: b.carte / 100,
      ventesAutreTTC: b.autre / 100,
      ventesModeNonPreciseTTC: b.inconnu / 100,
      ventesImportZTTC: b.importZ / 100,
      sortiesEspeces: sortiesCents / 100,
      motifSortie: (d.motifSortie ?? "").trim(),
      attenduTiroir: attenduCents / 100,
      especesComptees: compteesCents / 100,
      ecartEspeces: ecartCents / 100,
      nbTicketsCaisse: b.tickets,
    });
  }
  return out;
}

/** Valide un comptage de tiroir facultatif (null si aucune saisie espèces). */
export function parseCashDrawerDeclaration(raw: {
  fondInitial?: unknown;
  sortiesEspeces?: unknown;
  especesComptees?: unknown;
  motifSortie?: unknown;
}): CashDrawerDeclaration | null {
  const compteesStr = String(raw.especesComptees ?? "").trim();
  const fondStr = String(raw.fondInitial ?? "").trim();
  const sortiesStr = String(raw.sortiesEspeces ?? "").trim();
  const motif = String(raw.motifSortie ?? "").trim();

  if (compteesStr === "" && fondStr === "" && sortiesStr === "" && motif === "") {
    return null;
  }
  if (compteesStr === "") {
    throw new Error("Bilan espèces : renseignez les espèces comptées dans le tiroir (ou laissez les champs espèces vides).");
  }
  const checkAmount = (s: string, label: string): number => {
    const n = s === "" ? 0 : Number(s);
    if (!Number.isFinite(n) || n < 0 || n > 1_000_000_000) {
      throw new Error(`${label} : montant invalide (0 DA ou plus).`);
    }
    if (Math.abs(toCents(n) / 100 - n) > 1e-9) {
      throw new Error(`${label} : deux décimales maximum.`);
    }
    return toCents(n) / 100;
  };
  if (motif.length > 160) {
    throw new Error("Motif de sortie d’espèces : 160 caractères maximum.");
  }
  return {
    fondInitial: checkAmount(fondStr, "Fond de caisse initial"),
    sortiesEspeces: checkAmount(sortiesStr, "Sorties d’espèces"),
    especesComptees: checkAmount(compteesStr, "Espèces comptées"),
    ...(motif ? { motifSortie: motif } : {}),
  };
}
