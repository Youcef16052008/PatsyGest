"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { createClient } from "./supabase/server";

export async function sauverPhotoArticleCloud(
  articleId: string,
  photoUrl: string | null,
): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase" || !canWrite(ctx.role)) {
    return { ok: false, erreur: "Droits insuffisants." };
  }
  try {
    const db = await createClient();
    const { error } = await db.rpc("sauver_photo_article", {
      p_article_id: articleId,
      p_photo_url: photoUrl,
    });
    if (error) {
      if (error.code === "PGRST202" || error.code === "42883") {
        return { ok: false, erreur: "Migration SQL 48 requise pour enregistrer les photos dans le cloud." };
      }
      return { ok: false, erreur: messageUtilisateur(error, "Enregistrement refusé") };
    }
    revalidatePath("/stocks");
    revalidatePath("/caisse");
    return { ok: true };
  } catch {
    return { ok: false, erreur: "Serveur inaccessible." };
  }
}
