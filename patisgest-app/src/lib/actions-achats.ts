"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { parseCommandeInput, parseReceptionLinesInput } from "./purchase-input";

export type AchatsState = { erreur?: string; succes?: string };

function mapError(error: { code?: string; message: string }): string {
  if (error.code === "P0001") return error.message;
  if (error.code === "42501") return "Votre rôle n'autorise pas cette opération.";
  return `Opération refusée : ${error.message}`;
}

/** Bon de commande multi-lignes (RPC creer_commande) — propriétaire/labo. */
export async function createCommandeReal(_prev: AchatsState, formData: FormData): Promise<AchatsState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  let input;
  try {
    input = parseCommandeInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("creer_commande", {
      p_fournisseur_id: input.fournisseurId,
      p_lignes: input.lignes,
      p_notes: input.notes,
    });
    if (error) return { erreur: mapError(error) };
    const r = data as { numero?: string; lignes?: number } | null;
    revalidatePath("/achats");
    return { succes: `BC ${r?.numero} créé — ${r?.lignes} ligne(s).` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Réception partielle/totale multi-lignes (RPC recevoir_commande) — propriétaire/labo. */
export async function receiveCommandeReal(_prev: AchatsState, formData: FormData): Promise<AchatsState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  let input;
  try {
    input = parseReceptionLinesInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("recevoir_commande", {
      p_commande_id: input.commandeId,
      p_site_id: input.siteId,
      p_receptions: input.receptions,
    });
    if (error) return { erreur: mapError(error) };
    const r = data as { numero?: string; statut?: string; lots?: number } | null;
    revalidatePath("/achats");
    revalidatePath("/stocks");
    return { succes: `Réception ${r?.numero} — ${r?.lots} lot(s), statut ${r?.statut}.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
