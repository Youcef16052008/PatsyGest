import { NextResponse } from "next/server";
import { getSessionContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { interpreterPeriode, nomFichier, versCsv, type ValeurCsv } from "@/lib/csv";
import {
  controleEquilibre,
  ecrituresComptables,
  entetesComptables,
  type AvoirComptable,
  type VenteComptable,
} from "@/lib/export-comptable";
import { lirePages } from "@/lib/pagination";
import { messageUtilisateur } from "@/lib/erreurs-db";

export const dynamic = "force-dynamic";

/**
 * MOD-15 / §8.3 — export comptable CSV.
 *
 * « date, pièce, compte auxiliaire, HT, TVA, TTC » — le format exact du CDC.
 *
 * Choix durs :
 *  * **Propriétaire uniquement.** Les ventes contiennent des marges ; un
 *    export brut d'un vendeur serait une fuite commerciale, et le CDC réserve
 *    l'export comptable à la direction.
 *  * **Avoirs inclus en négatif.** Les omettre gonflerait le CA déclaré.
 *  * **Refus si l'export ne se réconcilie pas.** Mieux vaut un 409 explicite
 *    qu'un fichier faux que le comptable prendra pour argent comptant. Les
 *    anomalies sont listées pour que la cause soit corrigeable.
 *  * **Les avoirs sont lus sans filtre de repli.** Si la migration 41 n'est pas
 *    déployée, on n'exporte *pas* silencieusement un CA sans avoirs : on le dit.
 */
export async function GET(request: Request) {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ erreur: "Session requise." }, { status: 401 });
  if (ctx.role !== "proprietaire") {
    return NextResponse.json({ erreur: "Export comptable réservé au propriétaire." }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const periode = interpreterPeriode(params.get("du"), params.get("au"));
  if (!periode.ok) return NextResponse.json({ erreur: periode.message }, { status: 400 });

  try {
    const supabase = await createClient();

    const ventesLecture = await lirePages<VenteComptable>(
      async (offset, limite) => {
        let q = supabase
          .from("ventes")
          .select("id, numero, date_vente, site_id, total_ht, total_ttc, lignes")
          .eq("client_id", ctx.clientId);
        if (periode.du) q = q.gte("date_vente", periode.du);
        if (periode.au) q = q.lte("date_vente", periode.au);
        const { data, error } = await q.order("id").range(offset, offset + limite - 1);
        return { data: (data ?? null) as VenteComptable[] | null, error };
      },
      20000,
    );
    if (!ventesLecture.ok) {
      if (ventesLecture.raison === "limite") {
        return NextResponse.json(
          { erreur: "Export refusé : plus de 20 000 ventes. Limitez la période d'export." },
          { status: 413 },
        );
      }
      return NextResponse.json(
        { erreur: ventesLecture.error ? messageUtilisateur(ventesLecture.error, "Export impossible") : "Export impossible" },
        { status: 500 },
      );
    }

    let avoirs: AvoirComptable[] = [];
    {
      let q = supabase
        .from("avoirs")
        .select("id, numero, cree_le, site_id, total_ht, total_ttc, tva_pct")
        .eq("client_id", ctx.clientId);
      if (periode.du) q = q.gte("cree_le", `${periode.du}T00:00:00`);
      if (periode.au) q = q.lte("cree_le", `${periode.au}T23:59:59`);
      const { data, error } = await q.limit(20000);
      if (error) {
        const absente = error.code === "42P01" || error.code === "PGRST205";
        return NextResponse.json(
          {
            erreur: absente
              ? "L'export comptable sera exact une fois la migration 41 (avoirs) appliquée. Sans elle, le chiffre d'affaires exporté ignorerait les retours."
              : messageUtilisateur(error, "Export impossible"),
          },
          { status: absente ? 409 : 500 },
        );
      }
      avoirs = ((data ?? []) as {
        id: string; numero: string; cree_le: string; total_ht: number; total_ttc: number; tva_pct: number;
      }[]).map((a) => ({
        id: a.id,
        numero: a.numero,
        date: String(a.cree_le).slice(0, 10),
        site: ctx.clientNom,
        totalHT: Number(a.total_ht),
        totalTTC: Number(a.total_ttc),
        tva: Number(a.tva_pct),
      }));
    }

    // Les lignes de vente portent la TVA par ligne (RG-06.3 : TVA par nature et
    // par ligne). On agrège le taux effectif du ticket pour le contrôle.
    const ventes: VenteComptable[] = (ventesLecture.lignes as unknown as {
      id: string; numero: string; date_vente: string; total_ht: number; total_ttc: number;
      lignes: { tva?: number }[] | null;
    }[]).map((v) => {
      const lignes = Array.isArray(v.lignes) ? v.lignes : [];
      const taux = lignes
        .map((l) => Number(l?.tva))
        .filter((t) => Number.isFinite(t));
      const tva = taux.length ? Math.max(...taux) : 0;
      return {
        id: v.id,
        numero: v.numero,
        date: String(v.date_vente).slice(0, 10),
        site: ctx.clientNom,
        totalHT: Number(v.total_ht),
        totalTTC: Number(v.total_ttc),
        tva,
      };
    });

    const ecritures = ecrituresComptables({ ventes, avoirs });
    const equilibre = controleEquilibre(ecritures);

    if (!equilibre.verse) {
      const anomalies = ecritures.filter((l) => l.anomalie).slice(0, 20).map((l) => l.piece);
      return NextResponse.json(
        {
          erreur:
            `Export refusé : il ne se réconcilie pas au centime (écart ${equilibre.ecart}). ` +
            "Un fichier faux est plus dangereux qu'aucun fichier. Corrigez les pièces listées puis réexportez.",
          ecart: equilibre.ecart,
          anomalies: equilibre.anomalies,
          pieces: anomalies,
        },
        { status: 409 },
      );
    }

    const csv = versCsv(
      entetesComptables,
      ecritures.map((l) => [l.date, l.piece, l.compteAuxiliaire, l.ht, l.tva, l.ttc, l.sens, l.anomalie] as ValeurCsv[]),
    );

    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${nomFichier("comptable")}"`,
        "Cache-Control": "no-store",
        // Exposé au client pour qu'il puisse afficher le total avant de remettre
        // le fichier : un comptable demande toujours le contrôle de cohérence.
        "X-PatisGest-Ecart": String(equilibre.ecart),
        "X-PatisGest-Total-Ht": String(equilibre.totalHT),
        "X-PatisGest-Total-Tva": String(equilibre.totalTVA),
        "X-PatisGest-Total-Ttc": String(equilibre.totalTTC),
      },
    });
  } catch {
    return NextResponse.json({ erreur: "Supabase est inaccessible depuis ce serveur." }, { status: 503 });
  }
}
