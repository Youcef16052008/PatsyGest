import { createHmac } from "node:crypto";

/**
 * Revue B-008 : identifiant de source pour l'anti-abus de la vitrine.
 *
 * On ne transmet jamais l'IP à la base. On envoie un HMAC-SHA256 de l'IP,
 * calculé côté serveur avec un secret (VITRINE_SECRET_ANTI_ABUS). Hors
 * production, un secret absent laisse le plafond global seul ; en production,
 * l'action de commande refuse explicitement la requête (échec fermé).
 */
export const LONGUEUR_SECRET_ANTI_ABUS = 32;

/** Vrai si un secret serveur suffisant permet de calculer une source HMAC. */
export function secretAntiAbusValide(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= LONGUEUR_SECRET_ANTI_ABUS;
}

/** Vrai quand un déploiement de production n'a PAS le secret anti-abus requis. */
export function productionSansSecretAntiAbus(secret: string | undefined): boolean {
  const production =
    process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
  return production && !secretAntiAbusValide(secret);
}

export function sourceVisiteur(
  enTetes: { get(nom: string): string | null },
  secret: string | undefined,
): string | null {
  if (!secretAntiAbusValide(secret)) return null;
  const premiere = enTetes.get("x-forwarded-for")?.split(",")[0]?.trim();
  const brut = premiere || enTetes.get("x-real-ip")?.trim() || "inconnu";
  return createHmac("sha256", secret).update(brut).digest("hex");
}
