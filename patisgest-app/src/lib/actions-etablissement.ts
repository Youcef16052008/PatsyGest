"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { messageUtilisateur } from "./erreurs-db";
import { validerNif, validerNis, validerRc } from "./etablissement";
import { estProprietaireSeul } from "./permissions";

export type EtablissementState = { erreur?: string; succes?: string };

/**
 * US-15.1 — paramètres d'identité de l'établissement (NIF, NIS, RC, adresse).
 * Réservé au propriétaire : la RLS `clients_update_owner` le vérifie aussi,
 * mais on refuse proprement côté serveur avant d'y arriver.
 */
export async function sauverEtablissement(_prev: EtablissementState, formData: FormData): Promise<EtablissementState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!estProprietaireSeul(ctx.role)) return { erreur: "Réservé au propriétaire." };

  const nom = String(formData.get("nom") ?? "").trim();
  const adresse = String(formData.get("adresse") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  const nif = validerNif(String(formData.get("nif") ?? ""));
  const nis = validerNis(String(formData.get("nis") ?? ""));
  const rc = validerRc(String(formData.get("rc") ?? ""));

  if (nom.length < 1 || nom.length > 100) return { erreur: "Nom de l'établissement requis (100 max)." };
  if (adresse.length < 1 || adresse.length > 200) {
    return { erreur: "Adresse requise (décret 13-378, 200 max)." };
  }
  if (telephone.length > 40) return { erreur: "Téléphone trop long (40 max)." };
  for (const [cle, r] of [["NIF", nif], ["NIS", nis], ["RC", rc]] as const) {
    if (!r.ok) return { erreur: `${cle} : ${r.erreur}` };
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .from("clients")
      .update({
        nom,
        adresse,
        telephone: telephone || null,
        nif: nif.valeur,
        nis: nis.valeur,
        rc: rc.valeur,
      })
      .eq("id", ctx.clientId);
    if (error) return { erreur: messageUtilisateur(error, "Enregistrement refusé") };
    revalidatePath("/parametres");
    revalidatePath("/caisse");
    return { succes: "Identité de l'établissement enregistrée — les tickets suivants portent les mentions légales." };
  } catch {
    return { erreur: "Supabase est inaccessible depuis ce serveur." };
  }
}
