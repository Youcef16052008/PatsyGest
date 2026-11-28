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
 * JSON corrompu, seulement avertie qu'il existe des tickets à vérifier.
 *
 * VAGUE 3 : la file active est `patisgest.saleQueue.v2.<identité JSON>`.
 * Les compteurs ne doivent plus balayer uniquement l'ancien préfixe v1, et
 * `useSyncExternalStore` exige un snapshot stable (même référence tant que le
 * stockage n'a pas changé), sinon React boucle sur un nouvel objet à chaque
 * rendu.
 */

import { categorieCleFileVente, PREFIXE_FILE_V1 } from "./sale-queue";

/** Ancien préfixe conservé pour les tests et les files non migrées. */
export const PREFIXE_FILE = PREFIXE_FILE_V1;

export type AttenteCloture = {
  /** Nombre de tickets non encore acceptés par le serveur. */
  tickets: number;
  /** true si au moins une entrée illisible empêche de compter exactement. */
  illisible: boolean;
};

export type StockageFile = Pick<Storage, "length" | "key" | "getItem">;

/** Snapshots constants : jamais de nouvel objet dans le rendu serveur. */
export const ATTENTE_SERVEUR: AttenteCloture = Object.freeze({ tickets: 0, illisible: false });
export const ATTENTE_ILLISIBLE: AttenteCloture = Object.freeze({ tickets: 0, illisible: true });

/**
 * Compte les ventes en attente dans un `Storage` donné.
 * Toute erreur de lecture/parse rend `illisible: true` au lieu de lever.
 */
export function compterVentesEnAttente(storage: StockageFile): AttenteCloture {
  let tickets = 0;
  let illisible = false;
  try {
    for (let i = 0; i < storage.length; i++) {
      const cle = storage.key(i);
      if (!cle) continue;
      const categorie = categorieCleFileVente(cle);
      if (categorie === null) continue;
      if (categorie === "inconnue") {
        illisible = true;
        continue;
      }
      const brut = storage.getItem(cle);
      if (brut === null) continue;
      if (brut === "") {
        illisible = true;
        continue;
      }
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

/** Empreinte des seules clés de file : sert à mettre le snapshot en cache. */
function signatureFile(storage: StockageFile): string {
  const parties: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const cle = storage.key(i);
    if (!cle || categorieCleFileVente(cle) === null) continue;
    parties.push(JSON.stringify([cle, storage.getItem(cle)]));
  }
  return parties.join("|");
}

const snapshots = new WeakMap<StockageFile, { signature: string; valeur: AttenteCloture }>();

/** Snapshot stable pour `useSyncExternalStore` sur un stockage donné. */
export function snapshotAttenteCloture(storage: StockageFile): AttenteCloture {
  try {
    const signature = signatureFile(storage);
    const precedent = snapshots.get(storage);
    if (precedent?.signature === signature) return precedent.valeur;
    const valeur = compterVentesEnAttente(storage);
    snapshots.set(storage, { signature, valeur });
    return valeur;
  } catch {
    return ATTENTE_ILLISIBLE;
  }
}

/** Adaptateur navigateur : un localStorage inaccessible n'est PAS une file vide. */
export function snapshotAttenteClotureNavigateur(): AttenteCloture {
  try {
    if (typeof window === "undefined" || !window.localStorage) return ATTENTE_ILLISIBLE;
    return snapshotAttenteCloture(window.localStorage);
  } catch {
    return ATTENTE_ILLISIBLE;
  }
}

/** Message à afficher avant enregistrement, ou null si rien à signaler. */
export function messageAttenteCloture(attente: AttenteCloture): string | null {
  const morceaux: string[] = [];
  if (attente.tickets > 0) {
    const mot = attente.tickets > 1 ? "ventes ne sont pas" : "vente n’est pas";
    morceaux.push(
      `${attente.tickets} ${mot} encore synchronisée${attente.tickets > 1 ? "s" : ""}. Synchronisez-les avant de clôturer : le tiroir contient leur argent mais elles n’apparaîtraient pas dans le rapprochement.`,
    );
  }
  if (attente.illisible) {
    morceaux.push(
      "Une file de ventes locale est illisible sur cet appareil. Ne l’effacez pas : faites-la vérifier avant de clôturer.",
    );
  }
  return morceaux.length ? morceaux.join(" ") : null;
}
