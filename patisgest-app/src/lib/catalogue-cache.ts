/**
 * Catalogue de caisse hors-ligne (NF-02, D5).
 *
 * **Correction d'une affirmation fausse de la v1 de ce fichier :** le service
 * worker ne met PAS l'écran /caisse en cache — il refuse toute navigation, et
 * c'est délibéré (HTML d'un compte lisible après changement de compte sur une
 * tablette partagée, cf. `public/sw.js`). Écrire le contraire ici a laissé
 * croire que la caisse était disponible hors-ligne alors qu'aucun écran ne
 * pouvait s'ouvrir sans réseau.
 *
 * La conception réelle est une **coquille hors-ligne** (`/hors-ligne`) : page
 * publique, sans donnée personnelle dans son HTML, qui lit ce cache côté
 * client après avoir vérifié que le catalogue appartient bien au compte
 * actuellement connecté. Le catalogue est donc étiqueté par compte
 * (`clientId`), et `cataloguePourIdentite` refuse tout ce qui ne correspond
 * pas.
 *
 * Ce module conserve donc le dernier catalogue connu (produits + sites +
 * identité du ticket) dans le localStorage, et ne le relit que si le serveur
 * n'a rien pu fournir. Il n'écrit jamais côté serveur : rien à isoler en RLS.
 *
 * Ce qui n'est volontairement PAS caché :
 *  • les prix de revient et les marges (le vendeur n'y a pas droit) ;
 *  • les lots et quantités exactes — un stock figé la veille induirait en
 *    erreur ; l'alerte de manquant reste calculée par le serveur à la synchro ;
 *  • l'historique des ventes.
 */

import type { StorageLike } from "./sale-queue";

export type CatalogueHorsLigne = {
  /** Version du format : un cache d'une ancienne forme est ignoré. */
  version: 1;
  /** Horodatage ISO du dernier enregistrement réussi. */
  enregistreLe: string;
  /** Compte propriétaire du cache. Absent = cache v1 non étiqueté (legacy). */
  clientId?: string;
  clientNom: string;
  articles: { id: string; label: string; code?: string; unit?: string; prixHT?: number; tva?: number }[];
  /** `type` facultatif : WorkspaceSite le déclare optionnel. */
  sites: { id: string; label: string; type?: string }[];
  identite: { nom: string; adresse: string | null; telephone: string | null; nif: string | null; nis: string | null; rc: string | null };
};

const CLE = "patisgest.catalogue.v1";

/** Un catalogue plus vieux que cela est refusé : mieux vaut une erreur claire
 *  qu'un prix de la semaine dernière encaissé comme s'il était le bon. */
export const FRAICHEUR_MAX_JOURS = 14;

export function enregistrerCatalogue(c: Omit<CatalogueHorsLigne, "version" | "enregistreLe">): void {
  try {
    if (typeof window === "undefined" || !window.localStorage) return;
    const complet: CatalogueHorsLigne = {
      ...c,
      version: 1,
      enregistreLe: new Date().toISOString(),
    };
    window.localStorage.setItem(CLE, JSON.stringify(complet));
    cache = complet;
    notifier();
  } catch {
    // quota plein ou navigation privée : la caisse en ligne fonctionne
  }
}

function estCatalogue(v: unknown): v is CatalogueHorsLigne {
  if (!v || typeof v !== "object") return false;
  const c = v as CatalogueHorsLigne;
  return (
    c.version === 1 &&
    typeof c.enregistreLe === "string" &&
    Array.isArray(c.articles) &&
    Array.isArray(c.sites) &&
    !!c.identite &&
    c.articles.every((a) => !!a && typeof a.id === "string" && typeof a.label === "string") &&
    c.sites.every((s) => !!s && typeof s.id === "string" && typeof s.label === "string")
  );
}

/** Âge du cache en jours (Infinity si absent). */
export function ageCatalogue(c: CatalogueHorsLigne, maintenant = Date.now()): number {
  const t = Date.parse(c.enregistreLe);
  if (!Number.isFinite(t)) return Number.POSITIVE_INFINITY;
  return Math.max(0, (maintenant - t) / 86_400_000);
}

/**
 * Lit le catalogue hors-ligne. Renvoie null (jamais une exception) si absent,
 * corrompu ou trop ancien : l'appelant retombe alors sur le message d'erreur
 * existant.
 */
export function lireCatalogue(maintenant = Date.now()): CatalogueHorsLigne | null {
  try {
    if (typeof window === "undefined" || !window.localStorage) return null;
    const brut = window.localStorage.getItem(CLE);
    if (!brut) return null;
    const analyse: unknown = JSON.parse(brut);
    if (!estCatalogue(analyse)) return null;
    if (ageCatalogue(analyse, maintenant) > FRAICHEUR_MAX_JOURS) return null;
    return analyse;
  } catch {
    return null;
  }
}

/** Vrai si l'utilisateur est hors ligne (ou si le navigateur ne répond plus). */
export function horsLigne(): boolean {
  try {
    return typeof navigator !== "undefined" && navigator.onLine === false;
  } catch {
    return false;
  }
}

export function effacerCatalogue(): void {
  try {
    if (typeof window !== "undefined" && window.localStorage) window.localStorage.removeItem(CLE);
  } catch {
    /* ignoré */
  } finally {
    cache = null;
    notifier();
  }
}

// ------------------------------------------ store React (useSyncExternalStore)
// Nécessaire : une lecture `JSON.parse` à chaque rendu renverrait un objet
// différent et ferait boucler `useSyncExternalStore`. Le cache est donc
// stable tant que le contenu ne change pas, comme dans sale-queue.ts.
let cache: CatalogueHorsLigne | null = null;
let cacheLu = false;
const abonnes = new Set<() => void>();

function notifier(): void {
  for (const cb of abonnes) cb();
}

/** Snapshot stable pour useSyncExternalStore (côté navigateur). */
export function getCatalogueSnapshot(): CatalogueHorsLigne | null {
  if (!cacheLu) {
    cache = lireCatalogue();
    cacheLu = true;
  }
  return cache;
}

/** Snapshot serveur : le SSR ne connaît pas le localStorage. */
export function getCatalogueServeurSnapshot(): null {
  return null;
}

export function subscribeCatalogue(cb: () => void): () => void {
  abonnes.add(cb);
  return () => {
    abonnes.delete(cb);
  };
}

// ------------------------------------------- portée par compte (NF-02 / D5)

/**
 * Clé d'identité locale. Distincte de celle de la file de tickets : elle ne
 * contient aucune donnée métier, juste de quoi savoir à qui appartient le
 * catalogue présent sur l'appareil.
 *
 * Elle n'est PAS une frontière de confidentialité (le localStorage est
 * lisible par quiconque a le profil navigateur). Son rôle est d'empêcher
 * l'application de servir, par accident, les données d'un autre compte.
 */
export const CLE_IDENTITE = "patisgest.session.v1";

export type IdentiteLocale = { clientId: string; authUserId: string };

function lireJson(storage: StorageLike | undefined, cle: string): unknown {
  if (!storage) return null;
  try {
    const brut = storage.getItem(cle);
    if (!brut) return null;
    return JSON.parse(brut);
  } catch {
    return null;
  }
}

/** Identité du compte actuellement « connu » de cet appareil, ou null. */
export function identiteCourante(storage?: StorageLike): IdentiteLocale | null {
  const st = storage ?? stockageNavigateur();
  const v = lireJson(st, CLE_IDENTITE);
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (typeof o.clientId !== "string" || !o.clientId) return null;
  if (typeof o.authUserId !== "string" || !o.authUserId) return null;
  return { clientId: o.clientId, authUserId: o.authUserId };
}

/** Enregistre l'identité à la connexion (appelé par l'écran qui monte la caisse). */
export function enregistrerIdentite(identite: IdentiteLocale, storage?: StorageLike): void {
  const st = storage ?? stockageNavigateur();
  if (!st) return;
  try {
    st.setItem(CLE_IDENTITE, JSON.stringify(identite));
    cacheLu = false;
    notifier();
  } catch {
    /* quota plein : le hors-ligne restera indisponible, la caisse en ligne marche */
  }
}

/**
 * Efface le catalogue ET l'identité (déconnexion, changement de compte).
 *
 * `StorageLike` ne garantit que `getItem`/`setItem` : la suppression est donc
 * optionnelle et vérifiée. Un stockage qui ne sait pas supprimer n'est pas une
 * raison de planter une déconnexion — on écrase par une valeur vide, ce qui
 * suffit à empêcher toute relecture.
 */
export function oublierCetAppareil(storage?: StorageLike & { removeItem?: (k: string) => void }): void {
  const st = (storage ?? stockageNavigateur()) as
    | (StorageLike & { removeItem?: (k: string) => void })
    | undefined;
  if (!st) return;
  try {
    if (typeof st.removeItem === "function") {
      st.removeItem(CLE);
      st.removeItem(CLE_IDENTITE);
    } else {
      st.setItem(CLE, "");
      st.setItem(CLE_IDENTITE, "");
    }
    cacheLu = false;
    cache = null;
    notifier();
  } catch {
    /* ignoré */
  }
}

function stockageNavigateur(): StorageLike | undefined {
  try {
    if (typeof window === "undefined" || !window.localStorage) return undefined;
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export type LectureCatalogue =
  | { ok: true; catalogue: CatalogueHorsLigne; ageJours: number }
  | {
      ok: false;
      raison: "absent" | "illisible" | "sans-identite" | "autre-compte" | "perime";
      ageJours?: number;
    };

/**
 * Lit le catalogue **pour un compte donné**, et refuse tout le reste.
 *
 * Ordre des contrôles, volontaire : on vérifie l'appartenance AVANT la
 * fraîcheur. Un catalogue périmé d'un autre compte doit être signalé comme
 * « autre compte », jamais comme « périmé » — sinon le message affiché à
 * l'utilisateur suggère de « rafraîchir » un cache qui ne lui appartient pas.
 */
export function cataloguePourIdentite(
  storage: StorageLike | undefined,
  clientId: string,
  maintenant = Date.now(),
): LectureCatalogue {
  const st = storage ?? stockageNavigateur();
  if (!st) return { ok: false, raison: "absent" };

  const identite = identiteCourante(st);
  if (!identite) return { ok: false, raison: "sans-identite" };
  if (identite.clientId !== clientId) return { ok: false, raison: "autre-compte" };

  const brut = st.getItem(CLE);
  if (brut === null) return { ok: false, raison: "absent" };

  let analyse: unknown;
  try {
    analyse = JSON.parse(brut);
  } catch {
    return { ok: false, raison: "illisible" };
  }
  if (!estCatalogue(analyse)) return { ok: false, raison: "illisible" };

  // Le cache doit être étiqueté avec le même compte que la session locale.
  // Un cache v1 non étiqueté est accepté uniquement parce que l'identité locale
  // correspond : c'est le seul cas où l'appartenance est établie autrement.
  if (analyse.clientId && analyse.clientId !== clientId) {
    return { ok: false, raison: "autre-compte" };
  }

  const age = ageCatalogue(analyse, maintenant);
  if (age > FRAICHEUR_MAX_JOURS) return { ok: false, raison: "perime", ageJours: age };

  return { ok: true, catalogue: analyse, ageJours: age };
}
