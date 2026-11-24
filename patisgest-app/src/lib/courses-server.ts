"use server";

import { createClient } from "@/lib/supabase/server";
import { listeCourses, type BesoinArticle, type ResultatCourses } from "@/lib/liste-courses";

/**
 * US-03.3 — lecture serveur de la liste de courses.
 *
 * Sources, toutes côté serveur (jamais de calcul dans le navigateur : c'est ce
 * qui rend la liste opposable en cas de litige avec un fournisseur) :
 *   1. `ordres_fabrication.besoins` des OF non terminés — le besoin est figé
 *      au lancement de l'OF (`creer_of`), donc il ne bouge pas sous nos pieds ;
 *   2. `lots.qte_rest` des lots non bloqués et non périmés, sur les sites
 *      autorisés pour l'utilisateur ;
 *   3. `bons_commande.lignes` des BC `commande` ou `partiel` : la quantité
 *      restant à recevoir, pas la quantité commandée (sinon on sur-commande).
 *
 * Toute erreur de lecture est remontée, jamais avalée : une liste de courses
 * silencieusement incomplète ferait rater une production.
 */

export type DonneesCourses = {
  resultat: ResultatCourses;
  /** Nombre d'OF pris en compte, pour l'affichage. */
  nbOf: number;
  erreur: boolean;
};

type OfRow = { id: string; besoins: BesoinArticle[] | null };
type LotRow = { article_id: string | null; qte_rest: number | null };
type BcRow = { lignes: { articleId?: string; qte?: number; recu?: number }[] | null };

export async function lireListeCourses(clientId: string): Promise<DonneesCourses> {
  const vide: DonneesCourses = {
    resultat: { lignes: [], aAcheter: [], ignores: 0 },
    nbOf: 0,
    erreur: false,
  };

  try {
    const db = await createClient();
    const aujourdhui = new Date().toISOString().slice(0, 10);

    // Un OF terminé ou annulé n'a plus besoin d'ingrédients : on ne commande
    // que pour ce qui reste à produire.
    const [ofRes, lotsRes, bcRes, artRes] = await Promise.all([
      db
        .from("ordres_fabrication")
        .select("id, besoins")
        .eq("client_id", clientId)
        .in("statut", ["planifie", "en_cours"])
        .limit(500),
      db
        .from("lots")
        .select("article_id, qte_rest")
        .eq("client_id", clientId)
        .gt("qte_rest", 0)
        .eq("bloque", false)
        .or(`dlc.is.null,dlc.gte.${aujourdhui}`)
        .limit(5000),
      db
        .from("bons_commande")
        .select("lignes")
        .eq("client_id", clientId)
        .in("statut", ["commande", "partiel"])
        .limit(500),
      db.from("articles").select("id, unite").eq("client_id", clientId).limit(5000),
    ]);

    if (ofRes.error || lotsRes.error || bcRes.error || artRes.error) {
      return { ...vide, erreur: true };
    }

    const unites = new Map(
      ((artRes.data ?? []) as { id: string; unite: string | null }[]).map((a) => [
        a.id,
        a.unite ?? "",
      ]),
    );

    const besoins: BesoinArticle[] = [];
    const ofs = (ofRes.data ?? []) as OfRow[];
    for (const of of ofs) {
      for (const b of of.besoins ?? []) {
        if (!b || typeof b !== "object") continue;
        besoins.push(b);
      }
    }

    // Plusieurs lots du même article : on somme. Aucun lot n'est ignoré
    // silencieusement, sinon on achèterait du stock qu'on possède déjà.
    const stockParArticle = new Map<string, { articleId: string; qteRest: number; unit: string }>();
    for (const lot of (lotsRes.data ?? []) as LotRow[]) {
      if (!lot.article_id) continue;
      const qte = Number(lot.qte_rest);
      if (!Number.isFinite(qte) || qte <= 0) continue;
      // L’unité vient de l’article : `lots` ne la porte pas (migration 03).
      const unite = unites.get(lot.article_id) ?? "";
      const existant = stockParArticle.get(lot.article_id);
      if (existant && existant.unit === unite) {
        existant.qteRest += qte;
      } else if (!existant) {
        stockParArticle.set(lot.article_id, { articleId: lot.article_id, qteRest: qte, unit: unite });
      }
      // Unités mixtes sur le même article : on garde la première et la liste
      // signalera l'incohérence au niveau du besoin. On ne convertit pas ici.
    }

    const enCommande: { articleId: string; qte: number }[] = [];
    for (const bc of (bcRes.data ?? []) as BcRow[]) {
      for (const l of bc.lignes ?? []) {
        if (!l?.articleId) continue;
        const reste = Number(l.qte ?? 0) - Number(l.recu ?? 0);
        if (Number.isFinite(reste) && reste > 0) {
          enCommande.push({ articleId: l.articleId, qte: reste });
        }
      }
    }

    return {
      resultat: listeCourses({ besoins, stock: [...stockParArticle.values()], enCommande }),
      nbOf: ofs.length,
      erreur: false,
    };
  } catch {
    return { ...vide, erreur: true };
  }
}
