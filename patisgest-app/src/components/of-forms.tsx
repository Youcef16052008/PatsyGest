"use client";

import { useActionState } from "react";
import { createOf, finishOf, startOf, type OfState } from "@/lib/actions-of";

type Option = { id: string; label: string };
export type OfOrder = {
  id: string;
  numero: string;
  statut: string;
  qte_prevue: number;
  qte_realisee: number;
};

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

function Feedback({ state }: { state: OfState }) {
  return (
    <>
      {state.erreur && <p role="alert" className="mt-3 text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="mt-3 text-sm text-emerald-700">{state.succes}</p>}
    </>
  );
}

function CreateOfForm({ versions, sites }: { versions: Option[]; sites: Option[] }) {
  const [state, action, pending] = useActionState(createOf, {});
  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <label className={`${label} min-w-52 flex-1`}>Recette (version figée)
        <select name="versionId" required className={field} disabled={versions.length === 0}>
          {versions.length === 0 && <option value="">— aucune recette —</option>}
          {versions.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
        </select>
      </label>
      <label className={`${label} min-w-44 flex-1`}>Site de production
        <select name="siteId" required className={field}>
          {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className={`${label} w-32`}>Quantité prévue
        <input name="qtePrevue" type="number" min={0.0001} step="any" required defaultValue={12} className={field} />
      </label>
      <label className={`${label} w-40`}>Date prévue
        <input name="datePrevue" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} className={field} />
      </label>
      <button disabled={pending || versions.length === 0} className={btn}>
        {pending ? "Création…" : "Planifier l'OF"}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function StartOfButton({ ofId, numero }: { ofId: string; numero: string }) {
  const [state, action, pending] = useActionState(startOf, {});
  return (
    <form action={action} className="mt-2">
      <input type="hidden" name="ofId" value={ofId} />
      <button disabled={pending} className={btn}>
        {pending ? "Lancement…" : `Lancer ${numero} et consommer (FEFO)`}
      </button>
      <Feedback state={state} />
    </form>
  );
}

function FinishOfForm({ order }: { order: OfOrder }) {
  const [state, action, pending] = useActionState(finishOf, {});
  const reste = Number(order.qte_prevue) - Number(order.qte_realisee);
  return (
    <form action={action} className="mt-3 grid gap-2 sm:grid-cols-4">
      <input type="hidden" name="ofId" value={order.id} />
      <input name="qte" type="number" min={0.0001} max={reste} step="any" required defaultValue={reste}
        className={field} aria-label={`Quantité réalisée ${order.numero}`} />
      <input name="numeroLot" required placeholder="N° lot produit" className={field}
        aria-label={`Lot produit ${order.numero}`} />
      <input name="dlc" type="date" required className={field} aria-label={`DLC ${order.numero}`} />
      <button disabled={pending} className={btn}>{pending ? "Enregistrement…" : "Valider la production"}</button>
      <div className="sm:col-span-4"><Feedback state={state} /></div>
    </form>
  );
}

/**
 * Écritures réelles de la page Production (RPCs SQL) : création avec besoins
 * figés, lancement FEFO, clôture au coût connu. Réservé propriétaire/labo.
 */
export default function OfForms({ versions, sites, orders }: { versions: Option[]; sites: Option[]; orders: OfOrder[] }) {
  const planifies = orders.filter((o) => o.statut === "planifie");
  const enCours = orders.filter((o) => o.statut === "encours" || o.statut === "partiel");
  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Ordres de fabrication · écritures réelles</h2>
      <p className="mb-3 text-xs text-slate-500">
        Les besoins sont recalculés côté serveur à partir de la version de recette ; le lancement
        consomme les lots en FEFO dans une transaction ; la clôture crée le lot produit au coût connu.
        Les manques sont journalisés sans jamais bloquer la production.
      </p>
      <CreateOfForm versions={versions} sites={sites} />
      {planifies.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">À lancer</h3>
          {planifies.map((o) => <StartOfButton key={o.id} ofId={o.id} numero={o.numero} />)}
        </div>
      )}
      {enCours.length > 0 && (
        <div className="mt-4 border-t pt-3">
          <h3 className="mb-1 text-xs font-bold uppercase text-slate-500">À clôturer</h3>
          {enCours.map((o) => (
            <div key={o.id} className="mb-3">
              <p className="text-sm font-semibold">{o.numero} — réalisé {String(o.qte_realisee)} / {String(o.qte_prevue)}</p>
              <FinishOfForm order={o} />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
