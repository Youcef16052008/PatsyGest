/**
 * W2-D4 — Garde de clôture contre les ventes non synchronisées.
 *
 * `sale-queue.ts` conserve les tickets vendus hors ligne dans localStorage.
 * L'écran de vente prévient correctement qu'ils ne sont pas confirmés, mais
 * les écrans de CLÔTURE les ignoraient : on pouvait compter un tiroir qui
 * contient l'argent de ventes pas encore remontées, enregistrer une clôture
 * « juste », et découvrir l'écart le lendemain sans en connaître la cause.
 *
 * Ce module ne fait qu'une chose : compter les tickets en attente pour
 * l'appareil, sans jamais lever — une clôture ne doit pas être bloquée par un
 * JSON corrompu, seulement avertie qu'il existe des tickets.
 */

/** Préfixe des clés de file (`scopedQueueKey` dans sale-queue.ts). */
export const PREFIXE_FILE = "patisgest.saleQueue.v1";

export type AttenteCloture = {
  /** Nombre de tickets non encore acceptés par le serveur. */
  tickets: number;
  /** true si au moins une entrée illisible empêche de compter exactement. */
  illisible: boolean;
};

/**
 * Compte les ventes en attente dans un `Storage` donné.
 * Toute erreur de lecture/parse rend `illisible: true` au lieu de lever.
 */
export function compterVentesEnAttente(
  storage: Pick<Storage, "length" | "key" | "getItem">,
): AttenteCloture {
  let tickets = 0;
  let illisible = false;
  try {
    for (let i = 0; i < storage.length; i++) {
      const cle = storage.key(i);
      if (!cle || !cle.startsWith(PREFIXE_FILE)) continue;
      const brut = storage.getItem(cle);
      if (!brut) continue;
      try {
        const parse = JSON.parse(brut) as unknown;
        if (Array.isArray(parse)) tickets += parse.length;
        else illisible = true;
      } catch {
        illisible = true;
      }
    }
  } catch {
    // localStorage inaccessible (mode privé, quota) : on ne bloque pas la
    // clôture, mais on ne prétend pas non plus que la file est vide.
    illisible = true;
  }
  return { tickets, illisible };
}

/** Message à afficher avant enregistrement, ou null si rien à signaler. */
export function messageAttenteCloture(attente: AttenteCloture): string | null {
  if (attente.tickets > 0) {
    const mot = attente.tickets > 1 ? "ventes ne sont pas" : "vente n’est pas";
    return `${attente.tickets} ${mot} encore synchronisée${attente.tickets > 1 ? "s" : ""}. Synchronisez-les avant de clôturer : le tiroir contient leur argent mais elles n’apparaîtraient pas dans le rapprochement.`;
  }
  if (attente.illisible) {
    return "Une file de ventes locale est illisible sur cet appareil. Ne l’effacez pas : faites-la vérifier avant de clôturer.";
  }
  return null;
}
