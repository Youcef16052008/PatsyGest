"use client";

import { useActionState } from "react";
import { addCleaning, addNc, addTemperature, updateNc, type JournalState } from "@/lib/actions-journaux";

type Option = { id: string; label: string };
export type NcRow = { id: string; statut: string; type: string; description: string; action: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const today = new Date().toISOString().slice(0, 10);

function Feedback({ state }: { state: JournalState }) {
  return (
    <>
      {state.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{state.succes}</p>}
    </>
  );
}

function TemperatureForm() {
  const [state, action, pending] = useActionState(addTemperature, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className={`${label} w-36`}>Date<input name="date" type="date" required defaultValue={today} className={field} /></label>
      <label className={`${label} w-28`}>Frigo (id)<input name="frigoId" maxLength={40} placeholder="F1" className={field} /></label>
      <label className={`${label} min-w-40 flex-1`}>Équipement<input name="frigoNom" required maxLength={80} placeholder="Frigo laboratoire" className={field} /></label>
      <label className={`${label} w-28`}>Seuil max °C<input name="seuilMax" type="number" step="any" required defaultValue={4} className={field} /></label>
      <label className={`${label} w-28`}>Température °C<input name="temperature" type="number" step="any" required className={field} /></label>
      <label className={`${label} w-36`}>Agent<input name="agent" maxLength={80} className={field} /></label>
      <button disabled={pending} className={btn}>{pending ? "…" : "Relever"}</button>
      <Feedback state={state} />
    </form>
  );
}

function CleaningForm() {
  const [state, action, pending] = useActionState(addCleaning, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className={`${label} w-36`}>Date<input name="date" type="date" required defaultValue={today} className={field} /></label>
      <label className={`${label} min-w-40 flex-1`}>Zone<input name="zone" required maxLength={80} placeholder="Plan de travail" className={field} /></label>
      <label className={`${label} flex items-center gap-2 py-2`}><input name="fait" type="checkbox" defaultChecked className="h-4 w-4" /> Fait</label>
      <label className={`${label} w-36`}>Agent<input name="agent" maxLength={80} className={field} /></label>
      <button disabled={pending} className={btn}>{pending ? "…" : "Enregistrer"}</button>
      <Feedback state={state} />
    </form>
  );
}

function NcForm() {
  const [state, action, pending] = useActionState(addNc, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className={`${label} w-36`}>Date<input name="date" type="date" required defaultValue={today} className={field} /></label>
      <label className={`${label} w-40`}>Type<input name="type" required maxLength={80} placeholder="T°, hygiene…" className={field} /></label>
      <label className={`${label} min-w-52 flex-1`}>Description<input name="description" required maxLength={500} className={field} /></label>
      <label className={`${label} w-36`}>N° lot (opt.)<input name="lotNumero" maxLength={80} className={field} /></label>
      <label className={`${label} min-w-40 flex-1`}>Action (opt.)<input name="action" maxLength={500} className={field} /></label>
      <button disabled={pending} className={btn}>{pending ? "…" : "Ouvrir la NC"}</button>
      <Feedback state={state} />
    </form>
  );
}

function NcActions({ ncs }: { ncs: NcRow[] }) {
  const [state, action, pending] = useActionState(updateNc, {});
  const ouvertes = ncs.filter((n) => ["ouverte", "Ouverte"].includes(n.statut));
  const cloturees = ncs.filter((n) => !["ouverte", "Ouverte"].includes(n.statut));
  if (ncs.length === 0) return null;
  return (
    <form action={action} className="mt-4 border-t pt-3">
      <h3 className="mb-2 text-xs font-bold uppercase text-slate-500">Non-conformités</h3>
      <div className="space-y-2">
        {[...ouvertes, ...cloturees].map((n) => (
          <div key={n.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-2 text-sm">
            <b>{n.type}</b>
            <span className="flex-1">{n.description}</span>
            <span className={`font-bold ${n.statut === "ouverte" || n.statut === "Ouverte" ? "text-amber-700" : "text-emerald-700"}`}>{n.statut}</span>
            <input type="hidden" name="id" value={n.id} />
            {n.statut === "ouverte" || n.statut === "Ouverte" ? (
              <>
                <input name="action" maxLength={500} placeholder="Action corrective (requis)" className={`${field} mt-0 min-w-52 flex-1`} />
                <input type="hidden" name="statut" value="cloturee" />
                <button disabled={pending} className={btn}>Clôturer</button>
              </>
            ) : (
              <>
                <input type="hidden" name="action" value="" />
                <input type="hidden" name="statut" value="ouverte" />
                <button disabled={pending} className="rounded-lg border px-3 py-2 text-sm font-bold">Rouvrir</button>
              </>
            )}
          </div>
        ))}
      </div>
      <Feedback state={state} />
    </form>
  );
}

/** Registre HACCP : relevés, nettoyages, non-conformités avec clôture tracée. */
export default function QualityForms({ ncs }: { ncs: NcRow[] }) {
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">HACCP &amp; qualité · écritures réelles</h2>
      <p className="mb-3 text-xs text-slate-500">
        Seuils saisis à titre indicatif — pas une recommandation réglementaire. Une action corrective
        est requise pour clôturer une non-conformité ; l&apos;historique est conservé.
      </p>
      <div className="space-y-4">
        <TemperatureForm />
        <CleaningForm />
        <NcForm />
        <NcActions ncs={ncs} />
      </div>
    </section>
  );
}
