"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import {
  filterPackByActivityAndVat,
  type StarterDzActivity,
  type StarterVatRegime,
} from "./pack-patisserie-dz";
import { createClient } from "./supabase/server";
import { estProprietaireSeul } from "./permissions";

export type OnboardingActionState = {
  ok?: boolean;
  erreur?: string;
  succes?: string;
  imported?: number;
};

export async function sauverBoutiqueExpress(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!estProprietaireSeul(ctx.role)) return { erreur: "Réservé au propriétaire." };
  const nom = String(formData.get("nom") ?? "").trim();
  const telephone = String(formData.get("telephone") ?? "").trim();
  if (nom.length < 2 || nom.length > 100) return { erreur: "Nom de la boutique requis (2 à 100 caractères)." };
  if (ctx.mode !== "supabase") {
    return { ok: true, succes: "Identité prête pour la démonstration." };
  }
  try {
    const db = await createClient();
    const { error } = await db
      .from("clients")
      .update({
        nom,
        telephone: telephone || null,
      })
      .eq("id", ctx.clientId);
    if (error) return { erreur: messageUtilisateur(error, "Enregistrement refusé") };
    revalidatePath("/tableau-de-bord");
    revalidatePath("/parametres");
    return { ok: true, succes: "Nom et téléphone enregistrés !" };
  } catch {
    return { erreur: "Supabase inaccessible." };
  }
}

export async function importerPackPatisserieDz(
  activity: StarterDzActivity = "mixte",
  tvaRegime: StarterVatRegime = "ifu_0",
): Promise<OnboardingActionState> {
  const ctx = await getSessionContext();
  if (!ctx) return { erreur: "Session requise." };
  if (!estProprietaireSeul(ctx.role)) return { erreur: "Réservé au propriétaire." };
  const selectedPack = filterPackByActivityAndVat(activity, tvaRegime);
  if (ctx.mode !== "supabase") {
    return { ok: true, imported: selectedPack.length, succes: "Pack métier algérien importé." };
  }
  try {
    const db = await createClient();
    const existing = await db
      .from("articles")
      .select("code")
      .eq("client_id", ctx.clientId)
      .limit(1000);
    if (existing.error) {
      return { erreur: messageUtilisateur(existing.error, "Lecture catalogue impossible") };
    }
    const existingCodes = new Set(
      (existing.data ?? []).map((a) => String((a as { code?: string }).code ?? "").toLowerCase()),
    );
    const toInsert = selectedPack.filter((item) => !existingCodes.has(item.code.toLowerCase())).map((item) => ({
      client_id: ctx.clientId,
      code: item.code,
      nom: item.nom,
      niveau: item.niveau,
      unite: item.unite,
      seuil: item.seuil,
      pv_ht: item.pvHt,
      tva: item.tva,
      allergenes: [],
      traces: [],
    }));
    if (toInsert.length === 0) {
      return { ok: true, imported: 0, succes: "Votre catalogue contient déjà les produits du pack !" };
    }
    const { error } = await db.from("articles").insert(toInsert);
    if (error) return { erreur: messageUtilisateur(error, "Import refusé") };
    revalidatePath("/tableau-de-bord");
    revalidatePath("/stocks");
    revalidatePath("/caisse");
    return {
      ok: true,
      imported: toInsert.length,
      succes: `${toInsert.length} produits et ingrédients algériens ajoutés ! Votre caisse est prête.`,
    };
  } catch {
    return { erreur: "Supabase inaccessible." };
  }
}
