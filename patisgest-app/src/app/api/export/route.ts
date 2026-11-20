import { NextResponse } from "next/server";
import { canReadCosts, getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TABLES_EXPORT, nomFichier, tableExportable, versCsv, type ValeurCsv } from "@/lib/csv";
import { lireModulesDesactives } from "@/lib/modules-access";
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
  // Les tables dites non « coût » contiennent aussi des coûts et des JSON
  // financiers. Aucun export brut employé sans projection expurgée validée.
  if (ctx.role !== "proprietaire") return NextResponse.json({ erreur: "Export non autorisé." }, { status: 403 });

  const cle = new URL(request.url).searchParams.get("table") ?? "";
  if (!tableExportable(cle, canReadCosts(ctx.role))) {
    // 403 pour une table de coût demandée par un vendeur, 404 si inconnue :
    // on ne révèle pas l'existence des tables de coût à qui n'y a pas droit.
    return NextResponse.json({ erreur: "Export non autorisé." }, { status: 403 });
  }
  const def = TABLES_EXPORT.find((t) => t.cle === cle)!;
  const moduleParTable: Record<string, string> = {ventes:"caisse", "z-imports":"caisse", mouvements:"stocks", lots:"stocks", articles:"stocks", clotures:"cloture", transferts:"transferts", ordres:"production", cakes:"cake-design", recettes:"recettes", couts:"simulation"};
  const disabled = await lireModulesDesactives(ctx);
  if (disabled === null || disabled.has(moduleParTable[cle])) return NextResponse.json({ erreur: "Export non autorisé." }, {status:403});

  try {
    const supabase = await createClient();
    const lignes: Record<string, ValeurCsv>[] = [];
    let complete = false;
    for (let offset=0;offset<20000;offset+=500) {
      const {data,error} = await supabase.from(def.table).select("*").eq("client_id",ctx.clientId).order("id").range(offset,offset+499);
      if(error||!data) return NextResponse.json({erreur:error ? messageUtilisateur(error,"Export impossible") : "Export impossible"},{status:500});
      lignes.push(...data as Record<string, ValeurCsv>[]);
      if(data.length<500) {complete=true;break;}
    }
    if(!complete) return NextResponse.json({erreur:"Export incomplet : limite de lignes atteinte."},{status:500});
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
