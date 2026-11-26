"use server";

/** Planning et réassort : tâches, demandes « Demain au labo ». */

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
import { estProprietaireSeul } from "./permissions";
import {
  parseCakeActionInput,
  parseCakeInput,
  parseCakeProductionInput,
  parseCleaningInput,
  parseClosingInput,
  parseNcInput,
  parseNcUpdateInput,
  parseRestockRequestInput,
  parseTaskInput,
  parseTaskToggleInput,
  parseTemperatureInput,
} from "./journal-input";
import { type JournalState, requireWriter, requireAnyRole, mapError } from "./journal-actions-communs";

export async function addTask(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseTaskInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const ctx = await getSessionContext();
    const supabase = await createClient();
    const { error } = await supabase.from("taches_planning").insert({
      client_id: ctx!.clientId,
      date_tache: input.date,
      tache: input.tache,
      of_numero: input.ofNumero ?? "",
      duree_min: input.dureeMin,
      responsable: input.responsable ?? "",
      fait: false,
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/planning");
    return { succes: `Tâche ajoutée — ${input.tache}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Bascule d'une tâche (UPDATE politique tenant + rôle). */

export async function toggleTask(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseTaskToggleInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("taches_planning").update({ fait: input.fait }).eq("id", input.id);
    if (error) return { erreur: mapError(error) };
    revalidatePath("/planning");
    return { succes: input.fait ? "Tâche marquée faite." : "Tâche remise à faire." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Édition d'un devis (RPC editer_cake, statut devis uniquement) — propriétaire uniquement. */

export async function createRestockRequestReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireAnyRole();
  if (denied) return denied;
  let input;
  try {
    input = parseRestockRequestInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const ctx = await getSessionContext();
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_demande_reassort", {
      p_site_id: input.siteId,
      p_article_id: input.articleId,
      p_date_cible: input.dateCible,
      p_qte: input.qte,
      p_motif: input.motif,
      p_demandeur: input.demandeur || ctx?.nom || ctx?.role || "",
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return { erreur: "Les demandes de réassort nécessitent l’application de la migration SQL 21 sur Supabase." };
      }
      return { erreur: mapError(error) };
    }
    const r = data as { produit?: string; qte?: number; date_cible?: string } | null;
    revalidatePath("/planning");
    revalidatePath("/production");
    return { succes: `Demande transmise au labo : ${r?.produit ?? "produit"} × ${r?.qte ?? input.qte} pour le ${r?.date_cible ?? input.dateCible}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Validation chef d'une ligne « Demain au labo » : crée l'OF idempotent et marque les demandes liées. */

export async function validateTomorrowLineReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  const versionId = String(formData.get("versionId") ?? "").trim();
  const siteId = String(formData.get("siteId") ?? "").trim();
  const datePrevue = String(formData.get("datePrevue") ?? "").trim();
  const qte = Number(formData.get("qtePrevue"));
  const clientRefRaw = String(formData.get("clientRef") ?? "").trim();
  const clientRef = /^[\w-]{1,64}$/.test(clientRefRaw) ? clientRefRaw : null;
  const demandesRaw = String(formData.get("demandesIds") ?? "").trim();
  const demandesIds = demandesRaw
    ? demandesRaw.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    : [];

  if (!/^[0-9a-f-]{36}$/i.test(versionId) || !/^[0-9a-f-]{36}$/i.test(siteId)) {
    return { erreur: "Recette ou laboratoire invalide." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePrevue)) return { erreur: "Date prévue invalide." };
  if (!Number.isFinite(qte) || qte <= 0 || qte > 100_000_000) return { erreur: "Quantité à préparer invalide." };
  if (!clientRef) return { erreur: "Référence de validation invalide : actualisez le plan avant de réessayer." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_of", {
      p_version_id: versionId,
      p_site_id: siteId,
      p_qte_prevue: Math.round(qte * 10_000) / 10_000,
      p_date_prevue: datePrevue,
      p_client_ref: clientRef,
    });
    if (error) return { erreur: mapError(error) };
    const r = data as { of_id?: string; id?: string; numero?: string; duplicate?: boolean } | null;
    const ofId = r?.of_id ?? r?.id ?? null;
    let demandesNonMisesAJour = false;
    if (demandesIds.length > 0) {
      if (!ofId) demandesNonMisesAJour = true;
      else {
        try {
        const suivi = await supabase.rpc("traiter_demandes_reassort", {
          p_ids: demandesIds,
          p_statut: "planifiee",
          p_of_id: ofId,
        });
        demandesNonMisesAJour = Boolean(suivi.error);
        } catch { demandesNonMisesAJour = true; }
      }
    }
    revalidatePath("/planning");
    revalidatePath("/production");
    revalidatePath("/tableau-de-bord");
    if (demandesNonMisesAJour) return { erreur: `OF ${r?.numero ?? ""} créé ou déjà existant, mais les demandes ne sont pas mises à jour. Vérifiez leur suivi avant toute nouvelle action.` };
    if (r?.duplicate) {
      return { succes: `OF ${r.numero ?? ""} déjà créé pour cette ligne (aucun doublon).` };
    }
    return { succes: `OF ${r?.numero ?? ""} validé pour le ${datePrevue} (${qte} prévus, besoins figés).` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Annule une demande de réassort ouverte (chef / propriétaire). */

export async function cancelRestockRequestReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  const id = String(formData.get("id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "Demande invalide." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("traiter_demandes_reassort", {
      p_ids: [id],
      p_statut: "annulee",
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/planning");
    revalidatePath("/production");
    return { succes: "Demande de réassort annulée." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
