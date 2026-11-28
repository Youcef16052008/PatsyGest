/**
 * Résolution du segment `[slug]` de la vitrine publique.
 *
 * Module PUR (aucune dépendance Next/Supabase) : la page publique est la
 * surface la plus exposée du produit, cette règle doit être testable seule.
 *
 * Deux problèmes réglés ici :
 *   1. `decodeURIComponent` lève `URIError` sur `%E0%A4%A`. Un visiteur peut
 *      fabriquer cette URL : sans garde, la page publique répond 500.
 *   2. Un slug doit rester un nom DNS (même format que `domaines.ts`), donc
 *      pas de `%2F`, `..`, ni longueur arbitraire.
 */

/** Un label DNS : 63 octets au plus, alphanumérique minuscule et tirets. */
const SLUG_VALIDE = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/;
export const SLUG_MAX = 63;

/** Longueur maximale acceptée AVANT décodage (borne le coût du décodage). */
const ENTREE_MAX = 256;

/**
 * Normalise un slug déjà décodé.
 * @returns le slug, ou `null` s'il n'est pas un nom de boutique valide.
 */
export function normaliserSlug(valeur: unknown): string | null {
  if (typeof valeur !== "string") return null;
  const slug = valeur.trim().toLowerCase();
  if (!slug || slug === "_") return null;
  if (!SLUG_VALIDE.test(slug)) return null;
  return slug;
}

/**
 * Décode un segment d'URL brut puis le normalise.
 * Ne lève jamais : toute entrée douteuse renvoie `null` (l'appelant décide
 * entre `notFound()` et le repli sur l'en-tête `Host`).
 */
export function decodeSlug(brut: unknown): string | null {
  if (typeof brut !== "string") return null;
  // Un slug vide ou « _ » n'est pas une erreur : c'est la réécriture interne
  // du middleware, où la boutique vient de l'en-tête Host.
  const entree = brut.trim();
  if (!entree || entree === "_") return null;
  if (entree.length > ENTREE_MAX) return null;

  let decode: string;
  try {
    decode = decodeURIComponent(entree);
  } catch {
    // Séquence d'échappement invalide : refus, jamais d'exception.
    return null;
  }
  return normaliserSlug(decode);
}
