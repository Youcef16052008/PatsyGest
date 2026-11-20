/**
 * Coût FEFO pur : consomme les lots dans l'ordre FEFO (non congelé d'abord, puis
 * DLC croissante, réception en secours) pour couvrir une quantité demandée.
 * Même ordre que les RPC SQL ; lorsque `asOf` (AAAA-MM-JJ) est fourni,
 * les lots bloqués ou dont la DLC est strictement antérieure à `asOf`
 * sont explicitement exclus (RC-09).
 */

export type FefoLot = {
  id: string;
  qte_rest: number;
  pu: number;
  dlc: string | null;
  date_reception: string | null;
  congele: boolean;
  bloque?: boolean;
};

export type FefoLine = { lotId: string; qte: number; pu: number };
export type FefoResult = {
  /** Lignes FEFO consommées (dans l'ordre). */
  lignes: FefoLine[];
  /** Coût total couvert. */
  cout: number;
  /** Quantité réellement couverte (peut être < demandée si stock insuffisant). */
  couvert: number;
  /** true si le stock éligible ne suffit pas à couvrir la demande. */
  insuffisant: boolean;
  /** Quantité exclue car périmée avant `asOf` (0 si `asOf` non fourni). */
  perimeExclu: number;
};

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Vérifie qu'un lot est utilisable à la date `asOf` (non bloqué, qte > 0, non périmé). */
export function isFefoLotEligible(
  lot: Pick<FefoLot, "qte_rest" | "dlc" | "bloque">,
  asOf?: string,
): boolean {
  if (lot.bloque) return false;
  if (!(lot.qte_rest > 0)) return false;
  if (asOf && DATE_ISO.test(asOf) && lot.dlc && lot.dlc.slice(0, 10) < asOf) {
    return false;
  }
  return true;
}

/**
 * Ordre FEFO identique au SQL (`order by l.congele asc, l.dlc asc nulls last,
 * l.date_reception asc, l.id asc`). En PostgreSQL `false < true` : les lots
 * NON congelés passent en premier, les congelés sont consommés en dernier.
 */
export function sortFefo<T extends FefoLot>(lots: T[]): T[] {
  return [...lots].sort((a, b) => {
    if (a.congele !== b.congele) return a.congele ? 1 : -1;
    const da = a.dlc ? Date.parse(a.dlc) : Number.POSITIVE_INFINITY;
    const db = b.dlc ? Date.parse(b.dlc) : Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    const ra = a.date_reception ? Date.parse(a.date_reception) : Number.POSITIVE_INFINITY;
    const rb = b.date_reception ? Date.parse(b.date_reception) : Number.POSITIVE_INFINITY;
    if (ra !== rb) return ra - rb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/**
 * Couvre `qty` (unité de l'article) avec les lots disponibles (qte_rest > 0,
 * non bloqués, et DLC >= `asOf` lorsque `asOf` est fourni).
 * Les lots en `pu <= 0` sont ignorés (pas de coût connu).
 */
export function computeFefoCost(lots: FefoLot[], qty: number, asOf?: string): FefoResult {
  if (!Number.isFinite(qty) || qty <= 0) {
    throw new Error("Quantité de simulation invalide.");
  }
  const lignes: FefoLine[] = [];
  let reste = round4(qty);
  let cout = 0;
  let couvert = 0;
  let perimeExclu = 0;
  const checkDate = Boolean(asOf && DATE_ISO.test(asOf));

  for (const lot of sortFefo(lots)) {
    if (lot.bloque || !(lot.qte_rest > 0)) continue;
    if (checkDate && lot.dlc && lot.dlc.slice(0, 10) < asOf!) {
      perimeExclu = round4(perimeExclu + lot.qte_rest);
      continue;
    }
    if (reste <= 0 || !(lot.pu > 0)) continue;
    const take = Math.min(round4(lot.qte_rest), reste);
    if (take <= 0) continue;
    lignes.push({ lotId: lot.id, qte: take, pu: lot.pu });
    cout += take * lot.pu;
    couvert += take;
    reste = round4(reste - take);
  }
  return {
    lignes,
    cout: round2(cout),
    couvert: round4(couvert),
    insuffisant: reste > 1e-9,
    perimeExclu,
  };
}
