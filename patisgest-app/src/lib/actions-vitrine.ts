"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
import { exigerAction } from "./vitrine";

export type VitrineState = {
  erreur?: string;
  succes?: string;
  reessayer?: boolean;
};

/**
 * Actions du personnel sur la vitrine.
 *
 * Chaque action commence par une garde de rôle LOCALE, puis laisse la base
 * revalider (RLS de `vitrine_photos`, trigger `cle_nom`, RPC de décision).
 * Le vendeur ne peut donc pas modifier le catalogue même s'il forge la
 * requête : il ne passera pas la policy, et ces fonctions refusent avant
 * de l'essayer.
 *
 * ⚠️ Aucune de ces actions n'est appelable par un visiteur : elles exigent
 * une session (`getSessionContext`).
 */

/**
 * Enregistre l'URL d'une photo de vitrine sur une recette.
 * Le fichier lui-même vit dans le stockage objet ; on ne stocke ici que
 * le chemin, ce qui garde la ligne légère et la sauvegarde JSON petite.
 */
export async function enregistrerPhotoVitrine(
  _prev: VitrineState,
  formData: FormData,
): Promise<VitrineState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise.", reessayer: true };

  const refus = exigerAction(ctx.role, "modifier_photos");
  if (refus) return { erreur: refus };

  const familleId = String(formData.get("familleId") ?? "").trim();
  const chemin = String(formData.get("chemin") ?? "").trim();
  const legende = String(formData.get("legende") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(familleId)) return { erreur: "Recette invalide." };
  if (!chemin) return { erreur: "Aucune photo à enregistrer." };
  if (chemin.length > 500) return { erreur: "Chemin de photo trop long." };
  if (legende.length > 120) return { erreur: "Légende trop longue (120 caractères)." };

  try {
    const supabase = await createClient();

    // `recette_familles` n'a AUCUNE policy d'écriture : un `update` direct
    // renverrait 0 ligne sans erreur. Tout passe par la RPC (migration 30),
    // qui revalide le rôle côté base.
    const { error } = await supabase.rpc("patisgest_enregistrer_fiche_vitrine", {
      p_famille_id: familleId,
      p_visible: true,
      p_nom_vitrine: null,
      p_description: null,
      p_photo: chemin,
      p_ordre: 100,
    });
    if (error) return { erreur: messageUtilisateur(error, "Vitrine"), reessayer: true };

    if (legende) {
      // Le client_id vient de la session, jamais du formulaire.
      await supabase.from("vitrine_photos").insert({
        client_id: ctx.clientId,
        famille_id: familleId,
        chemin,
        legende,
      });
    }

    revalidatePath("/etablissement");
    return { succes: "Photo de vitrine mise à jour." };
  } catch (e) {
    return {
      erreur: e instanceof Error ? e.message : "Enregistrement impossible.",
      reessayer: true,
    };
  }
}

/**
 * Publie ou dépublie une recette sur la vitrine, et règle son ordre
 * d'affichage. Réservé au propriétaire et au laboratoire.
 */
export async function reglerVitrineRecette(
  _prev: VitrineState,
  formData: FormData,
): Promise<VitrineState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise.", reessayer: true };

  const refus = exigerAction(ctx.role, "modifier_fiche");
  if (refus) return { erreur: refus };

  const familleId = String(formData.get("familleId") ?? "").trim();
  const visible = formData.get("visible") === "on";
  const nomVitrine = String(formData.get("nomVitrine") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const ordre = Number(formData.get("ordre") ?? 100);

  if (!/^[0-9a-f-]{36}$/i.test(familleId)) return { erreur: "Recette invalide." };
  if (nomVitrine.length > 80) return { erreur: "Nom vitrine trop long (80 caractères)." };
  if (description.length > 400) return { erreur: "Description trop longue (400 caractères)." };
  if (!Number.isFinite(ordre) || ordre < 0 || ordre > 9999) {
    return { erreur: "Ordre d'affichage invalide (0 à 9999)." };
  }

  try {
    const supabase = await createClient();
    // Voir `enregistrerPhotoVitrine` : écriture via RPC obligatoire.
    const { error } = await supabase.rpc("patisgest_enregistrer_fiche_vitrine", {
      p_famille_id: familleId,
      p_visible: visible,
      p_nom_vitrine: nomVitrine || null,
      p_description: description || null,
      p_photo: null,
      p_ordre: Math.trunc(ordre),
    });

    if (error) return { erreur: messageUtilisateur(error, "Vitrine"), reessayer: true };
    revalidatePath("/etablissement");
    return { succes: visible ? "Recette publiée sur la vitrine." : "Recette retirée de la vitrine." };
  } catch (e) {
    return {
      erreur: e instanceof Error ? e.message : "Enregistrement impossible.",
      reessayer: true,
    };
  }
}

/**
 * Accepte (→ devis à chiffrer) ou refuse une demande de vitrine.
 * Tous les rôles de vente peuvent le faire : c'est le geste du vendeur.
 */
export async function traiterDemandeVitrine(
  _prev: VitrineState,
  formData: FormData,
): Promise<VitrineState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise.", reessayer: true };

  const refus = exigerAction(ctx.role, "traiter_demande");
  if (refus) return { erreur: refus };

  const id = String(formData.get("id") ?? "").trim();
  const decision = String(formData.get("decision") ?? "").trim();

  if (!/^[0-9a-f-]{36}$/i.test(id)) return { erreur: "Demande invalide." };
  if (decision !== "accepter" && decision !== "refuser") {
    return { erreur: "Décision invalide." };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("patisgest_traiter_demande", {
      p_id: id,
      p_decision: decision,
    });
    if (error) return { erreur: messageUtilisateur(error, "Vitrine"), reessayer: true };
    revalidatePath("/cake-design");
    return {
      succes:
        decision === "accepter"
          ? "Demande acceptée : elle devient un devis à chiffrer."
          : "Demande refusée.",
    };
  } catch (e) {
    return {
      erreur: e instanceof Error ? e.message : "Traitement impossible.",
      reessayer: true,
    };
  }
}

/**
 * Supprime une recette du catalogue. Réservé au propriétaire (règle
 * métier explicite) ; la base refuse une recette qui porte déjà des
 * versions, car elle est le support de traçabilité des lots.
 */
export async function supprimerRecetteVitrine(
  _prev: VitrineState,
  formData: FormData,
): Promise<VitrineState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise.", reessayer: true };

  const refus = exigerAction(ctx.role, "supprimer_recette");
  if (refus) return { erreur: refus };

  const familleId = String(formData.get("familleId") ?? "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(familleId)) return { erreur: "Recette invalide." };

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("patisgest_supprimer_recette", {
      p_famille_id: familleId,
    });
    if (error) return { erreur: messageUtilisateur(error, "Suppression"), reessayer: true };
    revalidatePath("/recettes");
    revalidatePath("/etablissement");
    return { succes: "Recette supprimée." };
  } catch (e) {
    return {
      erreur: e instanceof Error ? e.message : "Suppression impossible.",
      reessayer: true,
    };
  }
}
