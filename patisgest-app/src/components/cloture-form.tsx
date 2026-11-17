"use client";

import { useActionState, useState } from "react";
import { saisirCloture, type JournalState } from "@/lib/actions-journaux";

type Option = { id: string; label: string };
type Row = { articleId: string; produit: string; vendu: string; reporte: string; jete: string; casse: string; offert: string };

const emptyRow = (articleId = ""): Row => ({ articleId, produit: "", vendu: "", reporte: "", jete: "", casse: "", offert: "" });
const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const flows = ["produit", "vendu", "reporte", "jete", "casse", "offert"] as const;

/** Clôture déclarative à six flux — lignes dynamiques, révision serveur. */
export default function ClotureForm({ sites, articles }: { sites: Option[]; articles: Option[] }) {
  const [state, action, pending] = useActionState(saisirCloture, {});
  const [rows, setRows] = useState<Row[]>([emptyRow(articles[0]?.id ?? "")]);
  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Clôture du jour · six flux</h2>
      <p className="mb-3 text-xs text-slate-500">
        Déclaratif : ne modifie ni stocks ni ventes. Les corrections passent par une nouvelle révision
        (case « correction »). Prix figés depuis l&apos;article au moment de la saisie.
      </p>
      <form action={action} className="space-y-3">
        <input type="hidden" name="lineCount" value={rows.length} />
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-40`}>Date
            <input name="date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={field} />
          </label>
          <label className={`${label} min-w-44 flex-1`}>Site
            <select name="siteId" required className={field}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className={`${label} flex items-center gap-2 py-2`}>
            <input name="revise" type="checkbox" className="h-4 w-4" /> Correction (nouvelle révision)
          </label>
          <button type="button" onClick={() => setRows((rs) => [...rs, emptyRow(articles[0]?.id ?? "")])}
            className="rounded-lg border px-3 py-2 text-sm font-bold">+ Produit</button>
        </div>
        {rows.map((row, i) => (
          <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-7">
            <label className={`${label} sm:col-span-2`}>Produit
              <select name={`line${i}_article`} required value={row.articleId} onChange={(e) => update(i, { articleId: e.target.value })} className={field}>
                {articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
              </select>
            </label>
            {flows.map((f) => (
              <label key={f} className={label}>{f}
                <input name={`line${i}_${f}`} type="number" min={0} step="0.0001" required value={row[f]}
                  onChange={(e) => update(i, { [f]: e.target.value } as Partial<Row>)} className={field} />
              </label>
            ))}
            {rows.length > 1 && (
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                className="self-end text-xs font-bold text-red-700">Retirer</button>
            )}
          </div>
        ))}
        <button disabled={pending || articles.length === 0} className={btn}>
          {pending ? "Enregistrement…" : "Enregistrer la clôture"}
        </button>
        {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
        {state.succes && <p role="status" className="text-sm text-emerald-700">{state.succes}</p>}
      </form>
    </section>
  );
}
