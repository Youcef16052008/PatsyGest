"use client";

import { useActionState } from "react";
import { transferReal, type TransferState } from "@/lib/actions-stock";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

/** Transfert réel entre sites (RPC FEFO + lots miroirs) — propriétaire/labo. */
export default function TransferForm({ articles, sites }: { articles: Option[]; sites: Option[] }) {
  const [state, action, pending] = useActionState(transferReal, {});
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Transfert entre sites · réel</h2>
      <p className="mb-3 text-xs text-slate-500">
        Consomme les lots éligibles en FEFO sur le site de départ (lots bloqués et DLC dépassée exclus) et recrée
        des lots miroirs (même n°, DLC, prix) à l’arrivée. Un transfert supérieur au stock éligible est refusé.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-52 flex-1`}>Article
          <select name="articleId" required className={field} disabled={articles.length === 0}>
            {articles.length === 0 && <option value="">— aucun article —</option>}
            {articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-44 flex-1`}>De
          <select name="fromSiteId" required className={field}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-44 flex-1`}>Vers
          <select name="toSiteId" required className={field} defaultValue={sites[1]?.id ?? sites[0]?.id}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={`${label} w-32`}>Quantité
          <input name="qte" type="number" min={0.0001} step="any" required className={field} />
        </label>
        <label className={`${label} min-w-40 flex-1`}>Motif (optionnel)
          <input name="motif" maxLength={120} placeholder="Réassort vitrine, événement…" className={field} />
        </label>
        <label className={`${label} min-w-40 flex-1`}>Responsable (optionnel)
          <input name="responsable" maxLength={100} placeholder="Ex. Chef Karim → Vitrine" className={field} />
        </label>
        <button disabled={pending || articles.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "Transfert…" : "Transférer"}
        </button>
      </form>
      {state.erreur && <p role="alert" className="mt-3 text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="mt-3 text-sm text-emerald-700">{state.succes}</p>}
    </section>
  );
}
