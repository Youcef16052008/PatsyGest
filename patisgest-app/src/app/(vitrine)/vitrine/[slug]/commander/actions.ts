"use server";

import { headers } from "next/headers";
import { messageUtilisateur } from "@/lib/erreurs-db";
import { createClient } from "@/lib/supabase/server";
import { dateCommandeVitrineValide } from "@/lib/workspace-data";
import { productionSansSecretAntiAbus, sourceVisiteur } from "@/lib/vitrine-anti-abus";

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
  // H09-09 : la forme AAAA-MM-JJ ne suffit pas (2026-02-30 ni une date
  // passée ne sont pas des dates). On applique ici les mêmes bornes calendrier
  // que le RPC 27, avec le jour métier d'Alger, avant tout appel réseau.
  if (!dateCommandeVitrineValide(dateEvent)) {
    return { erreur: "Choisissez une date valide, aujourd’hui ou dans l’année à venir." };
  }
  if (!Number.isInteger(parts) || parts < 1 || parts > 10000) {
    return { erreur: "Indiquez un nombre de parts entre 1 et 10000." };
  }
  if (note.length > 500) return { erreur: "Précisions trop longues (500 caractères)." };
  if (cleNavigateur.length < 8 || cleNavigateur.length > 64) {
    return { erreur: "Référence de demande invalide. Rechargez la page." };
  }

  const secretAntiAbus = process.env.VITRINE_SECRET_ANTI_ABUS;
  // H04-01 : en production, l'absence de secret désactiverait le plafond par
  // source sans que l'utilisateur le sache. On refuse alors la commande plutôt
  // que de replier silencieusement sur le seul plafond global.
  if (productionSansSecretAntiAbus(secretAntiAbus)) {
    return {
      erreur:
        "Envoi impossible pour le moment. Réessayez dans un instant ou appelez la boutique.",
    };
  }

  try {
    const supabase = await createClient();
    // B-008 : plafond par source (migration 38). Hors production, un secret
    // absent laisse encore le plafond global seul ; en production c'est refusé
    // plus haut. Une vérification absente ou en erreur n'est JAMAIS ignorée :
    // H04-03 transformait une migration 38 manquante en contournement.
    const source = sourceVisiteur(await headers(), secretAntiAbus);
    if (source) {
      const verif = await supabase.rpc("patisgest_verifier_source_vitrine", {
        p_sous_domaine: sousDomaine,
        p_source: source,
      });
      if (verif.error) {
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
