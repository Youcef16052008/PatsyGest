"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ficheCoutReal, sauverParamsCoutsReal, type CoutsState } from "@/lib/actions-couts";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50";
const da = (n: number) => `${Number(n).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DA`;

/**
 * Fiche de coût RC-01..RC-10 : formules gravées du cahier §4,
 * matières FEFO (parage inclus), paramètres RC-04, marge sur HT.
 */
export default function CostSheetForm({ produits }: { produits: Option[] }) {
  const [state, action, pending] = useActionState(ficheCoutReal, {});
  const [pState, pAction, pPending] = useActionState(sauverParamsCoutsReal, {});

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Paramètres de coûts (RC-04)</h2>
        <p className="mb-3 text-xs text-slate-500">
          Taux horaire et charges appliqués à la MO chargée : <b>(min ÷60) × taux × (1 + charges %)</b>.
        </p>
        <form action={pAction} className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-44`}>Taux horaire (DA)
            <input name="tauxHoraire" type="number" step="any" min={0} required
              defaultValue={state.tauxHoraire ?? 400} className={field} />
          </label>
          <label className={`${label} w-40`}>Charges (%)
            <input name="chargesPct" type="number" step="any" min={0} max={1000} required
              defaultValue={state.chargesPct ?? 25} className={field} />
          </label>
          <button disabled={pPending} className={btn2}>{pPending ? "…" : "Enregistrer"}</button>
          {pState.erreur && <p role="alert" className="text-sm text-red-700">{pState.erreur}</p>}
          {pState.succes && <p role="status" className="text-sm text-emerald-700">{pState.succes}</p>}
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold">Fiche de coût (RC-01 → RC-10)</h2>
          <div className="flex flex-wrap gap-3 text-xs font-bold text-violet-700">
            <Link href="/simulation#hausse-matiere" className="underline">Impact hausse matière →</Link>
            <Link href="/estimation" className="underline">Calculateur parts &amp; moules →</Link>
          </div>
        </div>
        <p className="mb-3 text-xs text-slate-500">
          Version active du produit · matières au coût <b>FEFO</b> avec parage (RC-01) ·
          cuisson déduite du rendement (RC-02) · <b>jamais de TVA dans le coût</b> (RC-05) ·
          marge toujours sur <b>PV HT</b> (RC-06).
        </p>
        <form action={action} className="flex flex-wrap items-end gap-3">
          <label className={`${label} min-w-56 flex-1`}>Produit
            <select name="produitId" required className={field}>
              {produits.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <label className={`${label} w-32`}>Quantité
            <input name="qte" type="number" step="any" min={0.0001} required defaultValue={40} className={field} />
          </label>
          <label className={`${label} w-24`}>Jeté
            <input name="jete" type="number" step="any" min={0} defaultValue={0} className={field} />
          </label>
          <label className={`${label} w-24`}>Casse
            <input name="casse" type="number" step="any" min={0} defaultValue={0} className={field} />
          </label>
          <label className={`${label} w-28`}>Fabriqué
            <input name="fabrique" type="number" step="any" min={0} defaultValue={0} className={field} />
          </label>
          <label className={`${label} w-40`}>Coût de référence (RC-10)
            <input name="reference" type="number" step="any" min={0} placeholder="optionnel" className={field} />
          </label>
          <button disabled={pending || produits.length === 0} className={btn}>
            {pending ? "Calcul…" : "Calculer la fiche"}
          </button>
        </form>
        {state.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{state.erreur}</p>}
      </section>

      {state.total !== undefined && (
        <section className="space-y-3 rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-baseline gap-3">
            <h3 className="font-bold">{state.famille}</h3>
            <span className="text-sm text-slate-500">
              version {state.version} · rendement {state.rendement} · quantité {state.produit ? "" : ""}
            </span>
            {state.succes && <span className="text-xs font-bold text-emerald-700">{state.succes}</span>}
          </div>

          <div className="overflow-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-500">
                  <th className="border-b p-2">Ligne</th>
                  <th className="border-b p-2 text-right">Besoin</th>
                  <th className="border-b p-2 text-right">Couvert FEFO</th>
                  <th className="border-b p-2 text-right">Coût matière</th>
                </tr>
              </thead>
              <tbody>
                {(state.lignes ?? []).map((l) => (
                  <tr key={l.code}>
                    <td className="border-b p-2">{l.code} · {l.nom}</td>
                    <td className="border-b p-2 text-right">{l.qty} {l.unit}</td>
                    <td className="border-b p-2 text-right">{l.couvert} {l.unit}{l.insuffisant ? " ⚠" : ""}</td>
                    <td className="border-b p-2 text-right">{l.cout.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border p-3 text-sm">
              <h4 className="text-xs font-bold uppercase text-slate-500">RC-03 — Coût total</h4>
              <ul className="mt-1 space-y-0.5">
                <li className="flex justify-between"><span>Matières FEFO (RC-01+RC-09)</span><b>{da(state.matiere ?? 0)}</b></li>
                <li className="flex justify-between"><span>Emballage</span><b>{da(state.emballage ?? 0)}</b></li>
                <li className="flex justify-between"><span>MO chargée (RC-04)</span><b>{da(state.mo ?? 0)}</b></li>
                <li className="flex justify-between"><span>Énergie</span><b>{da(state.energie ?? 0)}</b></li>
                <li className="flex justify-between"><span>Frais généraux</span><b>{da(state.fraisGeneraux ?? 0)}</b></li>
                <li className="flex justify-between border-t pt-1 text-base font-black"><span>Total</span><span>{da(state.total ?? 0)}</span></li>
              </ul>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <h4 className="text-xs font-bold uppercase text-slate-500">RC-02 · RC-05 · RC-06</h4>
              <ul className="mt-1 space-y-0.5">
                <li className="flex justify-between"><span>Rendement net (RC-02)</span><b>{state.net} {state.rendement?.split(" ")[1]}</b></li>
                <li className="flex justify-between"><span>Coût / portion (RC-05)</span><b>{da(state.portion ?? 0)}</b></li>
                <li className="flex justify-between"><span>PV HT</span><b>{da(state.pvHt ?? 0)}</b></li>
                <li className="flex justify-between"><span>Marge (RC-06)</span><b className={ (state.marge ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}>{da(state.marge ?? 0)}</b></li>
                <li className="flex justify-between border-t pt-1 text-base font-black"><span>Taux de marge</span>
                  <span>{(((state.taux ?? 0) * 100)).toFixed(2)} %</span></li>
              </ul>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <h4 className="text-xs font-bold uppercase text-slate-500">RC-07 · RC-08 — Pertes</h4>
              <ul className="mt-1 space-y-0.5">
                <li className="flex justify-between"><span>Taux de perte (jeté+casse÷fabriqué)</span>
                  <b>{(((state.perte?.taux ?? 0) * 100)).toFixed(2)} %</b></li>
                <li className="flex justify-between"><span>Manque à gagner (× PV HT)</span><b>{da(state.perte?.manque ?? 0)}</b></li>
                <li className="text-xs text-slate-500">Source : {state.perte?.source ?? "—"}</li>
              </ul>
            </div>
            <div className="rounded-lg border p-3 text-sm">
              <h4 className="text-xs font-bold uppercase text-slate-500">RC-10 — Garde-fous (non bloquants)</h4>
              {(state.gardeFous ?? []).length === 0 ? (
                <p className="mt-1 text-emerald-700">Aucune anomalie détectée.</p>
              ) : (
                <ul className="mt-1 space-y-1">
                  {(state.gardeFous ?? []).map((g) => (
                    <li key={g.code} className="text-amber-700">⚠ {g.message}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Formules RC-01..RC-10 gravées et testées automatiquement (10 recettes de référence au centime).
          </p>
        </section>
      )}
    </div>
  );
}
