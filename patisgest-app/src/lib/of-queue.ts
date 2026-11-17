/**
 * File d'OF hors-ligne (Sprint4) : l'OF est d'abord écrit dans la file
 * locale, puis synchronisé — idempotence par `clientRef` côté serveur
 * (creer_of p_client_ref →0 doublon à la resynchronisation).
 * Même patron que sale-queue (cœur pur + store React SSR-safe).
 */

export type QueuedOf = {
  /** Référence client (uuid) — idempotence creer_of. */
  opId: string;
  versionId: string;
  versionLabel: string;
  siteId: string;
  siteLabel: string;
  qte: number;
  datePrevue: string;
  queuedAt: string;
};

const KEY = "patisgest.ofQueue.v1";
const MAX = 100;

/** Ajoute un OF à la file (dédup par opId, plafond100). */
export function enqueueOf(queue: QueuedOf[], op: QueuedOf): QueuedOf[] {
  if (!op.opId || !op.versionId || !op.siteId || !(op.qte > 0) || !op.datePrevue) {
    throw new Error("OF incomplet pour la file.");
  }
  const without = queue.filter((q) => q.opId !== op.opId);
  return [...without, op].slice(-MAX);
}

export function removeOf(queue: QueuedOf[], opId: string): QueuedOf[] {
  return queue.filter((q) => q.opId !== opId);
}

export function findOf(queue: QueuedOf[], opId: string): QueuedOf | undefined {
  return queue.find((q) => q.opId === opId);
}

export function loadOfQueue(): QueuedOf[] {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (q): q is QueuedOf =>
        !!q && typeof q === "object" &&
        typeof (q as QueuedOf).opId === "string" &&
        typeof (q as QueuedOf).versionId === "string" &&
        typeof (q as QueuedOf).siteId === "string" &&
        typeof (q as QueuedOf).qte === "number",
    );
  } catch {
    return [];
  }
}

export function saveOfQueue(queue: QueuedOf[]): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    window.localStorage.setItem(KEY, JSON.stringify(queue.slice(-MAX)));
  } catch {
    // stockage indisponible : la file reste en mémoire côté React
  }
}

// ------------------------------------------------------ store React (SSR safe)
let cache: QueuedOf[] | null = null;
const listeners = new Set<() => void>();

export function getOfQueue(): QueuedOf[] {
  if (cache === null) cache = loadOfQueue();
  return cache;
}

export function setOfQueue(queue: QueuedOf[]): void {
  cache = queue;
  saveOfQueue(queue);
  for (const l of listeners) l();
}

export function subscribeOfQueue(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getServerOfQueue(): QueuedOf[] {
  return [];
}
