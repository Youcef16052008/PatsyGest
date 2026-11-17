"use server";

import { revalidatePath } from "next/cache";
import { canWrite, canReadCosts, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import {
  aggregatePertes, computeFicheCout, rc07TauxPerte, rc08ManqueAJagner, rc10GardeFous,
  type ClotureLigne, type GardeFou,
} from "./cost-sheet";
import { computeFefoCost, type FefoLot } from "./fefo-cost";
import { createClient } from "./supabase/server";

export type CoutsState = {
  erreur?: string;
  succes?: string;
  // Paramètres RC-04
  tauxHoraire?: number;
  chargesPct?: number;
  // Fiche
  produit?: string;
  famille?: string;
  version?: number;
  rendement?: string;
  lignes?: { code: string; nom: string; qty: number; unit: string; couvert: number; cout: number; insuffisant: boolean }[];
  matiere?: number;
  emballage?: number;
  mo?: number;
  energie?: number;
  fraisGeneraux?: number;
  total?: number;
  net?: number;
  portion?: number;
  pvHt?: number;
  marge?: number;
  taux?: number;
  perte?: { taux: number; manque: number; source?: string };
  gardeFous?: GardeFou[];
};

/** Enregistre les paramètres de coûts (RC-04 : taux horaire + charges). */
export async function sauverParamsCoutsReal(_prev: CoutsState, formData: FormData): Promise<CoutsState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  const taux = Number(formData.get("tauxHoraire"));
  const charges = Number(formData.get("chargesPct"));
  if (!Number.isFinite(taux) || taux < 0 || taux > 1_000_000) return { erreur: "Taux horaire invalide." };
  if (!Number.isFinite(charges) || charges < 0 || charges > 1000) return { erreur: "Charges invalides (0-1000 %)." };
  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("parametres_couts")
      .upsert(
        { client_id: ctx.clientId, taux_horaire: taux, charges_pct: charges, updated_at: new Date().toISOString() },
        { onConflict: "client_id" },
      );
    if (error) return { erreur: messageUtilisateur(error, "Sauvegarde refusée") };
    revalidatePath("/simulation");
    return { succes: "Paramètres de coûts enregistrés.", tauxHoraire: taux, chargesPct: charges };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/**
 * Fiche de coût RC-01..RC-10 d'un produit : version active, matières FEFO
 * (parage inclus), paramètres RC-04, PV HT, pertes RC-07/08 et garde-fous RC-10.
 */
export async function ficheCoutReal(_prev: CoutsState, formData: FormData): Promise<CoutsState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canReadCosts(ctx.role)) return { erreur: "Coûts de revient réservés aux rôles propriétaire et labo." };
  const produitId = String(formData.get("produitId") ?? "").trim();
  const qte = Number(formData.get("qte"));
  const jete = Number(formData.get("jete") ?? 0);
  const casse = Number(formData.get("casse") ?? 0);
  const fabrique = Number(formData.get("fabrique") ?? 0);
  const refRaw = String(formData.get("reference") ?? "").trim();
  const reference = refRaw === "" ? null : Number(refRaw);
  if (!/^[0-9a-f-]{36}$/i.test(produitId)) return { erreur: "Produit invalide." };
  if (!Number.isFinite(qte) || qte <= 0 || qte > 100_000_000) return { erreur: "Quantité invalide." };
  if (reference !== null && (!Number.isFinite(reference) || reference < 0)) return { erreur: "Référence invalide." };
  try {
    const supabase = await createClient();

    const trenteJours = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const [simRes, verRes, paramsRes, artRes, cloRes] = await Promise.all([
      supabase.rpc("simuler_recette", { p_produit_id: produitId, p_qte: qte }),
      supabase
        .from("recette_versions")
        .select("mo_min, energie, emballage, frais_generaux, cuisson_perte_pct, recette_familles!inner(produit_id, code, nom)")
        .eq("client_id", ctx.clientId)
        .eq("active", true)
        .limit(1),
      supabase.from("parametres_couts").select("taux_horaire, charges_pct").eq("client_id", ctx.clientId).limit(1),
      supabase.from("articles").select("code, pu_ht").eq("id", produitId).limit(1),
      supabase.from("clotures").select("lignes").eq("client_id", ctx.clientId).gte("date_cloture", trenteJours).limit(60),
    ]);
    if (simRes.error) return { erreur: messageUtilisateur(simRes.error, "Fiche impossible") };
    const sim = simRes.data as {
      famille: { code: string; nom: string };
      version: number;
      rendement_qte: number;
      rendement_unite: string;
      besoins: { articleId: string; code: string; nom: string; qty: number; unit: string }[];
    };
    const verRow = ((verRes.data ?? [])[0] ?? null) as {
      mo_min: number; energie: number; emballage: number; frais_generaux: number; cuisson_perte_pct: number;
      recette_familles: { produit_id: string; code: string; nom: string } | { produit_id: string; code: string; nom: string }[];
    } | null;
    if (!verRow) return { erreur: "Aucune version active pour ce produit." };
    const fam = Array.isArray(verRow.recette_familles) ? verRow.recette_familles[0] : verRow.recette_familles;
    const params = ((paramsRes.data ?? [])[0] ?? null) as { taux_horaire: number; charges_pct: number } | null;
    const tauxHoraire = Number(params?.taux_horaire ?? 0);
    const chargesPct = Number(params?.charges_pct ?? 0);
    const artRow = ((artRes.data ?? [])[0] ?? null) as { code: string; pu_ht: number } | null;
    const pvHt = Number(artRow?.pu_ht ?? 0);
    const articleCode = artRow?.code ?? "";

    const lignes = await Promise.all(
      (sim.besoins ?? []).map(async (b) => {
        const lotsRes = await supabase
          .from("lots")
          .select("id, qte_rest, pu, dlc, date_reception, congele")
          .eq("client_id", ctx.clientId)
          .eq("article_id", b.articleId)
          .eq("bloque", false)
          .gt("qte_rest", 0)
          .limit(200);
        const lots = (lotsRes.data ?? []) as FefoLot[];
        const fefo = computeFefoCost(lots, b.qty);
        return {
          code: b.code, nom: b.nom, qty: b.qty, unit: b.unit,
          couvert: fefo.couvert, cout: fefo.cout, insuffisant: fefo.insuffisant,
        };
      }),
    );
    const matiere = Math.round(lignes.reduce((s, l) => s + l.cout, 0) * 100) / 100;

    const fiche = computeFicheCout({
      matiereFefo: matiere,
      emballage: Number(verRow.emballage ?? 0),
      moMin: Number(verRow.mo_min ?? 0),
      tauxHoraire,
      chargesPct,
      energie: Number(verRow.energie ?? 0),
      fraisGeneraux: Number(verRow.frais_generaux ?? 0),
      rendementBrut: sim.rendement_qte,
      cuissonPct: Number(verRow.cuisson_perte_pct ?? 0),
      pvHt,
    });

    // RC-07/08 : données réelles des clôtures30 j (source de vérité),
    // repli sur la saisie manuelle si aucune clôture pour ce produit.
    const clotureLignes: ClotureLigne[] = [];
    for (const c of ((cloRes.data ?? []) as { lignes: unknown }[])) {
      if (Array.isArray(c.lignes)) {
        for (const l of c.lignes as Record<string, unknown>[]) {
          clotureLignes.push({
            code: String(l.code ?? ""),
            produit: Number(l.produit ?? 0),
            jete: Number(l.jete ?? 0),
            casse: Number(l.casse ?? 0),
          });
        }
      }
    }
    const reel = aggregatePertes(clotureLignes, articleCode);
    const perteReelle = reel.produit > 0;
    const pertes = perteReelle
      ? { taux: reel.taux, manque: rc08ManqueAJagner(reel.jete, reel.casse, pvHt), source: `réelles30 j (clôtures, ${reel.produit} fabriqués)` as string }
      : { taux: rc07TauxPerte(jete, casse, fabrique > 0 ? fabrique : 1), manque: rc08ManqueAJagner(jete, casse, pvHt), source: "saisies manuellement" as string };
    const gardeFous = rc10GardeFous(fiche.rc03Total, reference, pvHt, null);
    if (lignes.some((l) => l.insuffisant)) {
      gardeFous.push({ code: "RC-10-x10", message: "Stock FEFO insuffisant pour certains besoins — coût partiel." });
    }

    revalidatePath("/simulation");
    return {
      produit: sim.famille.nom,
      famille: `${sim.famille.code} — ${sim.famille.nom}`,
      version: sim.version,
      rendement: `${sim.rendement_qte} ${sim.rendement_unite}`,
      lignes,
      matiere,
      emballage: Number(verRow.emballage ?? 0),
      mo: fiche.rc04Mo,
      energie: Number(verRow.energie ?? 0),
      fraisGeneraux: Number(verRow.frais_generaux ?? 0),
      total: fiche.rc03Total,
      net: fiche.rc02RendementNet,
      portion: fiche.rc05ParPortion,
      pvHt,
      marge: fiche.rc06.marge,
      taux: fiche.rc06.taux,
      perte: pertes,
      gardeFous,
      tauxHoraire,
      chargesPct,
      succes: "Fiche de coût RC-01..RC-10 calculée.",
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
