import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { lireModulesDesactives } from "@/lib/modules-access";
import { messageUtilisateur } from "@/lib/erreurs-db";
import { lirePages } from "@/lib/pagination";
import {
  ORDRE_RESTAURATION, colonneTenant, construireSauvegarde, nomFichierSauvegarde, MAX_OCTETS_SAUVEGARDE,
  type TableSauvegardee,
} from "@/lib/sauvegarde";

export const dynamic = "force-dynamic";

/**
 * Export JSON partiel. Les comptes, réglages d'accès et données équipe ne
 * sont pas inclus ; ne pas l'utiliser comme sauvegarde complète de la base.
 * Réservé au propriétaire.
 * Lecture seule, aucune écriture.
 */
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ erreur: "Session requise." }, { status: 401 });
  if (ctx.role !== "proprietaire") {
    return NextResponse.json({ erreur: "Sauvegarde réservée au propriétaire." }, { status: 403 });
  }

  const disabled = await lireModulesDesactives(ctx);
  if (disabled === null || disabled.size > 0) return NextResponse.json({ erreur: "Sauvegarde indisponible : autorisations incomplètes ou modules désactivés." }, { status: 403 });

  try {
    const supabase = await createClient();
    const tables: TableSauvegardee[] = [];
    const echecs: string[] = [];

    for (const table of ORDRE_RESTAURATION) {
      // `clients` s'isole par `id`, toutes les autres par `client_id` :
      // filtrer clients sur client_id fait échouer la sauvegarde entière.
      const lecture = await lirePages<Record<string, unknown>>(
        async (offset, limite) => {
          const { data, error } = await supabase.from(table).select("*")
            .eq(colonneTenant(table), ctx.clientId).order("id").range(offset, offset + limite - 1);
          return { data: data as Record<string, unknown>[] | null, error };
        },
        50000,
      );
      if (!lecture.ok) {
        if (lecture.raison === "lecture") {
          echecs.push(`${table} : ${lecture.error ? messageUtilisateur(lecture.error, "lecture refusée") : "lecture indisponible"}`);
        } else {
          echecs.push(`${table} : limite de 50 000 lignes atteinte; sauvegarde incomplète`);
        }
        continue;
      }
      tables.push({ table, lignes: lecture.lignes });
    }

    if (echecs.length > 0) {
      return NextResponse.json(
        { erreur: "Sauvegarde incomplète — aucune donnée partielle n'est produite.", details: echecs },
        { status: 500 },
      );
    }

    const dump = construireSauvegarde(ctx.clientId, ctx.clientNom, tables);
    const json = JSON.stringify(dump, null, 2);
    if (Buffer.byteLength(json, "utf8") > MAX_OCTETS_SAUVEGARDE) return NextResponse.json({erreur:"Sauvegarde trop volumineuse pour la restauration actuelle : contactez le support."},{status:413});
    return new NextResponse(json, {
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
