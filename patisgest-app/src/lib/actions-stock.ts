"use server";

import { revalidatePath } from "next/cache";
import { canManagePrices, canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { evaluateEmployeePriceSubmission } from "./owner-price-guard";
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

  const isOwner = canManagePrices(ctx.role);
  const suggestedTtc = Number(formData.get("prix_ttc") ?? 0);
  let insertedId: string | null = null;
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("articles")
      .insert({
        client_id: ctx.clientId,
        code: input.code,
        nom: input.nom,
        niveau: input.niveau,
        unite: input.unite,
        seuil: input.seuil,
        pv_ht: isOwner ? input.pv_ht : 0,
        tva: isOwner ? input.tva : 0,
        allergenes: input.allergenes,
        traces: input.traces,
      })
      .select("id")
      .single();
    if (error) return { erreur: message(error) };
    insertedId = (data as { id?: string } | null)?.id ?? null;

    if (!isOwner && Number.isFinite(suggestedTtc) && suggestedTtc > 0 && insertedId) {
      const alert = evaluateEmployeePriceSubmission({
        cibleType: "article",
        cibleId: insertedId,
        nomProduit: input.nom,
        categorie: input.niveau === "produit" ? "gateau_entier" : "autre",
        prixSaisiDa: Math.round(suggestedTtc * 100) / 100,
        coutEstimeDa: null,
        auteurNom: ctx.nom.split(" (")[0],
        auteurRole: ctx.role,
      });
      if (alert) {
        await supabase.from("notifications_patron").insert({
          client_id: ctx.clientId,
          type: alert.type,
          severite: alert.severite,
          cible_type: "article",
          cible_id: insertedId,
          nom_produit: alert.nomProduit,
          categorie: alert.categorie,
          prix_saisi_da: alert.prixSaisiDa,
          cout_estime_da: alert.coutEstimeDa,
          prix_conseille_da: alert.prixConseilleDa,
          auteur_id: ctx.authUserId,
          auteur_nom: alert.auteurNom,
          message: alert.message,
        });
      }
    }
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }

  revalidatePath("/stocks");
  revalidatePath("/tableau-de-bord");
  if (!isOwner && Number.isFinite(suggestedTtc) && suggestedTtc > 0) {
    return {
      succes: `Article « ${input.nom} » créé (prix suggéré ${Math.round(suggestedTtc)} DA envoyé au propriétaire — non vendable en caisse avant validation).`,
    };
  }
  return { succes: `Article « ${input.nom} » créé${!isOwner ? " (sans prix tant que le propriétaire ne l’a pas validé)" : ""}.` };
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
 *
 * B-007 : le formulaire fournit une `clientRef`. Si elle est présente, on
 * appelle `transferer_article_ref` (migration 37), qui rejoue le transfert en
 * cas de double envoi. Repli sur `transferer_article` (6 paramètres) si la RPC
 * n'est pas encore installée sur la base.
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

  const responsableRaw = String(formData.get("responsable") ?? "").trim();
  if (responsableRaw.length > 80) {
    return { erreur: "Responsable : 80 caractères maximum." };
  }
  const demandesRaw = String(formData.get("demandesIds") ?? "").trim();
  const demandesIds = demandesRaw
    ? demandesRaw.split(",").map((s) => s.trim()).filter((s) => /^[0-9a-f-]{36}$/i.test(s))
    : [];
  const clientRef = String(formData.get("clientRef") ?? "").trim();
  if (clientRef.length > 64) {
    return { erreur: "Référence de transfert trop longue (64 caractères maximum)." };
  }

  try {
    const supabase = await createClient();
    const params = {
      p_article_id: input.articleId,
      p_from_site_id: input.fromSiteId,
      p_to_site_id: input.toSiteId,
      p_qte: input.qte,
      p_motif: input.motif,
      ...(responsableRaw ? { p_responsable: responsableRaw } : {}),
    };
    let rpcRes = clientRef
      ? await supabase.rpc("transferer_article_ref", { ...params, p_client_ref: clientRef })
      : await supabase.rpc("transferer_article", params);
    // Repli : la RPC idempotente (migration 37) pas encore installée sur cette base.
    if (rpcRes.error && (rpcRes.error.code === "PGRST202" || rpcRes.error.code === "42883")) {
      rpcRes = await supabase.rpc("transferer_article", params);
    }
    // Repli historique : schéma ancien sans paramètre `responsable`.
    if (rpcRes.error && (rpcRes.error.code === "PGRST202" || rpcRes.error.code === "42883") && responsableRaw) {
      rpcRes = await supabase.rpc("transferer_article", {
        p_article_id: input.articleId,
        p_from_site_id: input.fromSiteId,
        p_to_site_id: input.toSiteId,
        p_qte: input.qte,
        p_motif: [input.motif, `Resp. ${responsableRaw}`].filter(Boolean).join(" · ").slice(0, 120),
      });
    }
    const { data, error } = rpcRes;
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42501") return { erreur: "Votre rôle n'autorise pas ce transfert." };
      return { erreur: messageUtilisateur(error, "Transfert refusé") };
    }
    const r = data as { transfert_id?: string; ref?: string; lots?: number } | null;
    let demandesNonMisesAJour = false;
    if (demandesIds.length > 0) {
      if (!r?.transfert_id) demandesNonMisesAJour = true;
      else {
        try {
        const suivi = await supabase.rpc("traiter_demandes_reassort", {
          p_ids: demandesIds,
          p_statut: "transferee",
          p_transfert_id: r.transfert_id,
        });
        demandesNonMisesAJour = Boolean(suivi.error);
        } catch { demandesNonMisesAJour = true; }
      }
    }
    revalidatePath("/transferts");
    revalidatePath("/planning");
    revalidatePath("/production");
    revalidatePath("/stocks");
    if (demandesNonMisesAJour) return { erreur: `Transfert ${r?.ref ?? ""} effectué, mais demandes non mises à jour. Ne recommencez pas le transfert ; vérifiez le suivi.` };
    return {
      succes:
        `Transfert enregistré (${r?.ref}) — ${r?.lots ?? 0} lot(s) éligible(s) déplacé(s) en FEFO` +
        (responsableRaw ? ` · responsable : ${responsableRaw}.` : "."),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
