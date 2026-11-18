"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { messageUtilisateur } from "./erreurs-db";
import { lireFichierSauvegarde, resumeSauvegarde } from "./sauvegarde";

export type RestaurationState = {
  erreur?: string;
  succes?: string;
  /** Le fichier a été validé : on demande une confirmation explicite. */
  analyse?: { table: string; lignes: number }[];
  total?: number;
  /** Nombre de lignes réellement insérées, par table. */
  insere?: { table: string; lignes: number }[];
};

/**
 * US-15.2 — restauration d'une sauvegarde JSON.
 *
 * Deux temps, volontairement : `analyser` valide et montre ce qui va être
 * écrit ; `confirmer` écrit. Une restauration qui écrase des données sans
 * confirmation explicite serait dangereuse.
 *
 * Mode de restauration : **ajout** (`insert`). On n'efface jamais l'existant :
 * le cahier impose « alerte, jamais blocage », et une suppression en masse sur
 * une erreur de manipulation serait irréversible. Les doublons de clé
 * primaire sont comptés et signalés, pas fatals.
 */
export async function analyserSauvegarde(_prev: RestaurationState, formData: FormData): Promise<RestaurationState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (ctx.role !== "proprietaire") return { erreur: "Restauration réservée au propriétaire." };

  const lecture = await lireFichierSauvegarde(formData.get("fichier"), ctx.clientId);
  if ("erreur" in lecture) return lecture;
  const { dump } = lecture;

  const analyse = resumeSauvegarde(dump);
  return {
    analyse,
    total: analyse.reduce((n, a) => n + a.lignes, 0),
    succes: "Fichier valide. Vérifiez le contenu puis confirmez la restauration.",
  };
}

/**
 * Écriture réelle. Le fichier est renvoyé par le formulaire (le dump validé
 * n'est pas gardé en mémoire du serveur entre deux actions).
 */
export async function confirmerRestauration(_prev: RestaurationState, formData: FormData): Promise<RestaurationState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (ctx.role !== "proprietaire") return { erreur: "Restauration réservée au propriétaire." };
  if (String(formData.get("confirmation") ?? "").trim().toUpperCase() !== "RESTAURER") {
    return { erreur: "Tapez RESTAURER pour confirmer." };
  }

  const lecture = await lireFichierSauvegarde(formData.get("fichier"), ctx.clientId);
  if ("erreur" in lecture) return lecture;
  const { dump } = lecture;

  try {
    const supabase = await createClient();
    // Pourquoi une RPC et pas des INSERT depuis le client : 11 des 21 tables
    // (ventes, clotures, recette_versions, ordres_fabrication…) n'ont AUCUNE
    // policy INSERT — elles s'écrivent par des RPC SECURITY DEFINER. Un
    // INSERT direct échouerait au milieu de la restauration et laisserait la
    // base à moitié restaurée en annonçant un succès partiel. La fonction
    // public.restaurer_sauvegarde (migration 18) fait tout dans une seule
    // transaction, vérifie le rôle et refuse tout client_id étranger.
    const { data, error } = await supabase.rpc("restaurer_sauvegarde", { p_dump: dump });
    if (error) return { erreur: messageUtilisateur(error, "Restauration refusée") };

    const res = (data ?? {}) as { insere?: Record<string, number>; ignore?: Record<string, number> };
    const insere = Object.entries(res.insere ?? {}).map(([table, lignes]) => ({ table, lignes }));
    const ignorees = Object.keys(res.ignore ?? {});
    const total = insere.reduce((n, i) => n + i.lignes, 0);

    revalidatePath("/parametres");
    revalidatePath("/tableau-de-bord");
    return {
      insere,
      total,
      succes:
        `Restauration terminée : ${total} ligne(s) réinsérée(s)` +
        (ignorees.length > 0
          ? ` · ${ignorees.length} table(s) déjà présente(s) ignorée(s) (${ignorees.join(", ")}).`
          : "."),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
