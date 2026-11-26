"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { estProprietaireSeul } from "./permissions";

export type SiteState = { erreur?: string; succes?: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function enregistrerSite(_prev: SiteState, form: FormData): Promise<SiteState> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase" || !estProprietaireSeul(ctx.role)) return { erreur: "Réservé au propriétaire connecté." };
  const id = String(form.get("id") ?? "").trim();
  const nom = String(form.get("nom") ?? "").trim();
  const type = String(form.get("type") ?? "");
  const adresse = String(form.get("adresse") ?? "").trim();
  if ((id && !uuid.test(id)) || !nom || nom.length > 100 || adresse.length > 200 || !["boutique", "laboratoire"].includes(type)) {
    return { erreur: "Nom, type ou adresse invalide." };
  }
  try {
    const db = await createClient();
    const valeurs = { nom, type, adresse: adresse || null };
    const result = id
      ? await db.from("sites").update(valeurs).eq("id", id).eq("client_id", ctx.clientId).select("id").maybeSingle()
      : await db.from("sites").insert({ ...valeurs, client_id: ctx.clientId }).select("id").single();
    if (result.error || !result.data) return { erreur: "Enregistrement refusé ou site introuvable." };
    revalidatePath("/parametres");
    revalidatePath("/", "layout");
    return { succes: id ? "Site modifié." : "Site ajouté." };
  } catch { return { erreur: "Connexion indisponible ; le site n’a pas été confirmé." }; }
}
