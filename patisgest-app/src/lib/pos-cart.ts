/**
 * Panier de caisse multiproduit — moteur pur et testable.
 *
 * Invariants :
 *  - Sélectionner un second produit l'AJOUTE au panier (ou incrémente sa
 *    quantité s'il y figure déjà) ; il ne remplace jamais l'article précédent.
 *  - Calcul monétaire en centimes entiers par ligne ; les totaux HT, TVA et TTC
 *    du ticket sont la somme exacte des lignes (aucune dérive d'arrondi).
 *  - Enregistrement d'une vente réellement encaissée au comptoir : le mode de
 *    règlement sert au rapprochement du tiroir, sans terminal PSP connecté.
 */

import type { CatalogProduct, SiteStock } from "./workspace-data.ts";

export const MAX_CART_QTE = 100_000_000;
export const MAX_CART_LINES = 50;

export type PaymentMode = "especes" | "carte" | "cheque_virement";

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  especes: "Espèces",
  carte: "Carte (TPE / CIB)",
  cheque_virement: "Chèque / virement",
};

/**
 * Modes proposés à la saisie en caisse. La carte CIB/Edahabia n'est pas proposée :
 * le client ne la gère pas en comptoir. `carte` reste reconnu pour les anciens tickets.
 */
export const PAYMENT_MODES_SAISIE: readonly PaymentMode[] = ["especes", "cheque_virement"];

export function isPaymentMode(value: unknown): value is PaymentMode {
  return value === "especes" || value === "carte" || value === "cheque_virement";
}

export type CartItem = {
  articleId: string;
  label: string;
  code?: string;
  unit?: string;
  qte: number;
  prixHT: number | null;
  tva: number | null;
};

export type CartLineTotals = CartItem & {
  qteValide: boolean;
  unitTTC: number | null;
  totalHT: number | null;
  totalTVA: number | null;
  totalTTC: number | null;
};

export type CartTotals = {
  lignes: CartLineTotals[];
  nbArticles: number;
  totalUnites: number;
  totalHT: number | null;
  totalTVA: number | null;
  totalTTC: number | null;
  prixIncomplet: boolean;
  valide: boolean;
};

export type CartStockAlert = {
  articleId: string;
  label: string;
  unit?: string;
  demande: number;
  disponible: number;
  manquant: number;
  perimeExclu: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const round4 = (n: number) => Math.round((n + Number.EPSILON) * 10_000) / 10_000;

type DecimalExact = { coefficient: bigint; scale: number };

/** Convertit la représentation décimale canonique d'un nombre en entier exact. */
const BIGINT_TWO = BigInt(2);
const BIGINT_TEN = BigInt(10);
const BIGINT_HUNDRED = BigInt(100);

function decimalExact(value: number): DecimalExact {
  const [mantissa, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [entier, fraction = ""] = mantissa.split(".");
  let coefficient = BigInt(entier + fraction);
  let scale = fraction.length - exponent;
  if (scale < 0) {
    coefficient *= BIGINT_TEN ** BigInt(-scale);
    scale = 0;
  }
  return { coefficient, scale };
}

const puissance10 = (scale: number) => BIGINT_TEN ** BigInt(scale);

/** PostgreSQL numeric round(x, 2) : les demi-centimes positifs s'arrondissent vers le haut. */
function arrondirRatioPositif(numerateur: bigint, denominateur: bigint): bigint {
  return (BIGINT_TWO * numerateur + denominateur) / (BIGINT_TWO * denominateur);
}

function centimesLigne(qte: number, prixHT: number, tva: number) {
  const q = decimalExact(qte);
  const prix = decimalExact(prixHT);
  const taxe = decimalExact(tva);
  const denominateurQuantitePrix = puissance10(q.scale + prix.scale);
  const denominateurComplet = denominateurQuantitePrix * puissance10(taxe.scale);
  const centimesHT = arrondirRatioPositif(
    q.coefficient * prix.coefficient * BIGINT_HUNDRED,
    denominateurQuantitePrix,
  );
  const facteurTTC = BIGINT_HUNDRED * puissance10(taxe.scale) + taxe.coefficient;
  const centimesTTC = arrondirRatioPositif(
    q.coefficient * prix.coefficient * facteurTTC,
    denominateurComplet,
  );
  const centimesUnitaireTTC = arrondirRatioPositif(
    prix.coefficient * facteurTTC,
    puissance10(prix.scale + taxe.scale),
  );
  return { centimesHT, centimesTTC, centimesUnitaireTTC };
}

export function isValidCartQty(qte: number): boolean {
  return Number.isFinite(qte) && qte >= 0.0001 && qte <= MAX_CART_QTE && Math.abs(round4(qte) - qte) < 1e-9;
}

/**
 * Ajoute un produit au panier : s'il est déjà présent, incrémente sa quantité ;
 * sinon ajoute une nouvelle ligne sans effacer les précédentes.
 */
export function addToCart(
  cart: readonly CartItem[],
  product: CatalogProduct,
  addQty = 1,
): CartItem[] {
  const delta = isValidCartQty(addQty) ? round4(addQty) : 1;
  const idx = cart.findIndex((c) => c.articleId === product.id);
  if (idx >= 0) {
    return cart.map((item, i) =>
      i === idx
        ? { ...item, qte: Math.min(MAX_CART_QTE, round4((Number.isFinite(item.qte) && item.qte > 0 ? item.qte : 0) + delta)) }
        : item,
    );
  }
  if (cart.length >= MAX_CART_LINES) {
    throw new Error(`Un ticket comporte au maximum ${MAX_CART_LINES} produits distincts.`);
  }
  return [
    ...cart,
    {
      articleId: product.id,
      label: product.label,
      code: product.code,
      unit: product.unit,
      qte: delta,
      prixHT: product.prixHT != null && Number.isFinite(product.prixHT) ? product.prixHT : null,
      tva: product.tva != null && Number.isFinite(product.tva) ? product.tva : null,
    },
  ];
}

/** Modifie la quantité d'une ligne existante (conserve la ligne pour permettre la saisie). */
export function setCartLineQty(cart: readonly CartItem[], articleId: string, qte: number): CartItem[] {
  return cart.map((item) =>
    item.articleId === articleId ? { ...item, qte: Number.isFinite(qte) ? round4(qte) : Number.NaN } : item,
  );
}

/** Incrémente ou décrémente une ligne ; si la quantité tombe à 0 ou moins, retire la ligne. */
export function stepCartLine(cart: readonly CartItem[], articleId: string, delta: number): CartItem[] {
  const out: CartItem[] = [];
  for (const item of cart) {
    if (item.articleId !== articleId) {
      out.push(item);
      continue;
    }
    const base = Number.isFinite(item.qte) && item.qte > 0 ? item.qte : 0;
    const next = round4(base + delta);
    if (next <= 0) continue;
    out.push({ ...item, qte: Math.min(MAX_CART_QTE, next) });
  }
  return out;
}

/** Retire un produit du panier. */
export function removeFromCart(cart: readonly CartItem[], articleId: string): CartItem[] {
  return cart.filter((item) => item.articleId !== articleId);
}

/** Calcule les montants HT / TVA / TTC en centimes entiers exacts. */
export function computeCartTotals(cart: readonly CartItem[]): CartTotals {
  let centsHT = 0;
  let centsTTC = 0;
  let totalUnites = 0;
  let prixIncomplet = false;
  let allValid = cart.length > 0 && cart.length <= MAX_CART_LINES;

  const lignes: CartLineTotals[] = cart.map((item) => {
    const qteValide = isValidCartQty(item.qte);
    if (!qteValide) allValid = false;
    else totalUnites = round4(totalUnites + item.qte);

    const hasPrice =
      item.prixHT !== null &&
      item.tva !== null &&
      Number.isFinite(item.prixHT) &&
      // Un prix nul n'est pas un prix : « 0 DA » encaissé décrémenterait le
      // stock sans recette (F-01). Ligne à 0 → ticket invalide.
      item.prixHT > 0 &&
      Number.isFinite(item.tva) &&
      item.tva >= 0 &&
      item.tva <= 100;

    if (!hasPrice) {
      prixIncomplet = true;
      return { ...item, qteValide, unitTTC: null, totalHT: null, totalTVA: null, totalTTC: null };
    }

    if (!qteValide) {
      const unitTTC = Number(centimesLigne(1, item.prixHT!, item.tva!).centimesUnitaireTTC) / 100;
      return { ...item, qteValide, unitTTC, totalHT: null, totalTVA: null, totalTTC: null };
    }

    const montants = centimesLigne(item.qte, item.prixHT!, item.tva!);
    const unitTTC = Number(montants.centimesUnitaireTTC) / 100;
    const lHT = Number(montants.centimesHT);
    const lTTC = Number(montants.centimesTTC);
    const lTVA = lTTC - lHT;
    centsHT += lHT;
    centsTTC += lTTC;

    return {
      ...item,
      qteValide,
      unitTTC,
      totalHT: lHT / 100,
      totalTVA: lTVA / 100,
      totalTTC: lTTC / 100,
    };
  });

  return {
    lignes,
    nbArticles: cart.length,
    totalUnites,
    totalHT: prixIncomplet || !allValid ? null : centsHT / 100,
    totalTVA: prixIncomplet || !allValid ? null : (centsTTC - centsHT) / 100,
    totalTTC: prixIncomplet || !allValid ? null : centsTTC / 100,
    prixIncomplet,
    // Un ticket avec une ligne sans prix strictement positif n'est jamais vendable (F-01).
    valide: allValid && !prixIncomplet,
  };
}

/** Contrôle le stock éligible (hors bloqués et hors périmés) pour chaque ligne du panier. */
export function checkCartStock(
  cart: readonly CartItem[],
  siteId: string,
  eligibleStock: SiteStock | null,
  expiredStock: SiteStock | null = null,
): CartStockAlert[] {
  if (!eligibleStock || !siteId) return [];
  const alerts: CartStockAlert[] = [];
  for (const item of cart) {
    if (!isValidCartQty(item.qte)) continue;
    const disponible = eligibleStock[siteId]?.[item.articleId] ?? 0;
    const perimeExclu = expiredStock?.[siteId]?.[item.articleId] ?? 0;
    const manquant = round4(Math.max(0, item.qte - disponible));
    if (manquant > 0 || perimeExclu > 0) {
      alerts.push({
        articleId: item.articleId,
        label: item.label,
        unit: item.unit,
        demande: item.qte,
        disponible,
        manquant,
        perimeExclu,
      });
    }
  }
  return alerts;
}

export type ParsedCartSaleInput = {
  siteId: string;
  ticket: string | null;
  modePaiement: PaymentMode;
  lignes: { articleId: string; qte: number }[];
};

/**
 * Validation serveur stricte d'un ticket panier (multi-ligne ou mono-ligne).
 * Fusionne proprement deux occurrences éventuelles d'un même articleId.
 */
export function parseCartSaleInput(formData: FormData): ParsedCartSaleInput {
  const siteId = String(formData.get("siteId") ?? "").trim();
  if (!UUID_RE.test(siteId)) throw new Error("Site : identifiant invalide.");

  const modeRaw = String(formData.get("modePaiement") ?? "especes").trim() || "especes";
  if (!isPaymentMode(modeRaw)) throw new Error("Mode de règlement invalide.");

  const ticketRaw = String(formData.get("ticket") ?? "").trim();
  if (ticketRaw !== "" && !UUID_RE.test(ticketRaw)) throw new Error("Référence de ticket invalide.");

  const merged = new Map<string, number>();
  const rawJson = String(formData.get("lignesJson") ?? "").trim();

  if (rawJson) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new Error("Panier illisible.");
    }
    if (!Array.isArray(parsed) || parsed.length < 1 || parsed.length > MAX_CART_LINES) {
      throw new Error(`Le panier doit contenir entre 1 et ${MAX_CART_LINES} produits.`);
    }
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") throw new Error("Ligne de panier invalide.");
      const e = entry as { articleId?: unknown; qte?: unknown };
      const artId = String(e.articleId ?? "").trim();
      if (!UUID_RE.test(artId)) throw new Error("Produit du panier invalide.");
      const qte = Number(e.qte);
      if (!isValidCartQty(qte)) {
        throw new Error("Quantité invalide (entre 0,0001 et 100 000 000, 4 décimales maximum).");
      }
      const next = round4((merged.get(artId) ?? 0) + qte);
      if (!isValidCartQty(next)) throw new Error("Quantité cumulée trop élevée.");
      merged.set(artId, next);
    }
  } else {
    const ids = formData.getAll("articleId").map((v) => String(v).trim()).filter(Boolean);
    const qtes = formData.getAll("qte").map((v) => Number(v));
    if (ids.length < 1 || ids.length > MAX_CART_LINES || ids.length !== qtes.length) {
      throw new Error(`Le panier doit contenir entre 1 et ${MAX_CART_LINES} produits.`);
    }
    for (let i = 0; i < ids.length; i++) {
      if (!UUID_RE.test(ids[i])) throw new Error("Produit du panier invalide.");
      if (!isValidCartQty(qtes[i])) {
        throw new Error("Quantité invalide (entre 0,0001 et 100 000 000, 4 décimales maximum).");
      }
      const next = round4((merged.get(ids[i]) ?? 0) + qtes[i]);
      if (!isValidCartQty(next)) throw new Error("Quantité cumulée trop élevée.");
      merged.set(ids[i], next);
    }
  }

  return {
    siteId,
    ticket: ticketRaw || null,
    modePaiement: modeRaw,
    lignes: [...merged.entries()].map(([articleId, qte]) => ({ articleId, qte })),
  };
}
