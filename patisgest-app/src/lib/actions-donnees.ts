"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";

/**
 * Loi 18-07 — actions serveur du droit d'accès et d'effacement.
 *
 * Les mentions légales promettent « un export et une suppression sur demande
 * sont possibles ». Sans ces actions, la promesse n'était adossée à rien.
 *
 * Le serveur refait tous les contrôles : le propriétaire peut être le seul à
 * exporter ou anonymiser, et la RPC le vérifie de son côté (`patisgest_mon_role`
 * + test dédié). Défense en profondeur, pas confiance dans l'interface.
 */

export type DonneesState = {
  erreur?: string;
  succes?: string;
  export?: unknown;
  reference?: string;
};

export type AnonymisationResult = {
  demande_id: string;
  reference: string;
  lignes_affectees: number;
  commandes_conservees: number;
  ventes_conservees: number;
};

export async function exporterDonnees(
  _prev: DonneesState,
  _formData: FormData,
): Promise<DonneesState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session expirée. Reconnectez-vous." };
  if (ctx.role !== "proprietaire") {
    return { erreur: "L’export des données personnelles est réservé au propriétaire." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("exporter_donnees_personnelles");
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { erreur: "Migration 42 non appliquée : l’export n’est pas encore disponible sur cette base." };
      }
      return { erreur: messageUtilisateur(error, "Export impossible") };
    }
    return {
      succes:
        "Export généré. Il contient les noms et téléphones de vos clients, rien d’autre. " +
        "Conservez-le comme une donnée personnelle : c’est exactement ce qu’il contient.",
      export: data,
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

export async function anonymiserCommande(
  _prev: DonneesState,
  formData: FormData,
): Promise<DonneesState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session expirée. Reconnectez-vous." };
  if (ctx.role !== "proprietaire") {
    return { erreur: "L’anonymisation est réservée au propriétaire." };
  }

  const numero = String(formData.get("numero") ?? "").trim();
  const motif = String(formData.get("motif") ?? "").trim();
  const reference = String(formData.get("reference") ?? "").trim();

  if (!numero) return { erreur: "Indiquez le numéro de la commande concernée." };
  if (motif.length < 3) return { erreur: "Indiquez le motif de la demande (au moins 3 caractères)." };
  if (reference.length < 3) return { erreur: "Indiquez une référence de demande (au moins 3 caractères)." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("anonymiser_client", {
      p_numero_commande: numero,
      p_motif: motif,
      p_reference: reference,
    });
    if (error) {
      if (error.code === "P0001") return { erreur: error.message };
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { erreur: "Migration 42 non appliquée : l’anonymisation n’est pas encore disponible sur cette base." };
      }
      return { erreur: messageUtilisateur(error, "Anonymisation impossible") };
    }
    const r = data as AnonymisationResult | null;
    if (!r?.demande_id) return { erreur: "Anonymisation non confirmée. Vérifiez avant de recommencer." };

    revalidatePath("/parametres");
    revalidatePath("/cake-design");
    return {
      succes:
        `Commande ${numero} anonymisée sous la référence ${r.reference}. ` +
        `${r.lignes_affectees} ligne(s) modifiée(s). ` +
        `${r.ventes_conservees} vente(s) et ${r.commandes_conservees} commande(s) conservées : ` +
        "les écritures comptables ne s’effacent pas, seule l’identité disparaît.",
      reference: r.reference,
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
