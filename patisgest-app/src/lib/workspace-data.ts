/** Modèles d’affichage communs aux données Supabase et à la démo. */
export type WorkspaceSite = { id: string; label: string; type?: string };
export type StockArticle = { id: string; nom: string; code: string; niveau: string; unite: string; seuil: number };
export type StockLot = { id: string; articleId: string; siteId: string; numero: string; qte: number; dlc: string | null; bloque: boolean; congele: boolean; recu: string };
export type CatalogProduct = { id: string; label: string; code?: string; unit?: string; prixHT?: number; tva?: number; photo?: string };
export type SaleSummary = { id: string; numero?: string; date: string; site: string; items: { name: string; quantity: number; unit?: string }[]; totalTTC: number; source?: string; modePaiement?: string | null };
export type ProductionItem = { id: string; numero: string; title: string; statut: string; planned: number; done: number; date: string; site: string; devis?: string | null; version?: number | null };
export type BadgeTone = "danger" | "warning" | "success" | "planned";
export type StockSignal = { label: string; tone: BadgeTone };

const decimal = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 4 });
const monnaie = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const monnaieCompacte = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
export const quantite = (n: number, unit?: string) => `${decimal.format(n)}${unit ? ` ${unit}` : ""}`;
export const dinars = (n: number, exact = true) => `${(exact ? monnaie : monnaieCompacte).format(n)} DA`;
/**
 * Jour métier (AAAA-MM-JJ) à Oran : Africa/Algiers (UTC+1, sans heure d'été).
 * Ne pas utiliser toISOString() : entre 00:00 et 01:00 locales, il donne la veille (F-04).
 */
export const jourLocal = (d: Date = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Algiers", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
/** Calendrier grégorien : refuse 2026-02-30 et les dates avant 1970 restent valides. */
export function dateIsoValide(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
    && !Number.isNaN(Date.parse(`${s}T00:00:00Z`))
    && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}
/**
 * Une date métier saisie ne peut pas être dans le futur. `maintenant` est
 * injectable : à 23 h 30 UTC, le jour métier est déjà le lendemain en Algérie.
 */
export function dateMetierPasFuture(s: string, maintenant: Date = new Date()): boolean {
  return dateIsoValide(s) && s <= jourLocal(maintenant);
}
export function plusJours(day: string, n: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(Date.parse(`${day}T00:00:00Z`))) {
    throw new Error(`Date invalide (AAAA-MM-JJ attendu) : ${day}`);
  }
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
/**
 * Date d'événement acceptée par la commande vitrine : calendrier réel, jour
 * métier courant d'Alger inclus, et au plus un an (borne du RPC 27 après la
 * migration 55). `maintenant` est injectable pour tester minuit UTC.
 */
export function dateCommandeVitrineValide(s: string, maintenant: Date = new Date()): boolean {
  if (!dateIsoValide(s)) return false;
  const aujourdhui = jourLocal(maintenant);
  return s >= aujourdhui && s <= plusJours(aujourdhui, 365);
}
export function dateLisible(value: string | null | undefined, style: "short" | "medium" | "long" | "full" = "medium") {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : new Intl.DateTimeFormat("fr-FR", { dateStyle: style, timeZone: "UTC" }).format(d);
}
export function correspond(texte: string, recherche: string) {
  const normalise = (s: string) => s.toLocaleLowerCase("fr").normalize("NFD").replace(/\p{M}/gu, "");
  const h = normalise(texte);
  return normalise(recherche).trim().split(/\s+/).every((mot) => h.includes(mot));
}

export function indexLots(lots: StockLot[], siteId = "") {
  const index = new Map<string, StockLot[]>();
  for (const lot of lots) {
    if (!(lot.qte > 0) || (siteId && lot.siteId !== siteId)) continue;
    const rows = index.get(lot.articleId);
    if (rows) rows.push(lot);
    else index.set(lot.articleId, [lot]);
  }
  return index;
}

export function stockArticle(article: StockArticle, rows: readonly StockLot[], today: string) {
  // L'indicateur de stock suit le périmètre FEFO de la caisse (hors lots
  // bloqués). La DLC est signalée séparément, sans changer le flux métier.
  const nonBloques = rows.filter((lot) => !lot.bloque && lot.qte > 0);
  const quantity = Math.round(nonBloques.reduce((s, lot) => s + lot.qte, 0) * 10000) / 10000;
  const nextDlc = nonBloques.reduce<string | null>((min, l) => l.dlc && (!min || l.dlc < min) ? l.dlc : min, null);
  const signals: StockSignal[] = [];
  if (nextDlc && nextDlc < today) signals.push({ label: "DLC dépassée", tone: "danger" });
  else if (nextDlc && nextDlc <= plusJours(today, 7)) signals.push({ label: "DLC proche", tone: "warning" });
  if (quantity <= 0) signals.push({ label: "Rupture", tone: "danger" });
  else if (quantity <= article.seuil) signals.push({ label: "Stock bas", tone: "warning" });
  if (rows.some((lot) => lot.bloque && lot.qte > 0)) signals.push({ label: "Lot bloqué", tone: "warning" });
  return { quantity, nextDlc, signals };
}

export function ordreLots(a: StockLot, b: StockLot) {
  return Number(a.bloque) - Number(b.bloque) || Number(a.congele) - Number(b.congele)
    || (a.dlc ?? "9999").localeCompare(b.dlc ?? "9999") || a.recu.localeCompare(b.recu) || a.numero.localeCompare(b.numero);
}

export type SiteStock = Record<string, Record<string, number>>;

/** Vérifie si un lot est éligible à la consommation, la vente ou le transfert à la date `asOf` (AAAA-MM-JJ). */
export function estLotEligible(
  lot: Pick<StockLot, "qte" | "bloque" | "dlc">,
  asOf?: string | null,
): boolean {
  if (lot.bloque || !(lot.qte > 0)) return false;
  if (asOf && lot.dlc && lot.dlc.slice(0, 10) < asOf.slice(0, 10)) return false;
  return true;
}

/** Agrège les lots non bloqués (et non périmés si `asOf` est fourni) par site et article. */
export function stockParSite(lots: readonly StockLot[], asOf?: string | null): SiteStock {
  const bySite = new Map<string, Map<string, number>>();
  for (const l of lots) {
    if (!estLotEligible(l, asOf)) continue;
    let totals = bySite.get(l.siteId);
    if (!totals) bySite.set(l.siteId, totals = new Map());
    totals.set(l.articleId, Math.round(((totals.get(l.articleId) ?? 0) + l.qte) * 10000) / 10000);
  }
  return Object.fromEntries([...bySite].map(([site, totals]) => [site, Object.fromEntries(totals)]));
}

/** Agrège les quantités périmées (non bloquées mais DLC < `asOf`) par site et article. */
export function stockPerimeParSite(lots: readonly StockLot[], asOf: string): SiteStock {
  const cutoff = asOf.slice(0, 10);
  const bySite = new Map<string, Map<string, number>>();
  for (const l of lots) {
    if (l.bloque || !(l.qte > 0) || !l.dlc || l.dlc.slice(0, 10) >= cutoff) continue;
    let totals = bySite.get(l.siteId);
    if (!totals) bySite.set(l.siteId, totals = new Map());
    totals.set(l.articleId, Math.round(((totals.get(l.articleId) ?? 0) + l.qte) * 10000) / 10000);
  }
  return Object.fromEntries([...bySite].map(([site, totals]) => [site, Object.fromEntries(totals)]));
}

export function siteCaisse(sites: readonly WorkspaceSite[]) {
  return (sites.find((s) => s.type === "boutique") ?? sites[0])?.id ?? "";
}

export const ETAPES_PRODUCTION = [
  { id: "planifie", label: "À lancer", tone: "planned" },
  { id: "encours", label: "En cours", tone: "warning" },
  { id: "termine", label: "Terminées", tone: "success" },
  { id: "autre", label: "Autres", tone: "planned" },
] as const;
export function colonneProduction(statut: string) {
  if (statut === "partiel" || statut === "encours") return "encours";
  if (statut === "planifie" || statut === "termine") return statut;
  return "autre";
}

export type VentesJour = { day: string; ttc: number; tickets: number };
export function serieVentes(rows: readonly { date: string; totalTTC: number }[], today: string, daysCount = 14): VentesJour[] {
  const n = Math.max(1, Math.floor(daysCount));
  const series = Array.from({ length: n }, (_, index) => ({ day: plusJours(today, index - (n - 1)), ttc: 0, tickets: 0 }));
  const days = new Map(series.map((day) => [day.day, day]));
  for (const r of rows) {
    const d = days.get(r.date.slice(0, 10));
    if (d && Number.isFinite(r.totalTTC)) {
      d.ttc += Math.round(r.totalTTC * 100);
      d.tickets++;
    }
  }
  return series.map((d) => ({ ...d, ttc: d.ttc / 100 }));
}
