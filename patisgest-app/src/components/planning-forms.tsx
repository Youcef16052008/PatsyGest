"use client";

import { useActionState } from "react";
import { addTask, toggleTask } from "@/lib/actions-planning";
import { type JournalState } from "@/lib/journal-actions-communs";
import { jourLocal } from "@/lib/workspace-data";

export type TaskRow = { id: string; date: string; tache: string; ofNumero: string; fait: boolean };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const aujourdhui = () => jourLocal();

/** Planning : ajout de tâches et bascule fait (écritures réelles). */
export default function PlanningForms({ tasks, ofNumeros }: { tasks: TaskRow[]; ofNumeros: string[] }) {
  const [createState, createAction, pending] = useActionState(addTask, {});
  const [toggleState, toggleAction, togglePending] = useActionState(toggleTask, {});
  const tri = [...tasks].sort((a, b) => (a.date === b.date ? a.tache.localeCompare(b.tache) : a.date.localeCompare(b.date)));
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-3 font-bold">Planning de production</h2>
      <form action={createAction} className="mb-4 flex flex-wrap items-end gap-3 border-b pb-4">
        <label className={`${label} w-36`}>Date<input name="date" type="date" required defaultValue={aujourdhui()} className={field} /></label>
        <label className={`${label} min-w-52 flex-1`}>Tâche<input name="tache" required maxLength={100} placeholder="Préparer la crème" className={field} /></label>
        <label className={`${label} w-36`}>OF (opt.)
          <input name="ofNumero" list="of-list" maxLength={80} placeholder="OF-002" className={field} />
          <datalist id="of-list">{ofNumeros.map((o) => <option key={o} value={o} />)}</datalist>
        </label>
        <label className={`${label} w-28`}>Durée (min)<input name="dureeMin" type="number" min={0} required defaultValue={30} className={field} /></label>
        <label className={`${label} w-36`}>Responsable<input name="responsable" maxLength={100} className={field} /></label>
        <button disabled={pending} className={btn}>{pending ? "…" : "Ajouter"}</button>
        {createState.erreur && <p role="alert" className="text-sm text-red-700">{createState.erreur}</p>}
        {createState.succes && <p role="status" className="text-sm text-emerald-700">{createState.succes}</p>}
      </form>
      <ul className="space-y-1">
        {tri.map((t) => (
          <li key={t.id} className="flex items-center gap-3 rounded-lg border p-2 text-sm">
            <form action={toggleAction} className="flex items-center gap-3">
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="fait" value={t.fait ? "false" : "true"} />
              <input type="checkbox" defaultChecked={t.fait} disabled={togglePending} className="h-4 w-4 cursor-pointer" title="Cliquer pour basculer" onClick={(e) => { e.currentTarget.form?.requestSubmit(); }} />
            </form>
            <b className={t.fait ? "line-through opacity-60" : ""}>{t.tache}</b>
            <span className="text-xs text-slate-500">{t.date}{t.ofNumero ? ` · ${t.ofNumero}` : ""}</span>
          </li>
        ))}
        {tri.length === 0 && <li className="text-sm text-slate-500">Aucune tâche.</li>}
      </ul>
      {toggleState.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{toggleState.erreur}</p>}
      {toggleState.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{toggleState.succes}</p>}
    </section>
  );
}
