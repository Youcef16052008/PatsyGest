/**
 * Règles de rôle de la VITRINE — module pur, sans Next ni Supabase.
 *
 * Elles sont volontairement différentes de `permissions.ts` : sur la
 * vitrine, le vendeur ne rédige pas le catalogue, il traite des demandes.
 * Les encoder ici (et pas seulement dans l'UI) permet de les tester et
 * d'empêcher qu'un écran les « simplifie ».
 *
 * Règles métier demandées, mot pour mot :
 *   • « les photos : seul le labo ou le propriétaire peut les changer » ;
 *   • « seul le propriétaire peut ajouter ou supprimer des recettes » ;
 *   • « les vendeurs peuvent seulement accepter ou confirmer les commandes »
 *     (aucune édition, aucune suppression).
 *
 * Le laboratoire voit et corrige les fiches recettes, mais ne décide pas
 * de la gamme : ajouter un gâteau au catalogue engage le commerce.
 */

import type { Role } from "./permissions";

export type { Role };

/** Actions possibles sur une vitrine. */
export type ActionVitrine =
  | "voir_catalogue"
  | "modifier_photos"
  | "ajouter_recette"
  | "supprimer_recette"
  | "modifier_fiche"
  | "publier_vitrine"
  | "traiter_demande";

const PERMISSIONS: Record<ActionVitrine, readonly Role[]> = {
  // Tout le personnel voit la vitrine, y compris le vendeur : c'est lui qui
  // répond au téléphone quand un client pose une question sur un gâteau.
  voir_catalogue: ["proprietaire", "labo", "vendeur"],

  // Photos : propriétaire + laboratoire.
  modifier_photos: ["proprietaire", "labo"],

  // Ajout / suppression de recette : propriétaire SEUL.
  ajouter_recette: ["proprietaire"],
  supprimer_recette: ["proprietaire"],

  // Nom affiché, description, ordre, prix vitrine : le labo corrige la fiche.
  modifier_fiche: ["proprietaire", "labo"],

  // Mettre le site en ligne / hors ligne engage l'établissement.
  publier_vitrine: ["proprietaire"],

  // Accepter ou refuser une demande de commande : tous les rôles de vente.
  traiter_demande: ["proprietaire", "labo", "vendeur"],
};

export function peutVitrine(role: Role, action: ActionVitrine): boolean {
  return PERMISSIONS[action].includes(role);
}

/**
 * Le vendeur peut-il modifier une fiche de la vitrine (nom, description,
 * ordre) ? Non — il traite les commandes, il n'écrit pas le catalogue.
 * Fonction séparée pour que l'UI ne confonde pas « voir » et « éditer ».
 */
export function peutEditerCatalogue(role: Role): boolean {
  return peutVitrine(role, "modifier_fiche");
}

/** Le vendeur a-t-il le droit d'accepter/refuser une demande ? */
export function peutTraiterDemande(role: Role): boolean {
  return peutVitrine(role, "traiter_demande");
}

/**
 * Étiquettes des actions, pour l'interface. Le libellé « accepter » est
 * celui du métier : il transforme une demande en devis à chiffrer, sans
 * inventer de prix.
 */
export const LIBELLES_ACTION: Record<ActionVitrine, string> = {
  voir_catalogue: "Voir la vitrine",
  modifier_photos: "Changer les photos",
  ajouter_recette: "Ajouter une recette",
  supprimer_recette: "Supprimer une recette",
  modifier_fiche: "Modifier la fiche",
  publier_vitrine: "Publier / dépublier la vitrine",
  traiter_demande: "Accepter ou refuser une demande",
};
