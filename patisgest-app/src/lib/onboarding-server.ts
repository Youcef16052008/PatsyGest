import "server-only";
import { canReadCosts, canWrite, type SessionContext } from "./auth";
import { createClient } from "./supabase/server";
import { progressionOnboarding } from "./onboarding";

/** Les compteurs du guide lisent les recettes : aucun appel pour les vendeurs. */
export async function compterGuide(ctx: SessionContext, client?: Awaited<ReturnType<typeof createClient>>) {
  if (ctx.mode !== "supabase" || !canReadCosts(ctx.role) || !canWrite(ctx.role)) return null;
  try {
    const db = client ?? await createClient();
    const { clientId } = ctx;
    const tous = await Promise.all([
      db.from("articles").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("niveau", "matiere"),
      db.from("articles").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("niveau", "produit"),
      db.from("fournisseurs").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      db.from("recette_versions").select("id", { count: "exact", head: true }).eq("client_id", clientId).eq("active", true),
      db.from("ordres_fabrication").select("id", { count: "exact", head: true }).eq("client_id", clientId),
      db.from("ventes").select("id", { count: "exact", head: true }).eq("client_id", clientId),
    ]);
    // Une lecture indisponible n'est pas une installation vide.
    if (tous.some((r) => r.error || r.count === null)) return null;
    const [matieres, produits, fournisseurs, versionsActives, ordresFabrication, ventes] = tous.map((r) => r.count ?? 0);
    return progressionOnboarding({ matieres, produits, fournisseurs, versionsActives, ordresFabrication, ventes });
  } catch {
    return null;
  }
}
