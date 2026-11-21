import { createHmac } from "node:crypto";

/**
 * Revue B-008 : identifiant de source pour l'anti-abus de la vitrine.
 *
 * On ne transmet jamais l'IP à la base. On envoie un HMAC-SHA256 de l'IP,
 * calculé côté serveur avec un secret (VITRINE_SECRET_ANTI_ABUS). Sans secret
 * d'au moins 32 caractères, la vérification par source est désactivée et seul
 * le plafond global de la base reste actif.
 */
export function sourceVisiteur(
  enTetes: { get(nom: string): string | null },
  secret: string | undefined,
): string | null {
  if (!secret || secret.length < 32) return null;
  const premiere = enTetes.get("x-forwarded-for")?.split(",")[0]?.trim();
  const brut = premiere || enTetes.get("x-real-ip")?.trim() || "inconnu";
  return createHmac("sha256", secret).update(brut).digest("hex");
}

/** Codes PostgREST quand la fonction 38 n'est pas encore installée : on continue. */
export const CODES_FONCTION_ABSENTE = ["PGRST202", "42883"] as const;
