"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import {
  parseCakeActionInput,
  parseCakeInput,
  parseCleaningInput,
  parseClosingInput,
  parseNcInput,
  parseNcUpdateInput,
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
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "Votre rôle n'autorise pas cette opération.";
  if (error.code === "23505") return "Conflit de révision — réessayez.";
  return `Opération refusée : ${error.message}`;
}

/** Clôture six flux (RPC saisir_cloture) : révision gérée côté serveur. */
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
    });
    if (error) return { erreur: mapError(error) };
    const r = data as { revision?: number; lignes?: number } | null;
    revalidatePath("/cloture");
    return { succes: `Clôture enregistrée — révision ${r?.revision}, ${r?.lignes} produit(s).` };
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
  try {
    input = parseCakeInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_cake", {
      p_client_nom: input.clientNom,
      p_telephone: input.telephone,
      p_date_event: input.dateEvent,
      p_nb_parts: input.nbParts,
      p_prix_ht: input.prixHt,
      p_options: input.options,
      p_notes: input.notes,
      p_cgv: input.cgv,
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
    return { succes: `OK — statut ${r?.statut}${r?.balance !== undefined ? `, solde ${r.balance}` : ""}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
