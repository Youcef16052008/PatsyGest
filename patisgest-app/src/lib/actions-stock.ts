"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
import { parseArticleInput, parseReceptionInput, parseTransferInput } from "./stock-input";

export type StockState = { erreur?: string; succes?: string };

function message(error: { code?: string | null; message: string }): string {
  if (error.code === "23505") return "Ce code article existe déjà pour votre pâtisserie.";
  if (error.code === "42501") return "Votre rôle n'autorise pas cette écriture.";
  if (error.code === "23514") return "Quantité invalide : le stock ne peut pas être négatif.";
  return messageUtilisateur(error, "Enregistrement refusé");
}

/** Création d'un article — session réelle exigée, rôle propriétaire ou labo, RLS côté serveur. */
export async function createArticle(_prev: StockState, formData: FormData): Promise<StockState> {
  const ctx = await getSessionContext();
  if (!ctx || !canWrite(ctx.role)) return { erreur: "Accès refusé : rôle propriétaire ou laboratoire requis." };

  let input;
  try {
    input = parseArticleInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("articles").insert({
      client_id: ctx.clientId,
      code: input.code,
      nom: input.nom,
      niveau: input.niveau,
      unite: input.unite,
      seuil: input.seuil,
      pv_ht: input.pv_ht,
      tva: input.tva,
      allergenes: input.allergenes,
      traces: input.traces,
    });
    if (error) return { erreur: message(error) };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }

  revalidatePath("/stocks");
  return { succes: `Article « ${input.nom} » créé.` };
}

/** Réception de lot atomique (lot + mouvement) via la fonction RPC de la base. */
export async function receiveLot(_prev: StockState, formData: FormData): Promise<StockState> {
  const ctx = await getSessionContext();
  if (!ctx || !canWrite(ctx.role)) return { erreur: "Accès refusé : rôle propriétaire ou laboratoire requis." };

  let input;
  try {
    input = parseReceptionInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("receptionner_lot", {
      p_article_id: input.articleId,
      p_site_id: input.siteId,
      p_numero: input.numero,
      p_qte: input.qte,
      p_pu: input.pu,
      p_dlc: input.dlc,
      p_fournisseur_id: input.fournisseurId,
      p_ref: input.ref,
    });
    if (error) return { erreur: message(error) };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }

  revalidatePath("/stocks");
  return { succes: `Lot ${input.numero} réceptionné (${input.qte}).` };
}

export type TransferState = { erreur?: string; succes?: string };

/**
 * Transfert de stock réel : FEFO au départ, lots miroirs à l'arrivée
 * (meme numero, DLC, PU), deux mouvements — tout dans une transaction
 * SQL (RPC transferer_article). Le stock insuffisant est refusé.
 */
export async function transferReal(_prev: TransferState, formData: FormData): Promise<TransferState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };

  let input;
  try {
    input = parseTransferInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("transferer_article", {
      p_article_id: input.articleId,
      p_from_site_id: input.fromSiteId,
      p_to_site_id: input.toSiteId,
      p_qte: input.qte,
      p_motif: input.motif,
    });
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42501") return { erreur: "Votre rôle n'autorise pas ce transfert." };
      return { erreur: messageUtilisateur(error, "Transfert refusé") };
    }
    const r = data as { ref?: string; lots?: number } | null;
    revalidatePath("/transferts");
    revalidatePath("/stocks");
    return { succes: `Transfert enregistré (${r?.ref}) — ${r?.lots ?? 0} lot(s) déplacé(s) en FEFO.` };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
