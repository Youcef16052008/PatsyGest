import type { FefoLot } from "./fefo-cost.ts";

/**
 * Revue N+1 (fiche de coût, simulation) : une requête `in()` par bloc d'articles
 * au lieu d'une requête par ingrédient. Pagination jusqu'à la page courte, donc
 * aucune troncature silencieuse ; une erreur remonte à l'appelant.
 *
 * Contrairement à l'ancienne requête `.limit(300)` par article, il n'y a plus de
 * plafond par article : le FEFO voit tous les lots éligibles.
 */

export const COLONNES_LOTS_FEFO = "id, article_id, qte_rest, pu, dlc, date_reception, congele, bloque";

type Resultat = { data: unknown[] | null; error: { message?: string } | null };
type Requete = {
  eq: (c: string, v: unknown) => Requete;
  in: (c: string, v: unknown[]) => Requete;
  gt: (c: string, v: unknown) => Requete;
  order: (c: string, o: { ascending: boolean }) => Requete;
  range: (a: number, b: number) => PromiseLike<Resultat>;
};
export type ClientLots = { from: (table: string) => { select: (cols: string) => Requete } };

/** Découpe les identifiants distincts en blocs de taille bornée. */
export function blocsIdentifiants(ids: readonly string[], taille = 100): string[][] {
  const uniques = [...new Set(ids.filter((id) => typeof id === "string" && id !== ""))];
  const blocs: string[][] = [];
  for (let i = 0; i < uniques.length; i += taille) blocs.push(uniques.slice(i, i + taille));
  return blocs;
}

export async function lireLotsPourArticles(
  supabase: ClientLots,
  clientId: string,
  articleIds: readonly string[],
  { taille = 100, page = 1000 }: { taille?: number; page?: number } = {},
): Promise<{ lots: Map<string, FefoLot[]>; erreur: string | null }> {
  const lots = new Map<string, FefoLot[]>();
  for (const bloc of blocsIdentifiants(articleIds, taille)) {
    let offset = 0;
    for (;;) {
      const { data, error } = await supabase
        .from("lots")
        .select(COLONNES_LOTS_FEFO)
        .eq("client_id", clientId)
        .eq("bloque", false)
        .gt("qte_rest", 0)
        .in("article_id", bloc)
        .order("id", { ascending: true })
        .range(offset, offset + page - 1);
      if (error) return { lots, erreur: error.message ?? "Lecture des lots impossible." };
      const rows = (data ?? []) as (FefoLot & { article_id: string })[];
      for (const row of rows) {
        const liste = lots.get(row.article_id) ?? [];
        liste.push(row);
        lots.set(row.article_id, liste);
      }
      if (rows.length < page) break;
      offset += page;
    }
  }
  return { lots, erreur: null };
}
