/**
 * Les aperçus Vercel ne sont pas des bacs à sable : tant qu'une base isolée
 * n'est pas configurée et vérifiée, aucun accès métier n'y est autorisé.
 * Il s'agit d'un garde-fou applicatif, pas d'une modification des droits API.
 */
export function previewBloquee(vercelEnv: string | undefined, buildFlag?: string): boolean {
  return vercelEnv === "preview" || buildFlag === "1";
}

/** Seul le calculateur sans compte est servi dans l'aperçu désactivé. */
export function routePubliquePreview(pathname: string, method: string): boolean {
  return pathname === "/estimation" && (method === "GET" || method === "HEAD");
}
