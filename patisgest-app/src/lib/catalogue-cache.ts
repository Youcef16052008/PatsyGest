/**
 * Catalogue de caisse hors-ligne (NF-02, D5).
 *
 * Le service worker met l'écran /caisse en cache, mais une page Next rendue
 * côté serveur **ne peut pas s'afficher sans réseau** : les données viennent
 * de Supabase. Sans ce cache, la caisse « ouverte » hors ligne afficherait
 * « Impossible de charger les produits » — c'est-à-dire rien.
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

export type CatalogueHorsLigne = {
  /** Version du format : un cache d'une ancienne forme est ignoré. */
  version: 1;
  /** Horodatage ISO du dernier enregistrement réussi. */
  enregistreLe: string;
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
