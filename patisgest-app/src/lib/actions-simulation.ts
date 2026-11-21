"use server";

import { canReadCosts, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { computeFefoCost } from "./fefo-cost";
import { lireLotsPourArticles, type ClientLots } from "./lots-batch";
import { createClient } from "./supabase/server";

export type SimuBesoins = {
  articleId: string;
  code: string;
  nom: string;
  qty: number;
  unit: string;
};

export type SimuRow = SimuBesoins & {
  couvert: number;
  cout: number;
  insuffisant: boolean;
  perimeExclu: number;
};

export type SimulationState = {
  erreur?: string;
  succes?: string;
  famille?: string;
  version?: number;
  rendement?: string;
  qte?: number;
  rows?: SimuRow[];
  total?: number;
  coutUnite?: number;
};

/**
 * Simulation de prix réelle : version active du produit, besoins étendus
 * (sous-recettes + conversions inclus), coût FEFO sur les lots éligibles
 * (hors lots bloqués ET hors lots à DLC dépassée).
 */
export async function simulerReal(_prev: SimulationState, formData: FormData): Promise<SimulationState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canReadCosts(ctx.role)) return { erreur: "Coûts de revient réservés aux rôles propriétaire et labo." };
  const produitId = String(formData.get("produitId") ?? "").trim();
  const qte = Number(formData.get("qte"));
  if (!/^[0-9a-f-]{36}$/i.test(produitId)) return { erreur: "Produit invalide." };
  if (!Number.isFinite(qte) || qte <= 0 || qte > 100_000_000) return { erreur: "Quantité invalide." };
  try {
    const supabase = await createClient();
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase.rpc("simuler_recette", {
      p_produit_id: produitId,
      p_qte: qte,
    });
    if (error) return { erreur: messageUtilisateur(error, "Simulation impossible") };
    const r = data as {
      famille: { code: string; nom: string };
      version: number;
      rendement_qte: number;
      rendement_unite: string;
      besoins: SimuBesoins[];
    };
    // N+1 : une lecture groupée pour tous les besoins (revue, simulation).
    const besoins = r.besoins ?? [];
    const { lots: lotsParArticle, erreur: erreurLots } = await lireLotsPourArticles(
      supabase as unknown as ClientLots,
      ctx.clientId,
      besoins.map((b) => b.articleId),
    );
    if (erreurLots) return { erreur: `Lecture des lots impossible : ${erreurLots}` };
    const rows: SimuRow[] = await Promise.all(
      besoins.map(async (b) => {
        const lots = lotsParArticle.get(b.articleId) ?? [];
        const fefo = computeFefoCost(lots, b.qty, today);
        return {
          ...b,
          couvert: fefo.couvert,
          cout: fefo.cout,
          insuffisant: fefo.insuffisant,
          perimeExclu: fefo.perimeExclu,
        };
      }),
    );
    const total = Math.round(rows.reduce((s, x) => s + x.cout, 0) * 100) / 100;
    const manquant = rows.some((x) => x.insuffisant);
    const perime = rows.some((x) => x.perimeExclu > 0);
    return {
      famille: `${r.famille.code} — ${r.famille.nom}`,
      version: r.version,
      rendement: `${r.rendement_qte} ${r.rendement_unite}`,
      qte,
      rows,
      total,
      coutUnite: Math.round((total / qte) * 10000) / 10000,
      succes:
        (manquant
          ? "Simulation calculée — stock FEFO éligible insuffisant pour certains besoins (coût partiel)."
          : "Simulation calculée (version active + coût FEFO éligible).") +
        (perime ? " Lots à DLC dépassée exclus." : ""),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
