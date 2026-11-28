/**
 * Photo d'une recette libre ou d'un article : garde-fou sur ce qui part en base
 * et sur ce qui est relu depuis le stockage local.
 *
 * Deux origines acceptées :
 *  - un chemin livré avec l'application (`/recettes/baklawa.webp`,
 *    `/appearance/croissant.webp`) ;
 *  - une image compressée côté navigateur, en data-URL JPEG/PNG/WebP.
 *
 * Le préfixe `data:image/...;base64,` ne prouve PAS qu'il s'agit d'une image :
 * on vérifie désormais le base64 canonique ET les octets magiques réels. URL
 * externe, SVG et charge utile arbitraire sont refusés avant l'écriture. La
 * limite de taille protège la base : les photos sont relues à chaque écran.
 * Ce n'est pas un décodeur d'image complet : la validité bitmap reste au
 * navigateur, mais rien d'actionnable ni d'externe n'est stocké.
 */

export const MAX_DATA_URL_BYTES = 220_000;

const DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const BASE64_CANONIQUE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const CHEMIN_LOCAL = /^\/(recettes|appearance)\/[a-z0-9-]+\.(webp|jpg|jpeg|png)$/i;

function octetsDepuisBase64(base64: string): Uint8Array | null {
  try {
    const binaire = atob(base64);
    const octets = new Uint8Array(binaire.length);
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i);
    return octets;
  } catch {
    return null;
  }
}

function magicBytesValides(octets: Uint8Array, mime: string): boolean {
  const octet = (i: number) => octets[i];
  if (mime === "jpeg") {
    return octets.length >= 3 && octet(0) === 0xff && octet(1) === 0xd8 && octet(2) === 0xff;
  }
  if (mime === "png") {
    return (
      octets.length >= 8 &&
      [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => octet(i) === v)
    );
  }
  if (mime === "webp") {
    return (
      octets.length >= 12 &&
      [0x52, 0x49, 0x46, 0x46].every((v, i) => octet(i) === v) &&
      [0x57, 0x45, 0x42, 0x50].every((v, i) => octet(8 + i) === v)
    );
  }
  return false;
}

/** Valide une data-URL image réelle, sans jamais accepter un chemin local. */
export function sanitizeImageDataUrl(
  input: unknown,
  maxLongueur = MAX_DATA_URL_BYTES,
): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value || value.length > maxLongueur) return null;
  const trouve = DATA_URL.exec(value);
  if (!trouve) return null;
  const [, mime, base64] = trouve;
  if (!BASE64_CANONIQUE.test(base64) || base64.length % 4 !== 0) return null;
  const octets = octetsDepuisBase64(base64);
  if (!octets || !magicBytesValides(octets, mime)) return null;
  return value;
}

/** Chemin local livré avec l'application ou data-URL image vérifiée. */
export function sanitizeRecipePhoto(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const value = input.trim();
  if (!value) return null;
  if (CHEMIN_LOCAL.test(value)) return value;
  return sanitizeImageDataUrl(value, MAX_DATA_URL_BYTES);
}

/** Alias explicite pour les composants qui affichent une photo d'article. */
export const sanitizePhotoSource = sanitizeRecipePhoto;
