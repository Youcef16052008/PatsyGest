"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
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

export type JournalState = { erreur?: string; succes?: string };

async function requireWriter(): Promise<{ erreur: string } | null> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  return null;
}

async function requireAnyRole(): Promise<{ erreur: string } | null> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  return null;
}

function mapError(error: { code?: string; message: string }): string {
  return messageUtilisateur(error, "Opération refusée");
}

/** Clôture six flux produits + bilan espèces facultatif séparé (RPC saisir_cloture). */
export async function saisirCloture(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseClosingInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("saisir_cloture", {
      p_date: input.date,
      p_site_id: input.siteId,
      p_lignes: input.lignes,
      p_revise: input.revise,
      ...(input.caisseBilan ? { p_caisse_bilan: input.caisseBilan } : {}),
    });
    if (error) {
      if ((error.code === "PGRST202" || error.code === "42883") && input.caisseBilan) {
        return {
          erreur:
            "L’enregistrement du comptage tiroir d’espèces nécessite l’application de la migration SQL 21 sur Supabase.",
        };
      }
      return { erreur: mapError(error) };
    }
    const r = data as { revision?: number; lignes?: number; caisse_bilan?: boolean } | null;
    revalidatePath("/cloture");
    return {
      succes:
        `Clôture enregistrée — révision ${r?.revision}, ${input.lignes.length} produit(s)` +
        (r?.caisse_bilan ? " + bilan tiroir d’espèces enregistré séparément." : "."),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Demande explicite de réassort boutique -> labo (« Demain au labo ») — tous les rôles connectés. */
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
    if (demandesIds.length > 0) {
      await supabase.rpc("traiter_demandes_reassort", {
        p_ids: demandesIds,
        p_statut: "planifiee",
        p_of_id: ofId,
      });
    }
    revalidatePath("/planning");
    revalidatePath("/production");
    revalidatePath("/tableau-de-bord");
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

export async function addTemperature(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseTemperatureInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const ctx = await getSessionContext();
    const supabase = await createClient();
    const { error } = await supabase.from("releve_temperatures").insert({
      client_id: ctx!.clientId,
      date_releve: input.date,
      frigo_id: input.frigoId,
      frigo_nom: input.frigoNom,
      seuil_max: input.seuilMax,
      temperature: input.temperature,
      agent: input.agent,
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/qualite");
    return { succes: `Relevé enregistré — ${input.temperature} °C (seuil ${input.seuilMax} °C).` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

export async function addCleaning(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseCleaningInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const ctx = await getSessionContext();
    const supabase = await createClient();
    const { error } = await supabase.from("nettoyages").insert({
      client_id: ctx!.clientId,
      date_nettoyage: input.date,
      zone: input.zone,
      fait: input.fait,
      agent: input.agent,
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/qualite");
    return { succes: `Nettoyage enregistré — ${input.zone}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

export async function addNc(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseNcInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const ctx = await getSessionContext();
    const supabase = await createClient();
    const { error } = await supabase.from("non_conformites").insert({
      client_id: ctx!.clientId,
      date_nc: input.date,
      type: input.type,
      description: input.description,
      lot_numero: input.lotNumero ?? "",
      action: input.action ?? "",
      statut: "ouverte",
      historique: [{ at: new Date().toISOString(), statut: "ouverte", action: input.action ?? "" }],
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/qualite");
    return { succes: "Non-conformité ouverte." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Clôture/réouverture d'une NC (RPC maj_non_conformite) avec historique. */
export async function updateNc(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireWriter();
  if (denied) return denied;
  let input;
  try {
    input = parseNcUpdateInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  if (input.statut === "cloturee" && !input.action) {
    return { erreur: "Renseignez une action corrective avant de clôturer." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("maj_non_conformite", {
      p_id: input.id,
      p_statut: input.statut,
      p_action: input.action ?? "",
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/qualite");
    return { succes: input.statut === "cloturee" ? "Non-conformité clôturée (historique conservé)." : "Non-conformité rouverte." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

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

/** Édition d'un devis (RPC editer_cake, statut devis uniquement) — tous les rôles. */
export async function editerCakeReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  const id = String(formData.get("id") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "Devis invalide." };
  const clientNom = String(formData.get("clientNom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateEvent = String(formData.get("dateEvent") ?? "").trim();
  const nbParts = Number(formData.get("nbParts"));
  const prixHt = Number(formData.get("prixHt"));
  const tvaPct = Number(formData.get("tvaPct") ?? 0);
  const notes = String(formData.get("notes") ?? "").trim();
  if (clientNom.length < 1 || clientNom.length > 100) return { erreur: "Nom du client requis (100 max)." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEvent)) return { erreur: "Date d'événement invalide." };
  if (!Number.isInteger(nbParts) || nbParts < 1 || nbParts > 10000) return { erreur: "Parts :1 à10000." };
  if (!Number.isFinite(prixHt) || prixHt <= 0) return { erreur: "Prix HT invalide." };
  if (!Number.isFinite(tvaPct) || tvaPct < 0 || tvaPct > 100) return { erreur: "TVA :0 à100." };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("editer_cake", {
      p_id: id, p_client_nom: clientNom, p_telephone: telephone || null,
      p_date_event: dateEvent, p_nb_parts: nbParts, p_prix_ht: prixHt,
      p_tva_pct: tvaPct, p_notes: notes || null, p_options: null,
    });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/cake-design");
    return { succes: "Devis modifié." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Preuve d'acceptation des CGV (RPC accepter_cgv) — tous les rôles. */
export async function accepterCgvReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  const id = String(formData.get("id") ?? "").trim();
  const version = String(formData.get("version") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "Devis invalide." };
  if (version.length < 1 || version.length > 50) return { erreur: "Version des CGV requise (50 max)." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("accepter_cgv", { p_id: id, p_version: version });
    if (error) return { erreur: mapError(error) };
    revalidatePath("/cake-design");
    return { succes: `CGV acceptées (${version}) — horodatage enregistré.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Devis Cake Design (RPC creer_cake) — tous les rôles. */
export async function createCakeReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireAnyRole();
  if (denied) return denied;
  let input;
  let production;
  try {
    input = parseCakeInput(formData);
    production = parseCakeProductionInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_cake_production", {
      p_client_nom: input.clientNom,
      p_telephone: input.telephone,
      p_date_event: input.dateEvent,
      p_nb_parts: input.nbParts,
      p_prix_ht: input.prixHt,
      p_options: input.options,
      p_notes: input.notes,
      p_cgv: input.cgv,
      p_version_id: production.versionId,
      p_site_id: production.siteId,
      p_qte: production.qteFabrication,
    });
    if (error) return { erreur: mapError(error) };
    const numero = (data as { numero?: string } | null)?.numero ?? "";
    revalidatePath("/cake-design");
    return { succes: `Devis ${numero} créé (rétroplanning J-3/J-1/J généré).` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Évolution d'un devis : paiement ou transition (RPC evoluer_cake) — tous les rôles. */
export async function evolveCakeReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireAnyRole();
  if (denied) return denied;
  let input;
  try {
    input = parseCakeActionInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("evoluer_cake", {
      p_id: input.id,
      p_transition: input.transition,
      p_montant: input.montant,
    });
    if (error) return { erreur: mapError(error) };
    const r = data as { statut?: string; balance?: number } | null;
    revalidatePath("/cake-design");
    revalidatePath("/production");
    return { succes: `OK — statut ${r?.statut}${r?.balance !== undefined ? `, solde ${r.balance}` : ""}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Associe la production à un devis historique non confirmé. */
export async function assignCakeProductionReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const denied = await requireAnyRole();
  if (denied) return denied;
  const id=String(formData.get("id") ?? "");
  let production;
  try {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new Error("Devis invalide.");
    production=parseCakeProductionInput(formData);
  } catch (e) { return {erreur:e instanceof Error ? e.message : "Saisie invalide."}; }
  try {
    const supabase=await createClient();
    const {error}=await supabase.rpc("affecter_production_cake",{p_id:id,p_version_id:production.versionId,p_site_id:production.siteId,p_qte:production.qteFabrication});
    if (error) return {erreur:mapError(error)};
    revalidatePath("/cake-design");
    return {succes:"Production associée au devis."};
  } catch { return {erreur:"Supabase est inaccessible depuis ce serveur."}; }
}
