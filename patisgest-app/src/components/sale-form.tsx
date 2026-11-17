"use client";

import { useActionState } from "react";
import { sellProduct } from "@/lib/actions-caisse";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";

/** Vente de caisse réelle (RPC FEFO atomique) — tous les rôles authentifiés. */
export default function SaleForm({ articles, sites }: { articles: Option[]; sites: Option[] }) {
  const [state, action, pending] = useActionState(sellProduct, {});
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Nouvelle vente · caisse réelle</h2>
      <p className="mb-3 text-xs text-slate-500">
        Consomme le stock en FEFO dans une transaction, journalise les mouvements et signale
        les manques sans jamais rendre le stock négatif. Les ventes ne sont pas modifiables.
      </p>
      <form action={action} className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-52 flex-1`}>Produit
          <select name="articleId" required className={field} disabled={articles.length === 0}>
            {articles.length === 0 && <option value="">— aucun produit —</option>}
            {articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-44 flex-1`}>Site
          <select name="siteId" required className={field}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
        <label className={`${label} w-32`}>Quantité
          <input name="qte" type="number" min={0.0001} step="any" required defaultValue={1} className={field} />
        </label>
        <button disabled={pending || articles.length === 0} className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {pending ? "Encaissement…" : "Encaisser"}
        </button>
      </form>
      {state.erreur && <p role="alert" className="mt-3 text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="mt-3 text-sm text-emerald-700">{state.succes}</p>}
    </section>
  );
}
