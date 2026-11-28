import { NextResponse } from "next/server";
import { canReadCosts, getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { TABLES_EXPORT, interpreterPeriode, nomFichier, tableExportable, versCsv, type ValeurCsv } from "@/lib/csv";
import { lireModulesDesactives } from "@/lib/modules-access";
import { messageUtilisateur } from "@/lib/erreurs-db";
import { journalErreurRoute } from "@/lib/observabilite-route";
import { lirePages } from "@/lib/pagination";
import { estProprietaireSeul } from "@/lib/permissions";

export const dynamic = "force-dynamic";

/**
 * MOD-15 — export CSV d'une table du tenant (US-15.2, RG-15.1 « aucune donnée
 * prisonnière »). Le filtrage par `client_id` est explicite ET doublé par la
 * RLS ; les tables de coût sont réservées aux rôles qui les lisent
 * (migration 17). Aucune donnée n'est modifiée.
 */
export async function GET(request: Request) {
  // Export CSV = issue de secours en LECTURE : accessible même verrouillé,
  // pour qu'un essai échu n'emprisonne pas les données du propriétaire.
  const ctx = await getSessionContext({ allowLocked: true });
  if (!ctx) return NextResponse.json({ erreur: "Session requise." }, { status: 401 });
  // Les tables dites non « coût » contiennent aussi des coûts et des JSON
  // financiers. Aucun export brut employé sans projection expurgée validée.
  if (!estProprietaireSeul(ctx.role)) return NextResponse.json({ erreur: "Export non autorisé." }, { status: 403 });

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

  // F-15 : filtre de période optionnel (?du=AAAA-MM-JJ&au=AAAA-MM-JJ) sur les tables datées.
  const params = new URL(request.url).searchParams;
  const periode = interpreterPeriode(params.get("du"), params.get("au"));
  if (!periode.ok) return NextResponse.json({ erreur: periode.message }, { status: 400 });
  if ((periode.du || periode.au) && !def.colonneDate) {
    return NextResponse.json({ erreur: "Filtre de période non applicable à cette table." }, { status: 400 });
  }

  let etape = "client";
  try {
    const supabase = await createClient();
    etape = `lecture:${cle}`;
    const lecture = await lirePages<Record<string, ValeurCsv>>(
      async (offset, limite) => {
        let requete = supabase.from(def.table).select("*").eq("client_id", ctx.clientId);
        if (def.colonneDate && periode.du) requete = requete.gte(def.colonneDate, periode.du);
        if (def.colonneDate && periode.au) requete = requete.lte(def.colonneDate, periode.au);
        const { data, error } = await requete.order("id").range(offset, offset + limite - 1);
        return { data: data as Record<string, ValeurCsv>[] | null, error };
      },
      20000,
    );
    if (!lecture.ok) {
      if (lecture.raison === "limite") {
        return NextResponse.json({ erreur: "Export refusé : plus de 20 000 lignes. Limitez l’export à une période ou exportez par tranches." }, { status: 413 });
      }
      return NextResponse.json({ erreur: lecture.error ? messageUtilisateur(lecture.error, "Export impossible") : "Export impossible" }, { status: 500 });
    }
    etape = "csv";
    const lignes = lecture.lignes;
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
  } catch (erreur) {
    journalErreurRoute("api/export", etape, erreur);
    return NextResponse.json({ erreur: "Supabase est inaccessible depuis ce serveur." }, { status: 503 });
  }
}
