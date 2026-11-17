"use client";

import { useActionState } from "react";
import { simulerReal, type SimulationState } from "@/lib/actions-simulation";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

/**
 * Simulation de prix liée aux opérations réelles : version active du
 * produit, besoins étendus (sous-recettes + conversions), coût FEFO.
 */
export default function SimulationForm({ produits }: { produits: Option[] }) {
  const [state, action, pending] = useActionState(simulerReal, {});

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Simulation de prix (réelle)</h2>
        <p className="mb-3 text-xs text-slate-500">
          La simulation utilise la <b>version active</b> de la recette (sous-recettes et
          conversions incluses) et le <b>coût FEFO</b> des lots réellement disponibles —
          pas des valeurs figées de la démo.
        </p>
        <form action={action} className="flex flex-wrap items-end gap-3">
          <label className={`${label} min-w-64 flex-1`}>Produit fini
            <select name="produitId" required className={field}>
              {produits.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className={`${label} w-36`}>Quantité
            <input name="qte" type="number" step="any" min={0.0001} required defaultValue={40} className={field} />
          </label>
          <button disabled={pending || produits.length === 0}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {pending ? "Calcul…" : "Simuler"}
          </button>
        </form>
        {state.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{state.erreur}</p>}
      </section>

      {state.rows && (
        <section className="rounded-2xl border bg-white p-5">
          <div className="mb-3 flex flex-wrap items-baseline gap-3">
            <h3 className="font-bold">{state.famille}</h3>
            <span className="text-sm text-slate-500">
              version {state.version} · rendement {state.rendement} · demande {state.qte}
            </span>
            {state.succes && <span className="text-xs font-bold text-emerald-700">{state.succes}</span>}
          </div>
          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="border-b p-2">Article</th>
                  <th className="border-b p-2 text-right">Besoin</th>
                  <th className="border-b p-2 text-right">Couvert FEFO</th>
                  <th className="border-b p-2 text-right">Coût (DA)</th>
                  <th className="border-b p-2">État</th>
                </tr>
              </thead>
              <tbody>
                {state.rows.map((r) => (
                  <tr key={r.articleId}>
                    <td className="border-b p-2">{r.code} · {r.nom}</td>
                    <td className="border-b p-2 text-right">{r.qty} {r.unit}</td>
                    <td className="border-b p-2 text-right">{r.couvert} {r.unit}</td>
                    <td className="border-b p-2 text-right">{r.cout.toFixed(2)}</td>
                    <td className="border-b p-2 text-xs">
                      {r.insuffisant
                        ? <span className="font-bold text-amber-700">stock partiel</span>
                        : <span className="text-emerald-700">ok</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-bold">
                  <td className="p-2" colSpan={3}>Total (coût connu FEFO)</td>
                  <td className="p-2 text-right">{state.total?.toFixed(2)} DA</td>
                  <td />
                </tr>
                <tr className="font-bold text-violet-700">
                  <td className="p-2" colSpan={3}>Coût unitaire simulé</td>
                  <td className="p-2 text-right">{state.coutUnite?.toFixed(4)} DA / {state.rendement?.split(" ")[1] ?? "unité"}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Coût connu uniquement (matières FEFO) : main-d&apos;œuvre et hors-œuvre viennent
            au Sprint3 avec les formules RC-01..06.
          </p>
        </section>
      )}
    </div>
  );
}
