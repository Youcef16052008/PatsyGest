import type { ReconEntry } from "@/lib/reconciliation";

/**
 * Rapprochement caisse / clôture (lecture seule) : pour chaque clôture
 * (dernière révision), le vendu déclaré est comparé aux ventes réelles du
 * même jour et du même site. Écart = caisse − déclaré.
 */
export default function ReconPanel({ entries, siteLabels }: {
  entries: ReconEntry[]; siteLabels: Record<string, string>;
}) {
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Rapprochement caisse / clôture</h2>
      <p className="mb-3 text-xs text-slate-500">
        Lecture seule : compare le « vendu » déclaré aux ventes caisse du même jour et du même site
        (dernière révision conservée). Écart = caisse − déclaré. Aucun flux n&apos;est modifié.
      </p>
      {entries.length === 0 && <p className="text-sm text-slate-500">Aucune clôture à rapprocher.</p>}
      <div className="space-y-4">
        {entries.map((e) => (
          <div key={e.clotureId} className="rounded-lg border p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
              <b>{e.date}</b>
              <span className="text-slate-500">{siteLabels[e.siteId] ?? e.siteId.slice(0, 8)}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">révision {e.revision}</span>
            </div>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs text-slate-500">
                  <th className="border-b p-1">Produit</th>
                  <th className="border-b p-1 text-right">Déclaré</th>
                  <th className="border-b p-1 text-right">Caisse</th>
                  <th className="border-b p-1 text-right">Écart</th>
                </tr>
              </thead>
              <tbody>
                {e.lignes.map((l) => (
                  <tr key={l.articleId}>
                    <td className="border-b p-1">{l.code}{l.name ? ` — ${l.name}` : ""}</td>
                    <td className="border-b p-1 text-right">{l.declare}</td>
                    <td className="border-b p-1 text-right">{l.caisse}</td>
                    <td className={`border-b p-1 text-right font-bold ${l.ecart === 0 ? "text-emerald-700" : "text-amber-700"}`}>
                      {l.ecart > 0 ? `+${l.ecart}` : l.ecart}
                    </td>
                  </tr>
                ))}
                {e.lignes.length === 0 && (
                  <tr><td colSpan={4} className="p-1 text-slate-500">Aucune ligne.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </section>
  );
}
