/**
 * Formules de référence RC-01..RC-10 (Cahier des charges §4) — pur, testable.
 * « Tout écart est un bug bloquant » : la moindre arrondi se voit au centime.
 *
 * RC-01 parage      : consommation = quantité × (1 + parage %)
 * RC-02 cuisson     : rendement net = rendement brut × (1 − cuisson %)
 * RC-03 coût total  : matières (FEFO) + emballage + MO chargée + énergie + frais généraux
 * RC-04 MO chargée  : (temps min ÷ 60) × taux horaire × (1 + charges %)
 * RC-05 coût/portion: coût total ÷ rendement net — jamais de TVA
 * RC-06 marge       : PV HT − coût ; taux = marge ÷ PV HT (toujours sur HT)
 * RC-07 taux de perte   : (jeté + casse) ÷ fabriqué
 * RC-08 manque à gagner : (jeté + casse) × PV HT
 * RC-09 FEFO        : voir fefo-cost.ts (DLC proche d'abord, congelé après frais,
 *                     bloqués/périmés exclus)
 * RC-10 garde-fous  : alerte si valeur ×10/÷10 vs référence ou prix >2× — non bloquante
 */

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

function pct(value: number, label: string, min = 0, max = 100_000): number {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${label} : valeur attendue entre ${min} et ${max}.`);
  }
  return value;
}

/** RC-01 : consommation = quantité × (1 + parage %). */
export function rc01Consommation(qte: number, paragePct: number): number {
  pct(qte, "RC-01 quantité", 0, 100_000_000);
  pct(paragePct, "RC-01 parage", 0, 1000);
  return round4(qte * (1 + paragePct / 100));
}

/** RC-02 : rendement net = rendement brut × (1 − cuisson %). */
export function rc02RendementNet(rendementBrut: number, cuissonPct: number): number {
  pct(rendementBrut, "RC-02 rendement", 0.0001, 100_000_000);
  pct(cuissonPct, "RC-02 cuisson", 0, 100);
  return round4(rendementBrut * (1 - cuissonPct / 100));
}

/** RC-04 : MO chargée = (temps min ÷ 60) × taux horaire × (1 + charges %). */
export function rc04MoChargee(tempsMin: number, tauxHoraire: number, chargesPct: number): number {
  pct(tempsMin, "RC-04 temps", 0, 1_000_000);
  pct(tauxHoraire, "RC-04 taux horaire", 0, 1_000_000);
  pct(chargesPct, "RC-04 charges", 0, 1000);
  return round2((tempsMin / 60) * tauxHoraire * (1 + chargesPct / 100));
}

/** RC-03 : coût total = matières + emballage + MO + énergie + frais généraux. */
export function rc03CoutTotal(matiere: number, emballage: number, mo: number, energie: number, fraisGeneraux: number): number {
  for (const [v, l] of [
    [matiere, "RC-03 matière"], [emballage, "RC-03 emballage"], [mo, "RC-04 MO"],
    [energie, "RC-03 énergie"], [fraisGeneraux, "RC-03 frais généraux"],
  ] as const) pct(v, l, 0, 1_000_000_000_000);
  return round2(matiere + emballage + mo + energie + fraisGeneraux);
}

/** RC-05 : coût / portion = coût total ÷ rendement net (aucune TVA). */
export function rc05CoutParPortion(coutTotal: number, rendementNet: number): number {
  pct(coutTotal, "RC-05 coût total", 0, 1_000_000_000_000);
  pct(rendementNet, "RC-05 rendement net", 0.0001, 100_000_000);
  return round4(coutTotal / rendementNet);
}

/** RC-06 : marge = PV HT − coût ; taux = marge ÷ PV HT. */
export function rc06Marge(pvHt: number, cout: number): { marge: number; taux: number } {
  pct(pvHt, "RC-06 PV HT", 0, 1_000_000_000_000);
  pct(cout, "RC-06 coût", 0, 1_000_000_000_000);
  const marge = round2(pvHt - cout);
  const taux = pvHt > 0 ? round4(marge / pvHt) : 0;
  return { marge, taux };
}

/** RC-07 : taux de perte = (jeté + casse) ÷ fabriqué. */
export function rc07TauxPerte(jete: number, casse: number, fabrique: number): number {
  pct(jete, "RC-07 jeté", 0, 100_000_000);
  pct(casse, "RC-07 casse", 0, 100_000_000);
  pct(fabrique, "RC-07 fabriqué", 0.0001, 100_000_000);
  return round4((jete + casse) / fabrique);
}

/** RC-08 : manque à gagner = (jeté + casse) × PV HT. */
export function rc08ManqueAJagner(jete: number, casse: number, pvHt: number): number {
  pct(jete, "RC-08 jeté", 0, 100_000_000);
  pct(casse, "RC-08 casse", 0, 100_000_000);
  pct(pvHt, "RC-08 PV HT", 0, 1_000_000_000_000);
  return round2((jete + casse) * pvHt);
}

export type GardeFou = { code: "RC-10-x10" | "RC-10-div10" | "RC-10-prix2x"; message: string };

/**
 * RC-10 : alertes non bloquantes — valeur ×10/÷10 vs référence,
 * ou prix >2× le prix de référence.
 */
export function rc10GardeFous(
  valeur: number,
  reference: number | null,
  pvHt: number | null = null,
  pvReference: number | null = null,
): GardeFou[] {
  const out: GardeFou[] = [];
  if (reference !== null && reference > 0 && valeur > 0) {
    const ratio = valeur / reference;
    if (ratio >= 10) {
      out.push({ code: "RC-10-x10", message: `Coût ${ratio.toFixed(1)}× la référence (${reference} DA) — vérifiez la saisie.` });
    } else if (ratio <= 0.1) {
      out.push({ code: "RC-10-div10", message: `Coût ×0,1 ou moins de la référence (${reference} DA) — vérifiez la saisie.` });
    }
  }
  if (pvHt !== null && pvReference !== null && pvReference > 0 && pvHt > 2 * pvReference) {
    out.push({ code: "RC-10-prix2x", message: `Prix HT ${pvHt} DA >2× la référence (${pvReference} DA).` });
  }
  return out;
}

export type FicheCoutInput = {
  /** Besoins matière déjà calculés (RC-01 inclus) avec coût FEFO par ligne. */
  matiereFefo: number;
  emballage: number;
  moMin: number;
  tauxHoraire: number;
  chargesPct: number;
  energie: number;
  fraisGeneraux: number;
  rendementBrut: number;
  cuissonPct: number;
  pvHt: number;
};

export type FicheCout = {
  rc02RendementNet: number;
  rc04Mo: number;
  rc03Total: number;
  rc05ParPortion: number;
  rc06: { marge: number; taux: number };
};

/** Fiche de coût complète RC-02..RC-06 (la matière vient de FEFO = RC-01+RC-09). */
export function computeFicheCout(input: FicheCoutInput): FicheCout {
  const rendementNet = rc02RendementNet(input.rendementBrut, input.cuissonPct);
  const mo = rc04MoChargee(input.moMin, input.tauxHoraire, input.chargesPct);
  const total = rc03CoutTotal(input.matiereFefo, input.emballage, mo, input.energie, input.fraisGeneraux);
  const parPortion = rc05CoutParPortion(total, rendementNet);
  const marge = rc06Marge(input.pvHt, parPortion);
  return { rc02RendementNet: rendementNet, rc04Mo: mo, rc03Total: total, rc05ParPortion: parPortion, rc06: marge };
}

export type ActiveProductVersion = {
  produitId: string;
  code: string;
  nom: string;
  version?: number;
  rendementQte: number;
  moMin: number;
  energie: number;
  emballage: number;
  fraisGeneraux: number;
  cuissonPct: number;
};

/**
 * Sélectionne strictement la version active rattachée au produit demandé.
 * Empêche qu'une requête multi-produits applique les charges d'un autre produit.
 */
export function selectProductVersion<T extends { produitId: string; active?: boolean }>(
  versions: readonly T[],
  produitId: string,
): T | null {
  if (!produitId) return null;
  return versions.find((v) => v.produitId === produitId && (v.active ?? true)) ?? null;
}

/**
 * Fiche de coût mise à l'échelle pour une quantité cible `qte` lorsque les
 * besoins matières (`matiereFefo`) ont déjà été calculés pour `qte`.
 * Quand `qte === version.rendementQte`, le facteur vaut 1 (identité exacte RC-02..06).
 */
export function computeScaledFicheCout(params: {
  version: ActiveProductVersion;
  qte: number;
  matiereFefo: number;
  tauxHoraire: number;
  chargesPct: number;
  pvHt: number;
}): FicheCout & {
  scale: number;
  emballageScaled: number;
  moMinScaled: number;
  energieScaled: number;
  fraisGenerauxScaled: number;
} {
  const { version, qte, matiereFefo, tauxHoraire, chargesPct, pvHt } = params;
  pct(qte, "Quantité simulée", 0.0001, 100_000_000);
  pct(version.rendementQte, "RC-02 rendement de base", 0.0001, 100_000_000);
  const scale = qte / version.rendementQte;
  const emballageScaled = round2(version.emballage * scale);
  const moMinScaled = round4(version.moMin * scale);
  const energieScaled = round2(version.energie * scale);
  const fraisGenerauxScaled = round2(version.fraisGeneraux * scale);
  const fiche = computeFicheCout({
    matiereFefo,
    emballage: emballageScaled,
    moMin: moMinScaled,
    tauxHoraire,
    chargesPct,
    energie: energieScaled,
    fraisGeneraux: fraisGenerauxScaled,
    rendementBrut: qte,
    cuissonPct: version.cuissonPct,
    pvHt,
  });
  return {
    ...fiche,
    scale: round4(scale),
    emballageScaled,
    moMinScaled,
    energieScaled,
    fraisGenerauxScaled,
  };
}

export type ClotureLigne = {
  /** Clé de rapprochement : uuid produit (test) ou code article (clôtures réelles). */
  produitId?: string;
  code?: string;
  produit: number;
  jete: number;
  casse: number;
};

/**
 * RC-07 sur données RÉELLES : agrège les lignes de clôture
 * (saisir_cloture) d'un produit — jeté, casse, fabriqué, taux de perte.
 * Les lignes réelles portent aussi `code` et `pvHT` (RC-08 direct).
 * Le manque à gagner (RC-08) se déduit : rc08ManqueAJagner(jete, casse, pvHt).
 */
export function aggregatePertes(lignes: ClotureLigne[], produitId: string): {
  produit: number; jete: number; casse: number; taux: number;
} {
  let produit = 0;
  let jete = 0;
  let casse = 0;
  for (const l of lignes) {
    const cible = l.produitId ?? l.code;
    if (cible !== produitId) continue;
    produit += Number(l.produit) || 0;
    jete += Number(l.jete) || 0;
    casse += Number(l.casse) || 0;
  }
  const p = round4(produit);
  const j = round4(jete);
  const c = round4(casse);
  return {
    produit: p,
    jete: j,
    casse: c,
    taux: p > 0 ? round4((j + c) / p) : 0,
  };
}
