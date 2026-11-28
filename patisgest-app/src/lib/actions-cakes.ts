"use server";

/** Catalogue des gâteaux : création, édition, CGV, évolution, affectation de production. */

import { revalidatePath } from "next/cache";
import { canCreateOrEditCakeQuotes, getSessionContext } from "./auth";
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

export async function editerCakeReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canCreateOrEditCakeQuotes(ctx.role)) {
    return { erreur: "Seul le propriétaire peut modifier le prix ou les conditions d’un devis." };
  }
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
  if (!Number.isFinite(prixHt) || prixHt <= 0) return { erreur: "Prix invalide." };
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

/** Devis Cake Design (RPC creer_cake_production) — propriétaire uniquement. */

export async function createCakeReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canCreateOrEditCakeQuotes(ctx.role)) {
    return { erreur: "Seul le propriétaire peut créer un nouveau devis chiffré." };
  }
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

/** Évolution d'un devis : paiement ou transition selon rôle (RPC evoluer_cake). */

export async function evolveCakeReal(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  let input;
  try {
    input = parseCakeActionInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  if (ctx.role === "labo" && input.transition !== "produit") {
    return { erreur: "Le laboratoire peut uniquement marquer la commande produite." };
  }
  if (ctx.role === "vendeur" && !["payer", "confirme", "livre"].includes(input.transition)) {
    return { erreur: "Action réservée au propriétaire ou au laboratoire." };
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
    return { succes: `OK — statut ${r?.statut}${ctx.role !== "labo" && r?.balance !== undefined ? `, solde ${r.balance}` : ""}.` };
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
