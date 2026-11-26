"use server";

/** Clôture produits, bilan tiroir d’espèces. */

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
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
import { type JournalState, requireWriter, requireAnyRole, mapError } from "./journal-actions-communs";

export async function saisirCloture(_prev: JournalState, formData: FormData): Promise<JournalState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!estProprietaireSeul(ctx.role)) return { erreur: "La clôture complète est réservée au propriétaire." };
  let input;
  try {
    input = parseClosingInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("saisir_cloture", {
      p_date: input.date,
      p_site_id: input.siteId,
      p_lignes: input.lignes,
      p_revise: input.revise,
      ...(input.caisseBilan ? { p_caisse_bilan: input.caisseBilan } : {}),
    });
    if (error) {
      if ((error.code === "PGRST202" || error.code === "42883") && input.caisseBilan) {
        return {
          erreur:
            "L’enregistrement du comptage tiroir d’espèces nécessite l’application de la migration SQL 21 sur Supabase.",
        };
      }
      return { erreur: mapError(error) };
    }
    const r = data as { revision?: number; lignes?: number; caisse_bilan?: boolean } | null;
    revalidatePath("/cloture");
    return {
      succes:
        `Clôture enregistrée — révision ${r?.revision}, ${input.lignes.length} produit(s)` +
        (r?.caisse_bilan ? " + bilan tiroir d’espèces enregistré séparément." : "."),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Validation directe du comptage tiroir (propriétaire ou vendeur en mode aveugle). */

export async function validerComptageTiroir(input: {
  date: string;
  siteId: string;
  fondInitial: number;
  especesComptees: number;
  attendu?: number;
  note?: string;
}): Promise<{ ok: boolean; erreur?: string; succes?: string }> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, erreur: "Session requise." };
  if (ctx.role === "labo") return { ok: false, erreur: "Comptage de caisse réservé au comptoir." };
  if (ctx.mode !== "supabase") {
    return { ok: true, succes: "Comptage enregistré localement." };
  }
  if (!input.siteId) return { ok: false, erreur: "Boutique introuvable pour la clôture." };
  if (!Number.isFinite(input.fondInitial) || input.fondInitial < 0 || !Number.isFinite(input.especesComptees) || input.especesComptees < 0) {
    return { ok: false, erreur: "Montants invalides." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("valider_tiroir_jour", {
      p_date: input.date,
      p_site_id: input.siteId,
      p_fond_initial: input.fondInitial,
      p_especes_comptees: input.especesComptees,
      p_attendu: ctx.role === "proprietaire" ? (input.attendu ?? 0) : 0,
      p_note: (input.note ?? "").trim().slice(0, 250),
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return {
          ok: false,
          erreur: "Migration SQL 46 requise sur Supabase pour enregistrer le comptage en un clic.",
        };
      }
      return { ok: false, erreur: mapError(error) };
    }
    revalidatePath("/tableau-de-bord");
    revalidatePath("/cloture");
    return {
      ok: true,
      succes:
        ctx.role === "vendeur"
          ? "Comptage de fin de journée enregistré et transmis au propriétaire ✓"
          : "Clôture du tiroir enregistrée sur le serveur ✓",
    };
  } catch {
    return { ok: false, erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Demande explicite de réassort boutique -> labo (« Demain au labo ») — tous les rôles connectés. */
