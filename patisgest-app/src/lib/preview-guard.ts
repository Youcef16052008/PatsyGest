/**
 * Les aperçus Vercel ne sont pas des bacs à sable : tant qu'une base isolée
 * n'est pas configurée et vérifiée, aucun accès métier n'y est autorisé.
 * Il s'agit d'un garde-fou applicatif, pas d'une modification des droits API.
 */
export function previewBloquee(vercelEnv: string | undefined, buildFlag?: string): boolean {
  /*
   * `buildFlag` est figé à la compilation par `next.config.ts` : il vaut "1"
   * si le build a été fait sur un déploiement `preview`. Après une PROMOTION
   * de ce build vers la production, `VERCEL_ENV` devient "production" mais le
   * drapeau reste "1" dans le paquet — et toutes les routes rendaient 503,
   * définitivement, calculateur public compris.
   *
   * L'environnement d'exécution est la seule source fiable : s'il dit
   * « production », on ne bloque jamais, quel que soit le drapeau figé.
   * Le drapeau ne sert donc plus qu'au cas où l'environnement est inconnu
   * (exécution hors Vercel, où `VERCEL_ENV` n'est pas injecté).
   */
  if (vercelEnv === "production") return false;
  return vercelEnv === "preview" || buildFlag === "1";
}

/** Seul le calculateur sans compte est servi dans l'aperçu désactivé. */
export function routePubliquePreview(pathname: string, method: string): boolean {
  return pathname === "/estimation" && (method === "GET" || method === "HEAD");
}
