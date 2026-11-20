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
  const existing = queue.find((q) => q.ticket === sale.ticket);
  if (existing) {
    const signature = (s: QueuedSale) => JSON.stringify({
      siteId: s.siteId, mode: s.modePaiement ?? "especes",
      lignes: queuedSaleLines(s).map(({ articleId, qte }) => ({ articleId, qte })),
    });
    if (signature(existing) !== signature(sale)) throw new Error("Référence de ticket déjà utilisée pour une autre vente.");
    return queue;
  }
  if (queue.length >= MAX) throw new Error("File pleine : synchronisez les tickets avant une nouvelle vente.");
  return [...queue, sale];
}

/** Retire une vente après confirmation ou vérification manuelle explicite. */
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
    typeof s.articleLabel !== "string" ||
    typeof s.siteId !== "string" ||
    !s.siteId ||
    typeof s.siteLabel !== "string" ||
    typeof s.queuedAt !== "string" ||
    !Number.isFinite(Date.parse(s.queuedAt)) ||
    typeof s.qte !== "number" ||
    !Number.isFinite(s.qte) || s.qte <= 0
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

// Le stockage local n'est pas une frontière de confidentialité : toute personne
// ayant accès au profil navigateur peut inspecter les clés de tous les comptes.
// Les clés séparées empêchent seulement l'affichage/rejeu accidentel par l'app.
export type QueueIdentity = { clientId: string; authUserId: string };
export type QueueSnapshot = { sales: QueuedSale[]; error: string | null; legacy: boolean };
type LockProvider = { request<T>(name: string, callback: () => Promise<T>): Promise<T> };
type QueueEnvironment = { storage: StorageLike; locks: LockProvider; notify?: () => void };
export const emptyQueueSnapshot: QueueSnapshot = { sales: [], error: null, legacy: false };

export function scopedQueueKey(identity: QueueIdentity): string {
  if (!identity.clientId || !identity.authUserId) throw new Error("Identité de caisse manquante.");
  return `patisgest.saleQueue.v2.${JSON.stringify([identity.clientId, identity.authUserId])}`;
}

/** Une file corrompue ne doit jamais être filtrée ni écrasée silencieusement. */
export function readQueueStrict(storage: StorageLike, key: string): QueuedSale[] {
  const raw = storage.getItem(key);
  if (raw === null) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new Error("File locale illisible : ne l'effacez pas, contactez le support."); }
  if (!Array.isArray(parsed) || parsed.length > MAX || !parsed.every(isValidStoredSale)) {
    throw new Error("File locale invalide : ne l'effacez pas, contactez le support.");
  }
  if (new Set(parsed.map((s) => s.ticket)).size !== parsed.length) {
    throw new Error("Références en double dans la file locale : contactez le support.");
  }
  return parsed;
}

/**
 * Sérialise lecture, envoi et écriture entre onglets du même profil. Si les
 * verrous Web ou le stockage sont indisponibles, refuser plutôt que prétendre
 * avoir conservé un ticket. Les anciens clients v1 ne coopèrent pas : leurs
 * tickets restent intacts et ne sont jamais rejoués automatiquement ici.
 */
export async function withSaleQueue<T>(identity: QueueIdentity, environment: QueueEnvironment, work: (queue: {
  read: () => QueuedSale[];
  write: (sales: QueuedSale[]) => void;
}) => Promise<T>): Promise<T> {
  const key = scopedQueueKey(identity);
  return environment.locks.request(key, async () => {
    const read = () => readQueueStrict(environment.storage, key);
    // Tester la lecture avant toute opération, même si work n'appelle pas read.
    read();
    const write = (sales: QueuedSale[]) => {
      if (sales.length > MAX || !sales.every(isValidStoredSale) || new Set(sales.map(s => s.ticket)).size !== sales.length) {
        throw new Error("File invalide ou pleine : aucun ticket n'a été supprimé.");
      }
      environment.storage.setItem(key, JSON.stringify(sales));
      // Une notification UI défaillante ne doit pas masquer une écriture réussie.
      try { environment.notify?.(); } catch { /* l'état reste durable dans le stockage */ }
    };
    return work({ read, write });
  });
}

export function createSaleQueueStore(identity: QueueIdentity) {
  const key = scopedQueueKey(identity);
  let lastRaw: string | null | undefined;
  let lastLegacy: string | null | undefined;
  let snapshot: QueueSnapshot = emptyQueueSnapshot;
  const getSnapshot = (): QueueSnapshot => {
    try {
      const storage = window.localStorage;
      const raw = storage.getItem(key);
      const legacy = storage.getItem(KEY);
      if (raw === lastRaw && legacy === lastLegacy && snapshot.error === null) return snapshot;
      const sales = readQueueStrict(storage, key);
      // Même une ancienne file corrompue ne doit pas être effacée ni reprise.
      const hasLegacy = legacy !== null && legacy !== "[]";
      snapshot = { sales, error: null, legacy: hasLegacy };
      lastRaw = raw; lastLegacy = legacy;
    } catch {
      if (snapshot.error === null) snapshot = { sales: [], error: "Stockage ou file locale indisponible. Ne l'effacez pas ; contactez le support.", legacy: false };
    }
    return snapshot;
  };
  const subscribe = (cb: () => void) => {
    const changed = () => cb();
    window.addEventListener("storage", changed);
    window.addEventListener("patisgest-sale-queue", changed);
    return () => { window.removeEventListener("storage", changed); window.removeEventListener("patisgest-sale-queue", changed); };
  };
  const transact = async <T,>(work: Parameters<typeof withSaleQueue<T>>[2]): Promise<T> => {
    if (!navigator.locks) throw new Error("Ce navigateur ne permet pas de sécuriser la file entre onglets. Utilisez un navigateur compatible ou contactez le support.");
    return withSaleQueue(identity, {
      storage: window.localStorage,
      locks: navigator.locks,
      notify: () => window.dispatchEvent(new Event("patisgest-sale-queue")),
    }, work);
  };
  return { getSnapshot, subscribe, transact };
}
