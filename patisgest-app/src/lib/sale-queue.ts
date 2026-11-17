/**
 * File de ventes hors-ligne (caisse) : la vente est d'abord écrite dans la
 * file locale, puis synchronisée (idempotence par ticket côté serveur).
 * Cœur pur testable + adaptateurs localStorage gardés minces.
 */

export type QueuedSale = {
  /** UUID de ticket — identifiant d'idempotence côté serveur. */
  ticket: string;
  articleId: string;
  articleLabel: string;
  siteId: string;
  siteLabel: string;
  qte: number;
  queuedAt: string;
};

const KEY = "patisgest.saleQueue.v1";
const MAX = 200;

/** Ajoute une vente à la file (dédup par ticket, plafond200). */
export function enqueueSale(queue: QueuedSale[], sale: QueuedSale): QueuedSale[] {
  if (!sale.ticket || !sale.articleId || !sale.siteId || !(sale.qte > 0)) {
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

/** Lecture de la file (localStorage absent → []). */
export function loadQueue(): QueuedSale[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q): q is QueuedSale =>
        !!q && typeof q === "object" &&
        typeof (q as QueuedSale).ticket === "string" &&
        typeof (q as QueuedSale).articleId === "string" &&
        typeof (q as QueuedSale).siteId === "string" &&
        typeof (q as QueuedSale).qte === "number",
    );
  } catch {
    return [];
  }
}

export function saveQueue(queue: QueuedSale[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(KEY, JSON.stringify(queue.slice(-MAX)));
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
