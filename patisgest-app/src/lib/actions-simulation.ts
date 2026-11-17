"use server";

import { canReadCosts, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { computeFefoCost, type FefoLot } from "./fefo-cost";
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
 * (sous-recettes + conversions inclus), coût FEFO sur les lots disponibles.
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
    const { data, error } = await supabase.rpc("simuler_recette", {
      p_produit_id: produitId, p_qte: qte,
    });
    if (error) return { erreur: messageUtilisateur(error, "Simulation impossible") };
    const r = data as {
      famille: { code: string; nom: string };
      version: number;
      rendement_qte: number;
      rendement_unite: string;
      besoins: SimuBesoins[];
    };
    const rows: SimuRow[] = await Promise.all(
      (r.besoins ?? []).map(async (b) => {
        const lotsRes = await supabase
          .from("lots")
          .select("id, qte_rest, pu, dlc, date_reception, congele")
          .eq("client_id", ctx.clientId)
          .eq("article_id", b.articleId)
          .eq("bloque", false)
          .gt("qte_rest", 0)
          .limit(200);
        const lots = ((lotsRes.data ?? []) as (FefoLot & { id: string })[]);
        const fefo = computeFefoCost(lots, b.qty);
        return { ...b, couvert: fefo.couvert, cout: fefo.cout, insuffisant: fefo.insuffisant };
      }),
    );
    const total = Math.round(rows.reduce((s, x) => s + x.cout, 0) * 100) / 100;
    const manquant = rows.some((x) => x.insuffisant);
    return {
      famille: `${r.famille.code} — ${r.famille.nom}`,
      version: r.version,
      rendement: `${r.rendement_qte} ${r.rendement_unite}`,
      qte,
      rows,
      total,
      coutUnite: Math.round((total / qte) * 10000) / 10000,
      succes: manquant
        ? "Simulation calculée — stock FEFO insuffisant pour certains besoins (coût partiel)."
        : "Simulation calculée (version active + coût FEFO réel).",
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
