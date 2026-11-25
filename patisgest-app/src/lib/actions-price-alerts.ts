"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import {
  evaluateEmployeePriceSubmission,
  type OwnerAlertStatus,
  type OwnerPriceAlert,
  type PriceAlertProductCategory,
  type PriceAlertTargetType,
} from "./owner-price-guard";
import { createClient } from "./supabase/server";

type AlertRow = {
  id: string;
  type: string;
  severite: string;
  cible_type: string;
  cible_id: string;
  nom_produit: string;
  categorie: string;
  prix_saisi_da: number;
  cout_estime_da: number | null;
  prix_conseille_da: number | null;
  auteur_nom: string;
  message: string;
  traite_statut: string;
  prix_final_da: number | null;
  created_at: string;
};

function mapRow(r: AlertRow): OwnerPriceAlert {
  return {
    id: r.id,
    type: r.type === "prix_trop_bas" ? "prix_trop_bas" : "nouveau_prix_employe",
    severite: r.severite === "critical" ? "critical" : r.severite === "info" ? "info" : "warning",
    cibleType: (r.cible_type as PriceAlertTargetType) || "nouveau_produit",
    cibleId: r.cible_id ?? "",
    nomProduit: r.nom_produit,
    categorie: (r.categorie as PriceAlertProductCategory) || "gateau_entier",
    prixSaisiDa: Number(r.prix_saisi_da) || 0,
    coutEstimeDa: r.cout_estime_da != null ? Number(r.cout_estime_da) : null,
    prixConseilleDa: r.prix_conseille_da != null ? Number(r.prix_conseille_da) : null,
    auteurNom: r.auteur_nom ?? "Employé",
    message: r.message,
    traiteStatut: (r.traite_statut as OwnerAlertStatus) || "en_attente",
    prixFinalDa: r.prix_final_da != null ? Number(r.prix_final_da) : null,
    createdAt: r.created_at,
  };
}

export async function loadOwnerPriceAlertsCloud(): Promise<{
  ok: boolean;
  tableAvailable: boolean;
  alerts: OwnerPriceAlert[];
}> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") {
    return { ok: false, tableAvailable: false, alerts: [] };
  }
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("notifications_patron")
      .select("id, type, severite, cible_type, cible_id, nom_produit, categorie, prix_saisi_da, cout_estime_da, prix_conseille_da, auteur_nom, message, traite_statut, prix_final_da, created_at")
      .eq("client_id", ctx.clientId)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { ok: false, tableAvailable: false, alerts: [] };
      }
      return { ok: false, tableAvailable: true, alerts: [] };
    }
    return { ok: true, tableAvailable: true, alerts: ((data ?? []) as AlertRow[]).map(mapRow) };
  } catch {
    return { ok: false, tableAvailable: false, alerts: [] };
  }
}

export async function submitEmployeePriceProposalCloud(input: {
  cibleType: PriceAlertTargetType;
  cibleId?: string;
  nomProduit: string;
  categorie: PriceAlertProductCategory;
  prixSaisiDa: number;
  coutEstimeDa?: number | null;
}): Promise<{ ok: boolean; alert?: OwnerPriceAlert | null; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, erreur: "Session requise." };

  const evaluated = evaluateEmployeePriceSubmission({
    cibleType: input.cibleType,
    cibleId: input.cibleId,
    nomProduit: input.nomProduit,
    categorie: input.categorie,
    prixSaisiDa: input.prixSaisiDa,
    coutEstimeDa: input.coutEstimeDa,
    auteurNom: ctx.nom.split(" (")[0],
    auteurRole: ctx.role,
  });

  if (!evaluated) {
    return { ok: true, alert: null };
  }
  if (ctx.mode !== "supabase") {
    return { ok: true, alert: evaluated };
  }

  try {
    const db = await createClient();
    const { data, error } = await db
      .from("notifications_patron")
      .insert({
        client_id: ctx.clientId,
        type: evaluated.type,
        severite: evaluated.severite,
        cible_type: evaluated.cibleType,
        cible_id: evaluated.cibleId,
        nom_produit: evaluated.nomProduit,
        categorie: evaluated.categorie,
        prix_saisi_da: evaluated.prixSaisiDa,
        cout_estime_da: evaluated.coutEstimeDa,
        prix_conseille_da: evaluated.prixConseilleDa,
        auteur_id: ctx.authUserId,
        auteur_nom: evaluated.auteurNom,
        message: evaluated.message,
      })
      .select("id, type, severite, cible_type, cible_id, nom_produit, categorie, prix_saisi_da, cout_estime_da, prix_conseille_da, auteur_nom, message, traite_statut, prix_final_da, created_at")
      .single();

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { ok: true, alert: evaluated };
      }
      return { ok: false, erreur: messageUtilisateur(error, "Alerte non envoyée") };
    }
    revalidatePath("/tableau-de-bord");
    return { ok: true, alert: mapRow(data as AlertRow) };
  } catch {
    return { ok: false, erreur: "Serveur inaccessible." };
  }
}

export async function resolveOwnerPriceAlertCloud(
  alertId: string,
  decision: "approuve" | "corrige" | "bloque",
  nouveauPrixDa?: number | null,
): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") return { ok: false, erreur: "Session Supabase requise." };
  if (ctx.role !== "proprietaire") return { ok: false, erreur: "Réservé au propriétaire." };

  try {
    const db = await createClient();
    const { error } = await db.rpc("traiter_alerte_prix_patron", {
      p_alerte_id: alertId,
      p_decision: decision,
      p_nouveau_prix: decision === "corrige" ? nouveauPrixDa : null,
    });
    if (error) return { ok: false, erreur: messageUtilisateur(error, "Décision refusée") };
    revalidatePath("/tableau-de-bord");
    revalidatePath("/recettes");
    revalidatePath("/caisse");
    return { ok: true };
  } catch {
    return { ok: false, erreur: "Serveur inaccessible." };
  }
}
