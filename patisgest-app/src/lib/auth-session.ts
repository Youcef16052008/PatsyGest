/**
 * Lecture de la jointure Supabase `utilisateurs … clients ( nom )`.
 *
 * Module PUR (aucune dépendance Next/Supabase) : `auth.ts` est difficile à
 * tester, cette règle ne l'est plus.
 *
 * PostgREST peut renvoyer trois formes pour la même jointure :
 *   - `{ nom }`        quand la FK est reconnue « many-to-one » ;
 *   - `[{ nom }]`      forme embarquée classique (tableau) ;
 *   - `[]` / `null`    aucun rattachement.
 *
 * L'ancien code faisait `as unknown as { nom } | null` et perdait
 * silencieusement le nom dans les deux derniers cas. Ici, toute forme non
 * reconnue renvoie `null` : on ne fabrique JAMAIS de nom de remplacement —
 * l'appelant décide (libellé générique) et l'on peut tracer la cause.
 */

/** Longueur maximale d'un nom d'établissement affiché (tickets, en-têtes). */
export const NOM_CLIENT_MAX = 120;

function nomDepuisObjet(valeur: unknown): string | null {
  if (!valeur || typeof valeur !== "object" || Array.isArray(valeur)) return null;
  const nom = (valeur as { nom?: unknown }).nom;
  if (typeof nom !== "string") return null;
  const propre = nom.trim();
  if (!propre) return null;
  return propre.slice(0, NOM_CLIENT_MAX);
}

/**
 * @returns le nom de l'établissement, ou `null` si la jointure est absente
 *          ou ambiguë. Un tableau de plus d'un élément est ambigu : on ne
 *          choisit pas au hasard.
 */
export function nomClientDepuisJointure(jointure: unknown): string | null {
  if (Array.isArray(jointure)) {
    if (jointure.length !== 1) return null;
    return nomDepuisObjet(jointure[0]);
  }
  return nomDepuisObjet(jointure);
}
