import { NextResponse } from "next/server";
import { canReadCosts, getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TABLES_EXPORT, nomFichier, tableExportable, versCsv, type ValeurCsv } from "@/lib/csv";
import { messageUtilisateur } from "@/lib/erreurs-db";

export const dynamic = "force-dynamic";

/**
 * MOD-15 — export CSV d'une table du tenant (US-15.2, RG-15.1 « aucune donnée
 * prisonnière »). Le filtrage par `client_id` est explicite ET doublé par la
 * RLS ; les tables de coût sont réservées aux rôles qui les lisent
 * (migration 17). Aucune donnée n'est modifiée.
 */
export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ erreur: "Session requise." }, { status: 401 });

  const cle = new URL(request.url).searchParams.get("table") ?? "";
  if (!tableExportable(cle, canReadCosts(ctx.role))) {
    // 403 pour une table de coût demandée par un vendeur, 404 si inconnue :
    // on ne révèle pas l'existence des tables de coût à qui n'y a pas droit.
    return NextResponse.json({ erreur: "Export non autorisé." }, { status: 403 });
  }
  const def = TABLES_EXPORT.find((t) => t.cle === cle)!;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from(def.table)
      .select("*")
      .eq("client_id", ctx.clientId)
      .limit(20000);
    if (error) {
      return NextResponse.json({ erreur: messageUtilisateur(error, "Export impossible") }, { status: 500 });
    }

    const lignes = (data ?? []) as Record<string, ValeurCsv>[];
    // Colonnes = union des clés rencontrées, ordre stable (alphabétique) pour
    // que deux exports successifs soient comparables au diff.
    const entetes = [...new Set(lignes.flatMap((l) => Object.keys(l)))].sort();
    const corps = lignes.map((l) => entetes.map((c) => l[c]));
    const csv = versCsv(entetes, corps);

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": `text/csv; charset=utf-8`,
        "Content-Disposition": `attachment; filename="${nomFichier(def.titre)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ erreur: "Supabase est inaccessible depuis ce serveur." }, { status: 503 });
  }
}
