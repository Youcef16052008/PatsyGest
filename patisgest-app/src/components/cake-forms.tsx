"use client";

import { useActionState, useState } from "react";
import { createCakeReal, evolveCakeReal, type JournalState } from "@/lib/actions-journaux";

export type CakeRow = { id: string; numero: string; statut: string; clientNom: string; prixHt: number; acompte: number };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50";

type Opt = { name: string; cout: string; minutes: string };

/** Cake Design : devis (tous rôles), rétroplanning, paiements et transitions verrouillées. */
export default function CakeForms({ cakes }: { cakes: CakeRow[] }) {
  const [createState, createAction, pending] = useActionState(createCakeReal, {});
  const [evolveState, evolveAction, evolvePending] = useActionState(evolveCakeReal, {});
  const [opts, setOpts] = useState<Opt[]>([]);
  const [payId, setPayId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const sorted = [...cakes].sort((a, b) => a.numero.localeCompare(b.numero));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Nouveau devis gâteau</h2>
        <p className="mb-3 text-xs text-slate-500">
          Rétroplanning J-3 / J-1 / J automatique · transition à l&apos;acompte (30 %) pour passer en confirmé ·
          solde exigé avant livraison · historique de paiements conservé.
        </p>
        <form action={createAction} className="space-y-3">
          <input type="hidden" name="optionCount" value={opts.length} />
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${label} min-w-44 flex-1`}>Client<input name="clientNom" required maxLength={100} className={field} /></label>
            <label className={`${label} w-40`}>Téléphone<input name="telephone" maxLength={40} className={field} /></label>
            <label className={`${label} w-44`}>Date événement<input name="dateEvent" type="date" min="2000-01-04" required className={field} /></label>
            <label className={`${label} w-28`}>Parts<input name="nbParts" type="number" min={1} max={10000} required defaultValue={10} className={field} /></label>
            <label className={`${label} w-36`}>Prix HT (DA)<input name="prixHt" type="number" step="any" min={0.01} required className={field} /></label>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${label} flex items-center gap-2 py-2`}><input name="cgv" type="checkbox" defaultChecked className="h-4 w-4" /> CGV acceptées</label>
            <label className={`${label} min-w-52 flex-1`}>Notes<textarea name="notes" maxLength={500} rows={2} className={field} /></label>
            <button type="button" onClick={() => setOpts((o) => [...o, { name: "", cout: "", minutes: "" }])}
              className="rounded-lg border px-3 py-2 text-sm font-bold">+ Option</button>
          </div>
          {opts.map((o, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-lg border p-2">
              <label className={`${label} min-w-44 flex-1`}>Nom<input name={`opt${i}_name`} required maxLength={100} value={o.name}
                onChange={(e) => setOpts((os) => os.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={field} /></label>
              <label className={`${label} w-32`}>Coût (DA)<input name={`opt${i}_cout`} type="number" step="any" min={0} required value={o.cout}
                onChange={(e) => setOpts((os) => os.map((x, j) => (j === i ? { ...x, cout: e.target.value } : x)))} className={field} /></label>
              <label className={`${label} w-32`}>Minutes<input name={`opt${i}_minutes`} type="number" min={0} required value={o.minutes}
                onChange={(e) => setOpts((os) => os.map((x, j) => (j === i ? { ...x, minutes: e.target.value } : x)))} className={field} /></label>
              <button type="button" onClick={() => setOpts((os) => os.filter((_, j) => j !== i))} className="py-2 text-xs font-bold text-red-700">Retirer</button>
            </div>
          ))}
          <button disabled={pending} className={btn}>{pending ? "Création…" : "Créer le devis"}</button>
          {createState.erreur && <p role="alert" className="text-sm text-red-700">{createState.erreur}</p>}
          {createState.succes && <p role="status" className="text-sm text-emerald-700">{createState.succes}</p>}
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-bold">Devis &amp; commandes en cours</h2>
        <form action={evolveAction} className="space-y-3">
          <input type="hidden" name="id" value={payId} />
          <ul className="space-y-2">
            {sorted.map((c) => (
              <li key={c.id} className={`rounded-lg border p-3 text-sm ${payId === c.id ? "border-violet-500 ring-1 ring-violet-500" : ""}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setPayId(c.id)} className="font-bold text-violet-800 underline">{c.numero}</button>
                  <span>{c.clientNom}</span>
                  <span className="text-slate-500">{Number(c.prixHt).toLocaleString("fr-FR")} DA HT</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold uppercase text-xs">{c.statut}</span>
                  <span className="text-xs text-slate-500">versé {Number(c.acompte).toLocaleString("fr-FR")} DA</span>
                  <span className="ml-auto flex gap-1">
                    {["payer", "confirme", "produit", "livre", "annule"].map((t) => (
                      <button key={t} type="submit" name="transition" value={t} disabled={evolvePending || payId !== c.id}
                        className={btn2}>{t === "confirme" ? "confirmer" : t === "produit" ? "produire" : t === "livre" ? "livrer" : t === "annule" ? "annuler" : "payer"}</button>
                    ))}
                  </span>
                </div>
                {payId === c.id && (
                  <label className={`${label} mt-2 max-w-64`}>Montant du paiement (DA)
                    <input name="montant" type="number" step="any" min={0.01} required className={`${field} mt-0`} />
                  </label>
                )}
              </li>
            ))}
            {sorted.length === 0 && <li className="text-sm text-slate-500">Aucun devis.</li>}
          </ul>
          {evolveState.erreur && <p role="alert" className="text-sm text-red-700">{evolveState.erreur}</p>}
          {evolveState.succes && <p role="status" className="text-sm text-emerald-700">{evolveState.succes}</p>}
        </form>
      </section>
    </div>
  );
}
