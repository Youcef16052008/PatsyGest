"use server";

import { revalidatePath } from "next/cache";
import { canWrite, getSessionContext } from "./auth";
import { messageUtilisateur } from "./erreurs-db";
import { sanitizeImageDataUrl } from "./recipe-photo";
import { createClient } from "./supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function sauverPhotoArticleCloud(
  articleId: string,
  photoUrl: string | null,
): Promise<{ ok: boolean; erreur?: string }> {
  const ctx = await getSessionContext();
  if (!ctx || ctx.mode !== "supabase" || !canWrite(ctx.role)) {
    return { ok: false, erreur: "Droits insuffisants." };
  }
  // H12-05/H12-06 : le composant n'est PAS une frontière de confiance. Une
  // URL externe, un SVG ou un faux JPEG `AAAA…` sont refusés ici, avant le RPC,
  // avec la même borne que le garde-fou de recette ; la contrainte SQL 52
  // protège en plus la colonne `photo_url` des recettes libres.
  if (!UUID_RE.test(String(articleId ?? "").trim())) {
    return { ok: false, erreur: "Article invalide." };
  }
  const photo = photoUrl === null ? null : sanitizeImageDataUrl(photoUrl);
  if (photoUrl !== null && photo === null) {
    return { ok: false, erreur: "Photo invalide : compressez une image JPEG, PNG ou WebP." };
  }
  try {
    const db = await createClient();
    const { error } = await db.rpc("sauver_photo_article", {
      p_article_id: articleId,
      p_photo_url: photo,
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
