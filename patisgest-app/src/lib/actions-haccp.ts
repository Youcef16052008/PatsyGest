"use server";

/** Traçabilité HACCP : températures, nettoyage, non-conformités. */

import { revalidatePath } from "next/cache";
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
import { type JournalState, requireWriterContexte, mapError } from "./journal-actions-communs";

export async function addTemperature(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const { ctx, denied } = await requireWriterContexte();
  if (denied) return denied;
  let input;
  try {
    input = parseTemperatureInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("releve_temperatures").insert({
      client_id: ctx.clientId,
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
  const { ctx, denied } = await requireWriterContexte();
  if (denied) return denied;
  let input;
  try {
    input = parseCleaningInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("nettoyages").insert({
      client_id: ctx.clientId,
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
  const { ctx, denied } = await requireWriterContexte();
  if (denied) return denied;
  let input;
  try {
    input = parseNcInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("non_conformites").insert({
      client_id: ctx.clientId,
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
  const { denied } = await requireWriterContexte();
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
