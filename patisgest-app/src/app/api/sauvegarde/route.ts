import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { messageUtilisateur } from "@/lib/erreurs-db";
import {
  ORDRE_RESTAURATION, colonneTenant, construireSauvegarde, nomFichierSauvegarde,
  type TableSauvegardee,
} from "@/lib/sauvegarde";

export const dynamic = "force-dynamic";

/**
 * US-15.2 — sauvegarde complète JSON (RG-15.1 : aucune donnée prisonnière).
 * Réservée au propriétaire : c'est un export de tout l'établissement.
 * Lecture seule, aucune écriture.
 */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ erreur: "Session requise." }, { status: 401 });
  if (ctx.role !== "proprietaire") {
    return NextResponse.json({ erreur: "Sauvegarde réservée au propriétaire." }, { status: 403 });
  }

  try {
    const supabase = await createClient();
    const tables: TableSauvegardee[] = [];
    const echecs: string[] = [];

    for (const table of ORDRE_RESTAURATION) {
      // `clients` s'isole par `id`, toutes les autres par `client_id` :
      // filtrer clients sur client_id fait échouer la sauvegarde entière.
      const { data, error } = await supabase
        .from(table)
        .select("*")
        .eq(colonneTenant(table), ctx.clientId)
        .limit(50000);
      if (error) {
        // Une table illisible ne doit pas produire une sauvegarde silencieusement
        // incomplète : on la nomme dans la réponse 500.
        echecs.push(`${table} : ${messageUtilisateur(error, "lecture refusée")}`);
        continue;
      }
      tables.push({ table, lignes: (data ?? []) as Record<string, unknown>[] });
    }

    if (echecs.length > 0) {
      return NextResponse.json(
        { erreur: "Sauvegarde incomplète — aucune donnée partielle n'est produite.", details: echecs },
        { status: 500 },
      );
    }

    const dump = construireSauvegarde(ctx.clientId, ctx.clientNom, tables);
    return new NextResponse(JSON.stringify(dump, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichierSauvegarde(ctx.clientNom)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch {
    return NextResponse.json({ erreur: "Supabase est inaccessible depuis ce serveur." }, { status: 503 });
  }
}
