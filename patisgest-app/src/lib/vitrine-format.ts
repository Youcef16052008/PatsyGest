/**
 * Formatage de la vitrine — module PUR, sans Next ni Supabase.
 *
 * Séparé de `vitrine.ts` volontairement : `vitrine.ts` interroge la base
 * (donc importe `next/headers` via le client serveur). Un composant
 * client qui n'a besoin que d'afficher un prix ne doit pas tirer tout
 * cela dans le bundle navigateur — Next refuse le build dans ce cas
 * (« next/headers is not supported in Client Components »).
 */

export type ArticlePrix = {
  /** `null` = prix non communiqué. Jamais 0 : « 0 DA » serait faux. */
  prixHt: number | null;
  unite: string | null;
};

/**
 * « 260 DA / pcs », ou « Prix sur demande » quand l'article n'a pas de
 * prix de vente renseigné (cas mesuré : la famille « Cake » pointe sur un
 * article à 0 DA).
 */
export function libellePrix(article: ArticlePrix): string {
  if (article.prixHt === null || article.prixHt === undefined) return "Prix sur demande";
  const montant = article.prixHt.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return `${montant} DA${article.unite ? ` / ${article.unite}` : ""}`;
}
