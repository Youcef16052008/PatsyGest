import type { CashReconEntry, ReconEntry } from "@/lib/reconciliation";
import { dinars, quantite } from "@/lib/workspace-data";

/**
 * Rapprochement de fin de journée (lecture seule) en deux bilans séparés :
 * 1) Bilan PRODUITS (quantités : vendu déclaré vs sorties de caisse du jour/site).
 * 2) Bilan TIROIR-CAISSE (DA TTC : fond initial + ventes espèces − sorties justifiées
 *    = espèces attendues vs espèces comptées ; carte, chèque/virement et imports Z à part).
 */
export default function ReconPanel({
  entries,
  cashEntries = [],
  siteLabels,
  ventesTronquees = false,
  ventesChargees,
}: {
  entries: ReconEntry[];
  cashEntries?: CashReconEntry[];
  siteLabels: Record<string, string>;
  ventesTronquees?: boolean;
  ventesChargees?: number;
}) {
  const cashByCloture = new Map(cashEntries.map((c) => [c.clotureId, c]));

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Rapprochement fin de journée · produits &amp; tiroir-caisse</h2>
      <p className="mb-3 text-xs text-slate-500">
        Lecture seule (dernière révision par date et site). Les écarts de quantités produits et les écarts
        d&apos;espèces en tiroir sont calculés et présentés séparément. Aucun stock ni vente n&apos;est modifié.
      </p>
      {ventesTronquees && (
        <div
          role="alert"
          className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
        >
          <strong>Attention — période très volumineuse :</strong> le rapprochement porte sur les{" "}
          {ventesChargees != null ? ventesChargees.toLocaleString("fr-DZ") : "premiers"} tickets chargés ; les
          clôtures les plus anciennes peuvent être partielles.
        </div>
      )}
      {entries.length === 0 && <p className="text-sm text-slate-500">Aucune clôture à rapprocher.</p>}
      <div className="space-y-4">
        {entries.map((e) => {
          const cb = cashByCloture.get(e.clotureId);
          const hasHorsEspeces =
            cb != null &&
            (cb.ventesCarteTTC > 0 ||
              cb.ventesAutreTTC > 0 ||
              cb.ventesImportZTTC > 0 ||
              cb.ventesModeNonPreciseTTC > 0);
          return (
            <div key={e.clotureId} className="space-y-3 rounded-xl border p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <b>{e.date}</b>
                <span className="text-slate-500">{siteLabels[e.siteId] ?? e.siteId.slice(0, 8)}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold">
                  révision {e.revision}
                </span>
                {cb && (
                  <span className="text-xs text-slate-500">
                    · {cb.nbTicketsCaisse} ticket{cb.nbTicketsCaisse > 1 ? "s" : ""} caisse
                  </span>
                )}
              </div>

              <div>
                <h3 className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-500">
                  1. Bilan produits (quantités · écart = caisse − déclaré)
                </h3>
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500">
                      <th className="border-b p-1">Produit</th>
                      <th className="border-b p-1 text-right">Vendu déclaré</th>
                      <th className="border-b p-1 text-right">Vendu caisse</th>
                      <th className="border-b p-1 text-right">Écart qté</th>
                    </tr>
                  </thead>
                  <tbody>
                    {e.lignes.map((l) => (
                      <tr key={l.articleId}>
                        <td className="border-b p-1">
                          {l.code}
                          {l.name && l.name !== l.code ? ` — ${l.name}` : ""}
                        </td>
                        <td className="border-b p-1 text-right">{quantite(l.declare)}</td>
                        <td className="border-b p-1 text-right">{quantite(l.caisse)}</td>
                        <td
                          className={`border-b p-1 text-right font-bold ${
                            l.ecart === 0 ? "text-emerald-700" : "text-amber-700"
                          }`}
                        >
                          {l.ecart > 0 ? `+${quantite(l.ecart)}` : quantite(l.ecart)}
                        </td>
                      </tr>
                    ))}
                    {e.lignes.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-1 text-slate-500">
                          Aucune ligne produit.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-600">
                  2. Bilan tiroir-caisse (DA TTC · séparé des quantités)
                </h3>
                {!cb ? (
                  <p className="text-xs text-slate-500">
                    Comptage tiroir non renseigné pour cette clôture (saisissez fond initial et espèces comptées
                    pour calculer l&apos;écart espèces).
                  </p>
                ) : (
                  <>
                    <div className="grid gap-2 text-xs sm:grid-cols-6">
                      <div className="rounded bg-white p-2">
                        <span className="text-slate-500">Fond initial</span>
                        <div className="font-bold">{dinars(cb.fondInitial)}</div>
                      </div>
                      <div className="rounded bg-white p-2">
                        <span className="text-slate-500">Ventes espèces</span>
                        <div className="font-bold">+{dinars(cb.ventesEspecesTTC)}</div>
                      </div>
                      <div className="rounded bg-white p-2">
                        <span className="text-slate-500">Sorties espèces</span>
                        <div className="font-bold">−{dinars(cb.sortiesEspeces)}</div>
                      </div>
                      <div className="rounded bg-white p-2">
                        <span className="text-slate-500">Attendu tiroir</span>
                        <div className="font-bold">{dinars(cb.attenduTiroir)}</div>
                      </div>
                      <div className="rounded bg-white p-2">
                        <span className="text-slate-500">Espèces comptées</span>
                        <div className="font-bold">{dinars(cb.especesComptees)}</div>
                      </div>
                      <div className="rounded bg-white p-2">
                        <span className="text-slate-500">Écart tiroir</span>
                        <div
                          className={`font-bold ${
                            cb.ecartEspeces === 0
                              ? "text-emerald-700"
                              : cb.ecartEspeces < 0
                                ? "text-red-700"
                                : "text-amber-700"
                          }`}
                        >
                          {cb.ecartEspeces > 0 ? `+${dinars(cb.ecartEspeces)}` : dinars(cb.ecartEspeces)}
                        </div>
                      </div>
                    </div>
                    {hasHorsEspeces && (
                      <p className="mt-2 text-xs text-slate-600">
                        <strong>Encaissements hors tiroir espèces :</strong>
                        {cb.ventesCarteTTC > 0 && ` Carte / CIB ${dinars(cb.ventesCarteTTC)} ·`}
                        {cb.ventesAutreTTC > 0 && ` Chèque / virement ${dinars(cb.ventesAutreTTC)} ·`}
                        {cb.ventesImportZTTC > 0 && ` Import Z externe ${dinars(cb.ventesImportZTTC)} ·`}
                        {cb.ventesModeNonPreciseTTC > 0 &&
                          ` Tickets sans mode précisé ${dinars(cb.ventesModeNonPreciseTTC)}`}
                      </p>
                    )}
                    {cb.motifSortie && (
                      <p className="mt-1 text-xs text-slate-600">
                        <strong>Motif / note :</strong> {cb.motifSortie}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
