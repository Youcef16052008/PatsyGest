/**
 * Mode « tout gratuit » — interrupteur de licence / abonnement.
 *
 * Tant que l'application n'est pas commercialisée, on ne veut ni essai qui
 * expire, ni écran de verrouillage, ni validation de paiement. Le drapeau est
 * **activé par défaut** ; il ne se coupe qu'avec une variable d'environnement
 * explicite (`PATISGEST_MODE_GRATUIT=0`), le jour où l'abonnement sera ouvert.
 *
 * Un seul endroit décide : les layouts, le bandeau d'essai et l'espace Master
 * lisent tous `modeGratuit()` — jamais une variable d'environnement brute.
 */

/** Valeurs qui désactivent le mode gratuit (donc réactivent essai + paiement). */
const VALEURS_DESACTIVEES_GRATUIT = new Set(["0", "false", "non", "off", "abonnement"]);

/**
 * Vrai quand l'abonnement n'est pas encore nécessaire : pas d'essai qui
 * s'écoule, pas de verrouillage, pas de paiement à valider.
 *
 * Côté navigateur, la variable d'environnement n'existe pas : on retombe sur
 * la valeur exposée à la compilation par `next.config.ts`.
 */
export function modeGratuit(): boolean {
  const brut = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_PATISGEST_MODE_GRATUIT : undefined;
  if (brut === undefined) return true;
  return !VALEURS_DESACTIVEES_GRATUIT.has(brut.trim().toLowerCase());
}

/** Le paiement en ligne est-il proposé ? Désactivé tant que `modeGratuit()`. */
export function paiementActif(): boolean {
  return !modeGratuit();
}

/** L'essai daté (60–90 jours) est-il appliqué ? */
export function essaiActif(): boolean {
  return !modeGratuit();
}
