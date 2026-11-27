import { getSessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { readLocale, type Locale } from "./i18n";

/**
 * B.2 : le profil utilisateur fait autorité sur un nouvel appareil ; le cookie
 * reste le repli immédiat, y compris en démo locale ou si la migration 56 n'est
 * pas encore appliquée. Aucune erreur DB ne doit empêcher le rendu.
 */
export async function lireLangueProfil(): Promise<Locale | null> {
  const ctx = await getSessionContext({ allowLocked: true });
  if (!ctx || ctx.mode !== "supabase") return null;

  try {
    const db = await createClient();
    const { data, error } = await db
      .from("utilisateurs")
      .select("langue")
      .eq("auth_user_id", ctx.authUserId)
      .eq("client_id", ctx.clientId)
      .maybeSingle();
    if (error || !data) return null;
    return readLocale(typeof data.langue === "string" ? data.langue : undefined);
  } catch {
    return null;
  }
}
