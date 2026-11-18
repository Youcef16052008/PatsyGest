/**
 * File de ventes hors-ligne (caisse) : le ticket (mono- ou multiproduit) est
 * d'abord écrit dans la file locale avec son UUID stable, puis synchronisé
 * (idempotence par ticket côté serveur : rejouer après coupure ou fermeture du
 * navigateur ne crée jamais de doublon).
 * Cœur pur testable + adaptateurs localStorage gardés minces.
 */

import { isPaymentMode, isValidCartQty, MAX_CART_LINES, type PaymentMode } from "./pos-cart.ts";

export type QueuedSaleLine = {
  articleId: string;
  articleLabel: string;
  unit?: string;
  qte: number;
};

export type QueuedSale = {
  /** UUID de ticket — identifiant d'idempotence côté serveur (conservé à la reprise). */
  ticket: string;
  /** Premier produit (compatibilité avec les anciennes entrées mono-produit). */
  articleId: string;
  articleLabel: string;
  siteId: string;
  siteLabel: string;
  qte: number;
  /** Lignes complètes du panier (1..50 produits). */
  lignes?: QueuedSaleLine[];
  /** Mode de règlement enregistré pour le rapprochement tiroir. */
  modePaiement?: PaymentMode;
  queuedAt: string;
};

export type StorageLike = Pick<Storage, "getItem" | "setItem">;

const KEY = "patisgest.saleQueue.v1";
const MAX = 200;

/** Retourne toujours la liste normalisée des lignes d'un ticket en file. */
export function queuedSaleLines(sale: QueuedSale): QueuedSaleLine[] {
  if (Array.isArray(sale.lignes) && sale.lignes.length > 0) {
    return sale.lignes;
  }
  return [{ articleId: sale.articleId, articleLabel: sale.articleLabel, qte: sale.qte }];
}

/** Résumé lisible d'un ticket en attente (ex. « Éclair chocolat × 2 + 1 article »). */
export function queuedSaleSummary(sale: QueuedSale): string {
  const lines = queuedSaleLines(sale);
  const first = lines[0];
  if (!first) return "Ticket";
  if (lines.length === 1) return `${first.articleLabel} × ${first.qte}`;
  return `${first.articleLabel} × ${first.qte} + ${lines.length - 1} produit${lines.length > 2 ? "s" : ""}`;
}

/** Construit une entrée de file pour un panier multiproduit avec UUID conservé. */
export function createQueuedCartSale(params: {
  ticket: string;
  siteId: string;
  siteLabel: string;
  lignes: QueuedSaleLine[];
  modePaiement?: PaymentMode;
  queuedAt?: string;
}): QueuedSale {
  const { ticket, siteId, siteLabel, lignes, modePaiement = "especes" } = params;
  if (!ticket.trim() || !siteId.trim()) {
    throw new Error("Ticket ou site manquant pour la file.");
  }
  if (!Array.isArray(lignes) || lignes.length < 1 || lignes.length > MAX_CART_LINES) {
    throw new Error("Panier vide ou trop volumineux pour la file.");
  }
  const clean: QueuedSaleLine[] = lignes.map((l) => {
    if (!l.articleId?.trim() || !l.articleLabel?.trim() || !isValidCartQty(l.qte)) {
      throw new Error("Ligne de panier incomplète pour la file.");
    }
    return {
      articleId: l.articleId.trim(),
      articleLabel: l.articleLabel.trim(),
      ...(l.unit ? { unit: l.unit } : {}),
      qte: l.qte,
    };
  });
  const totalQte = Math.round(clean.reduce((s, l) => s + l.qte, 0) * 10_000) / 10_000;
  return {
    ticket: ticket.trim(),
    articleId: clean[0].articleId,
    articleLabel: clean[0].articleLabel,
    siteId: siteId.trim(),
    siteLabel: siteLabel.trim(),
    qte: clean.length === 1 ? clean[0].qte : totalQte,
    lignes: clean,
    modePaiement: isPaymentMode(modePaiement) ? modePaiement : "especes",
    queuedAt: params.queuedAt ?? new Date().toISOString(),
  };
}

/** Ajoute une vente ou un panier à la file (dédup par ticket, plafond 200). */
export function enqueueSale(queue: QueuedSale[], sale: QueuedSale): QueuedSale[] {
  const lines = queuedSaleLines(sale);
  if (
    !sale.ticket ||
    !sale.siteId ||
    lines.length < 1 ||
    lines.length > MAX_CART_LINES ||
    lines.some((l) => !l.articleId || !(l.qte > 0))
  ) {
    throw new Error("Vente incomplète pour la file.");
  }
  const without = queue.filter((q) => q.ticket !== sale.ticket);
  return [...without, sale].slice(-MAX);
}

/** Retire une vente (après synchronisation réussie ou erreur métier). */
export function removeSale(queue: QueuedSale[], ticket: string): QueuedSale[] {
  return queue.filter((q) => q.ticket !== ticket);
}

export function findSale(queue: QueuedSale[], ticket: string): QueuedSale | undefined {
  return queue.find((q) => q.ticket === ticket);
}

function isValidStoredLine(x: unknown): x is QueuedSaleLine {
  if (!x || typeof x !== "object") return false;
  const l = x as Partial<QueuedSaleLine>;
  return (
    typeof l.articleId === "string" &&
    l.articleId.length > 0 &&
    typeof l.articleLabel === "string" &&
    typeof l.qte === "number" &&
    isValidCartQty(l.qte)
  );
}

function isValidStoredSale(q: unknown): q is QueuedSale {
  if (!q || typeof q !== "object") return false;
  const s = q as Partial<QueuedSale>;
  if (
    typeof s.ticket !== "string" ||
    !s.ticket ||
    typeof s.articleId !== "string" ||
    !s.articleId ||
    typeof s.siteId !== "string" ||
    !s.siteId ||
    typeof s.qte !== "number" ||
    !(s.qte > 0)
  ) {
    return false;
  }
  if (s.lignes !== undefined) {
    if (!Array.isArray(s.lignes) || s.lignes.length < 1 || s.lignes.length > MAX_CART_LINES) return false;
    if (!s.lignes.every(isValidStoredLine)) return false;
  }
  if (s.modePaiement !== undefined && !isPaymentMode(s.modePaiement)) return false;
  return true;
}

/** Lecture de la file (localStorage absent ou corrompu → []). */
export function loadQueue(storage?: StorageLike | null): QueuedSale[] {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!store) return [];
    const raw = store.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidStoredSale);
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedSale[], storage?: StorageLike | null): void {
  try {
    const store = storage ?? (typeof window !== "undefined" ? window.localStorage : null);
    if (!store) return;
    store.setItem(KEY, JSON.stringify(queue.slice(-MAX)));
  } catch {
    // stockage plein/indisponible : la file reste en mémoire côté React
  }
}

// ------------------------------------------------------ store React (SSR safe)
let cache: QueuedSale[] | null = null;
const listeners = new Set<() => void>();

/** Snapshot stable (Object.is) pour useSyncExternalStore. */
export function getQueue(): QueuedSale[] {
  if (cache === null) cache = loadQueue();
  return cache;
}

/** Écrit la file, notifie les abonnés (et le localStorage). */
export function setQueue(queue: QueuedSale[]): void {
  cache = queue;
  saveQueue(queue);
  for (const l of listeners) l();
}

export function subscribeQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Côté serveur : file toujours vide (le SSR ne connaît pas le localStorage). */
export function getServerQueue(): QueuedSale[] {
  return [];
}
