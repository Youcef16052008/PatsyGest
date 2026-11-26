"use server";

import { revalidatePath } from "next/cache";
import { canDeleteRecipes, canWrite, getSessionContext } from "./auth";
import type { FreeRecipe } from "./free-recipes";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";
import { sanitizeRecipePhoto } from "./recipe-photo";

export type FreeRecipeCloudResult = {
  ok: boolean;
  recipes?: FreeRecipe[];
  tableAvailable: boolean;
  erreur?: string;
};

type DbRow = {
  id: string;
  nom: string;
  categorie: string | null;
  parts: number;
  frais_fixes_da: number;
  prix_vente_da: number | null;
  ingredients: unknown;
  statut_prix: string | null;
  updated_at: string;
};

function mapRow(row: DbRow): FreeRecipe {
  const rawIng = Array.isArray(row.ingredients) ? row.ingredients : [];
  return {
    id: row.id,
    nom: row.nom,
    categorie: row.categorie ?? "Pâtisserie",
    portions: Math.max(1, Number(row.parts) || 1),
    unitePortion: "parts",
    emballageDa: Number(row.frais_fixes_da) || 0,
    cuissonMoDa: 0,
    prixVenteDa: Number(row.prix_vente_da) || 0,
    notes: "",
    photo: sanitizeRecipePhoto((row as DbRow & { photo_url?: string | null }).photo_url ?? null),
    ingredients: rawIng as FreeRecipe["ingredients"],
    statutPrix:
      row.statut_prix === "a_verifier_patron" || row.statut_prix === "bloque" ? row.statut_prix : "valide",
    updatedAt: String(row.updated_at ?? "").slice(0, 10),
  };
}

export async function loadFreeRecipesCloud(): Promise<FreeRecipeCloudResult> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") {
    return { ok: false, tableAvailable: false };
  }
  try {
    const db = await createClient();
    const { data, error } = await db
      .from("recettes_libres")
      // `*` : tolère l'absence de la colonne `photo_url` (migration photo non
      // encore appliquée) sans casser la lecture des recettes existantes.
      .select("*")
      .eq("client_id", ctx.clientId)
      .order("updated_at", { ascending: false })
      .limit(300);
    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { ok: false, tableAvailable: false };
      }
      return { ok: false, tableAvailable: true, erreur: messageUtilisateur(error, "Lecture impossible") };
    }
    return {
      ok: true,
      tableAvailable: true,
      recipes: ((data ?? []) as DbRow[]).map(mapRow),
    };
  } catch {
    return { ok: false, tableAvailable: false };
  }
}

export async function saveFreeRecipeCloud(recipe: FreeRecipe): Promise<{
  ok: boolean;
  id?: string;
  tableAvailable?: boolean;
  erreur?: string;
}> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase") return { ok: false, tableAvailable: false };
  if (!canWrite(ctx.role)) return { ok: false, tableAvailable: true, erreur: "Rôle non autorisé." };

  const nom = recipe.nom.trim();
  if (!nom) return { ok: false, tableAvailable: true, erreur: "Nom de recette requis." };

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipe.id);
  const fraisFixes = Math.max(0, (Number(recipe.emballageDa) || 0) + (Number(recipe.cuissonMoDa) || 0));
  const payload = {
    ...(isUuid ? { id: recipe.id } : {}),
    client_id: ctx.clientId,
    nom: nom.slice(0, 160),
    categorie: (recipe.categorie ?? "Pâtisserie").slice(0, 80),
    parts: Math.max(1, Math.round(Number(recipe.portions) || 1)),
    frais_fixes_da: Math.round(fraisFixes * 100) / 100,
    prix_vente_da: Math.max(0, Math.round((Number(recipe.prixVenteDa) || 0) * 100) / 100),
    ingredients: recipe.ingredients ?? [],
    statut_prix: ctx.role === "proprietaire" ? (recipe.statutPrix ?? "valide") : "a_verifier_patron",
    photo_url: sanitizeRecipePhoto(recipe.photo),
    modifie_par: ctx.authUserId,
    updated_at: new Date().toISOString(),
  };

  try {
    const db = await createClient();
    const { data, error } = isUuid
      ? await db.from("recettes_libres").upsert(payload, { onConflict: "id" }).select("id").single()
      : await db
          .from("recettes_libres")
          .insert({ ...payload, cree_par: ctx.authUserId })
          .select("id")
          .single();

    if (error) {
      if (error.code === "42P01" || error.code === "PGRST205") {
        return { ok: false, tableAvailable: false };
      }
      return { ok: false, tableAvailable: true, erreur: messageUtilisateur(error, "Enregistrement refusé") };
    }
    revalidatePath("/recettes");
    return { ok: true, id: (data as { id?: string } | null)?.id ?? recipe.id, tableAvailable: true };
  } catch {
    return { ok: false, tableAvailable: true, erreur: "Serveur inaccessible." };
  }
}

export async function deleteFreeRecipeCloud(id: string): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase" || !canDeleteRecipes(ctx.role)) {
    return { ok: false, erreur: "Seul le propriétaire peut supprimer une recette." };
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return { ok: true };
  }
  try {
    const db = await createClient();
    const { error } = await db.from("recettes_libres").delete().eq("id", id).eq("client_id", ctx.clientId);
    if (error) return { ok: false, erreur: messageUtilisateur(error, "Suppression impossible") };
    revalidatePath("/recettes");
    return { ok: true };
  } catch {
    return { ok: false, erreur: "Serveur inaccessible." };
  }
}

export async function syncLocalRecipesToCloud(recipes: FreeRecipe[]): Promise<{
  ok: boolean;
  count: number;
  erreur?: string;
}> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase" || !canWrite(ctx.role)) {
    return { ok: false, count: 0, erreur: "Synchronisation non autorisée." };
  }
  let synced = 0;
  for (const r of recipes.slice(0, 50)) {
    const res = await saveFreeRecipeCloud(r);
    if (!res.ok) {
      return { ok: false, count: synced, erreur: res.erreur ?? "Table recettes_libres absente sur Supabase." };
    }
    synced++;
  }
  revalidatePath("/recettes");
  return { ok: true, count: synced };
}
