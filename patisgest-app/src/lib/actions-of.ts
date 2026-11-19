"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { echecHttpReessayable, messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
import { parseOfCreateInput, parseOfFinishInput } from "./stock-input";

export type OfState = {
  erreur?: string;
  succes?: string;
  numero?: string;
  duplicate?: boolean;
  reessayer?: boolean;
};

async function requireWriter(): Promise<{ erreur: string; reessayer?: boolean } | null> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise.", reessayer: true };
  if (!canWrite(ctx.role)) return { erreur: "Réservé aux rôles propriétaire et labo." };
  return null;
}

function mapRpcError(error: { code?: string; message: string }): string {
  return messageUtilisateur(error, "Opération refusée");
}

/** Crée un OF : les besoins sont recalculés côté serveur (RPC creer_of). */
export async function createOf(_prev: OfState, formData: FormData): Promise<OfState> {
  const denied = await requireWriter();
  if (denied) return denied;

  let input;
  try {
    input = parseOfCreateInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }

  // Référence client (file hors-ligne) : idempotence creer_of.
  const clientRefRaw = String(formData.get("clientRef") ?? "").trim();
  const clientRef = /^[\w-]{1,64}$/.test(clientRefRaw) ? clientRefRaw : null;

  try {
    const supabase = await createClient();
    const { data, error, status } = await supabase.rpc("creer_of", {
      p_version_id: input.versionId,
      p_site_id: input.siteId,
      p_qte_prevue: input.qtePrevue,
      p_date_prevue: input.datePrevue,
      p_client_ref: clientRef,
    });
    if (error) return { erreur: mapRpcError(error), reessayer: echecHttpReessayable(status) };
    const r = data as { numero?: string; duplicate?: boolean } | null;
    const numero = r?.numero ?? "";
    revalidatePath("/production");
    revalidatePath("/tableau-de-bord");
    if (r?.duplicate) {
      return { succes: `OF ${numero} déjà enregistré (idempotence hors-ligne).`, numero, duplicate: true };
    }
    return { succes: `OF ${numero} planifié avec les besoins figés de la recette.`, numero, duplicate: false };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur.", reessayer: true };
  }
}

/** Lance l'OF : consommation FEFO atomique des besoins (RPC demarrer_of). */
export async function startOf(_prev: OfState, formData: FormData): Promise<OfState> {
  const denied = await requireWriter();
  if (denied) return denied;

  const ofId = String(formData.get("ofId") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(ofId)) return { erreur: "OF invalide." };

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("demarrer_of", { p_of_id: ofId });
    if (error) return { erreur: mapRpcError(error) };
    const r = data as { numero?: string; consommations?: number; manquants?: number } | null;
    revalidatePath("/production");
    revalidatePath("/stocks");
    return {
      succes:
        `OF ${r?.numero} lancé — ${r?.consommations ?? 0} lot(s) consommé(s).` +
        (Number(r?.manquants ?? 0) > 0 ? ` ${r?.manquants} manquant(s) journalisé(s).` : ""),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}

/** Clôture partielle/totale : lot produit au cout connu (RPC terminer_of). */
export async function finishOf(_prev: OfState, formData: FormData): Promise<OfState> {
  const denied = await requireWriter();
  if (denied) return denied;

  let input;
  try {
    input = parseOfFinishInput(formData);
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : "Saisie invalide." };
  }

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc("terminer_of", {
      p_of_id: input.ofId,
      p_qte: input.qte,
      p_numero_lot: input.numeroLot,
      p_dlc: input.dlc,
    });
    if (error) return { erreur: mapRpcError(error) };
    const r = data as { lot_id?: string; cout_unitaire?: number; statut?: string; lot_bloque?: boolean } | null;
    revalidatePath("/production");
    revalidatePath("/stocks");
    const ctx = await getSessionContext();
    return {
      succes:
        (ctx?.role === "labo" ? `Production enregistrée — lot créé, statut ${r?.statut}.` : `Production enregistrée — lot créé au coût unitaire ${r?.cout_unitaire} (coûts connus), statut ${r?.statut}.`) +
        (r?.lot_bloque ? " Lot bloqué automatiquement (lot consommé bloqué)." : ""),
    };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
