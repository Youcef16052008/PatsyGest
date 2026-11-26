/**
 * Photo d'une recette libre : garde-fou sur ce qui part en base.
 *
 * Deux origines acceptées :
 *  - un chemin livré avec l'application (`/recettes/baklawa.webp`) ;
 *  - une image compressée côté navigateur, en `data:image/jpeg;base64,…`.
 *
 * Tout le reste est refusé : une URL externe deviendrait une balise `<img>`
 * pilotée par un utilisateur (fuite de référent, pistage) et un `svg+xml`
 * peut porter du script. La limite de taille protège la base : les recettes
 * sont lues à chaque affichage de l'écran Recettes.
 */

const MAX_DATA_URL_BYTES = 220_000;

export function sanitizeRecipePhoto(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;

  if (value.startsWith("/recettes/")) {
    // Chemin local : pas de remontée de dossier, pas de schéma, extension image.
    return /^\/recettes\/[a-z0-9-]+\.(webp|jpg|jpeg|png)$/i.test(value) ? value : null;
  }

  // La lettre « A » répétée est le contenu d'un base64 : un préfixe seul
  // (`data:image/jpeg;base64,`) n'est pas une image et doit être refusé.
  if (/^data:image\/(jpeg|png|webp);base64,A[A-Za-z0-9+/=]*$/.test(value)) {
    return value.length <= MAX_DATA_URL_BYTES ? value : null;
  }

  return null;
}
