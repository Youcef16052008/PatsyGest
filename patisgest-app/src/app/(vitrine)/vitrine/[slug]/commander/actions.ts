"use server";

import { headers } from "next/headers";
import { messageUtilisateur } from "@/lib/erreurs-db";
import { createClient } from "@/lib/supabase/server";
import { CODES_FONCTION_ABSENTE, sourceVisiteur } from "@/lib/vitrine-anti-abus";

export type CommandeState = {
  erreur?: string;
  succes?: string;
  numero?: string;
  /** Vrai quand la demande existait déjà (double clic, reprise réseau). */
  dejaEnregistree?: boolean;
};

/**
 * Dépôt d'une demande de commande par un VISITEUR ANONYME.
 *
 * Cette action est la seule du projet qui n'exige pas de session : c'est
 * pour cela qu'elle ne manipule aucun identifiant interne. Elle relaie
 * vers `patisgest_demander_commande` (migration 27), qui :
 *   • choisit elle-même l'établissement à partir du sous-domaine ;
 *   • vérifie que la recette est réellement publiée sur CETTE vitrine ;
 *   • refuse un prix transmis par le client (il n'y a pas de paramètre) ;
 *   • renvoie la demande existante si la clé navigateur a déjà servi.
 *
 * Aucun message d'erreur technique ne doit remonter au visiteur.
 */
export async function demanderCommande(
  _prev: CommandeState,
  formData: FormData,
): Promise<CommandeState> {
  const sousDomaine = String(formData.get("sousDomaine") ?? "").trim().toLowerCase();
  const cleRecette = String(formData.get("cleRecette") ?? "").trim();
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const dateEvent = String(formData.get("dateEvent") ?? "").trim();
  const parts = Number(formData.get("nbParts") ?? 0);
  const note = String(formData.get("note") ?? "").trim();
  const cleNavigateur = String(formData.get("cleNavigateur") ?? "").trim();

  // Validation locale : évite un aller-retour réseau pour une faute de frappe.
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(sousDomaine)) {
    return { erreur: "Cette boutique est introuvable." };
  }
  if (!cleRecette) return { erreur: "Choisissez une pâtisserie." };
  if (nom.length < 2 || nom.length > 100) {
    return { erreur: "Indiquez votre nom (2 à 100 caractères)." };
  }
  if (telephone.replace(/\D/g, "").length < 6 || telephone.length > 40) {
    return { erreur: "Indiquez un numéro de téléphone où vous joindre." };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateEvent)) {
    return { erreur: "Choisissez une date pour votre commande." };
  }
  if (!Number.isInteger(parts) || parts < 1 || parts > 10000) {
    return { erreur: "Indiquez un nombre de parts entre 1 et 10000." };
  }
  if (note.length > 500) return { erreur: "Précisions trop longues (500 caractères)." };
  if (cleNavigateur.length < 8 || cleNavigateur.length > 64) {
    return { erreur: "Référence de demande invalide. Rechargez la page." };
  }

  try {
    const supabase = await createClient();
    // B-008 : plafond par source (migration 38). Sans secret, ou avant 38, seul le plafond global s'applique.
    const source = sourceVisiteur(await headers(), process.env.VITRINE_SECRET_ANTI_ABUS);
    if (source) {
      const verif = await supabase.rpc("patisgest_verifier_source_vitrine", {
        p_sous_domaine: sousDomaine,
        p_source: source,
      });
      if (verif.error && !(CODES_FONCTION_ABSENTE as readonly string[]).includes(verif.error.code ?? "")) {
        return { erreur: messageUtilisateur(verif.error, "Commande impossible") };
      }
    }
    const { data, error } = await supabase.rpc("patisgest_demander_commande", {
      p_sous_domaine: sousDomaine,
      p_cle_recette: cleRecette,
      p_client_nom: nom,
      p_telephone: telephone,
      p_date_event: dateEvent,
      p_nb_parts: parts,
      p_note: note || null,
      p_cle_navigateur: cleNavigateur,
    });

    if (error) {
      // Les refus métier (recette non publiée, date passée, anti-flood) sont
      // écrits pour être lus par un client : on les relaie tels quels.
      return { erreur: messageUtilisateur(error, "Commande impossible") };
    }

    const r = (data ?? {}) as { numero?: string; deja_enregistree?: boolean };
    return {
      numero: r.numero,
      dejaEnregistree: r.deja_enregistree === true,
      succes:
        r.deja_enregistree === true
          ? `Votre demande ${r.numero ?? ""} était déjà enregistrée : nous l'avons bien reçue.`
          : `Demande ${r.numero ?? ""} envoyée. La boutique vous rappelle pour confirmer le prix et la date.`,
    };
  } catch {
    return {
      erreur:
        "Envoi impossible pour le moment. Réessayez dans un instant ou appelez la boutique.",
    };
  }
}
