"use client";

import { useActionState } from "react";
import {
  bloquerLotReal, debloquerLotReal, rappelLotReal,
  type RappelReport, type RappelState,
} from "@/lib/actions-rappel";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50";

function Feedback({ state }: { state: RappelState }) {
  return (
    <>
      {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="text-sm text-emerald-700">{state.succes}</p>}
    </>
  );
}

function Bloc({ titre, vide, items }: { titre: string; vide: string; items: React.ReactNode }) {
  return (
    <div className="rounded-lg border p-3">
      <h4 className="text-xs font-bold uppercase text-slate-500">{titre}</h4>
      <div className="mt-1 text-sm">{items || <span className="text-slate-400">{vide}</span>}</div>
    </div>
  );
}

/** Rapport de rappel d'un lot + blocage/déblocage en cascade. */
export default function RecallForm({ lots }: { lots: Option[] }) {
  const [rState, rAction, rPending] = useActionState(rappelLotReal, {});
  const [bState, bAction, bPending] = useActionState(bloquerLotReal, {});
  const [dState, dAction, dPending] = useActionState(debloquerLotReal, {});
  const report: RappelReport | undefined = rState.report;
  const lotId = report?.lot.id;

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Rappel produit (rappel de lot)</h2>
        <p className="mb-3 text-xs text-slate-500">
          Rapport en cascade depuis un lot suspect : ventes concernées, OFs consommateurs,
          transferts (départ/arrivée), lots descendants produits ou transférés (profondeur max3)
          et leurs ventes. Le blocage propage aux descendants connus ; le déblocage non.
        </p>
        <form action={rAction} className="flex flex-wrap items-end gap-3">
          <label className={`${label} min-w-72 flex-1`}>Lot suspect
            <select name="lotId" required className={field}>
              {lots.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
            </select>
          </label>
          <button disabled={rPending || lots.length === 0} className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {rPending ? "Analyse…" : "Générer le rapport"}
          </button>
          <Feedback state={rState} />
        </form>
      </section>

      {report && (
        <section className="space-y-4 rounded-2xl border bg-white p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold">{report.lot.code} · {report.lot.nom} — {report.lot.numero}</h2>
            <span className="text-sm text-slate-500">DLC {report.lot.dlc ?? "—"} · {report.lot.site_id === "22222222-2222-4222-8222-222222222201" ? "Site1" : "Site2"}</span>
            {report.lot.bloque
              ? <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-bold text-red-700">bloqué — {report.lot.bloque_motif}</span>
              : <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">actif</span>}
            {report.of_producteur && <span className="text-xs text-slate-500">produit par {report.of_producteur.numero} ({report.of_producteur.statut})</span>}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <Bloc titre={`Ventes du lot (${report.ventes.length})`} vide="Aucune vente enregistrée."
              items={
                <ul className="space-y-0.5">
                  {report.ventes.map((v) => (
                    <li key={v.ticket}>{v.ticket} · {new Date(v.date_vente).toLocaleDateString("fr-FR")} · {Number(v.total_ht).toFixed(2)} DA</li>
                  ))}
                </ul>
              } />
            <Bloc titre={`OFs consommateurs (${report.of_consigneurs.length})`} vide="Aucun OF n'a consommé ce lot."
              items={
                <ul className="space-y-0.5">
                  {report.of_consigneurs.map((o) => <li key={o.numero}>{o.numero} — {o.statut}</li>)}
                </ul>
              } />
            <Bloc titre={`Transferts (${report.transferts.length})`} vide="Aucun transfert."
              items={
                <ul className="space-y-0.5">
                  {report.transferts.map((t) => (
                    <li key={`${t.ref}-${t.direction}`}>{t.ref} — {t.direction === "depart" ? "départ (lot source)" : "arrivée (miroir)"}</li>
                  ))}
                </ul>
              } />
            <Bloc titre={`Lots descendants (${report.descendants.length})`} vide="Aucun descendant connu."
              items={
                <ul className="space-y-0.5">
                  {report.descendants.map((d) => (
                    <li key={d.id}>{d.numero} · {d.code} {d.bloque ? "🔴 bloqué" : ""}</li>
                  ))}
                </ul>
              } />
            <div className="md:col-span-2">
              <Bloc titre={`Ventes des descendants (${report.ventes_descendants.length})`} vide="Aucune vente de descendant."
                items={
                  <ul className="space-y-0.5">
                    {report.ventes_descendants.map((v) => (
                      <li key={`${v.ticket}-${v.code ?? ""}`}>{v.ticket} · {v.code} {v.nom} · {new Date(v.date_vente).toLocaleDateString("fr-FR")}</li>
                    ))}
                  </ul>
                } />
            </div>
          </div>

          <div className="grid gap-4 border-t pt-4 md:grid-cols-2">
            <form action={bAction} className="space-y-2">
              <input type="hidden" name="lotId" value={lotId} />
              <label className={label}>Motif de blocage
                <input name="motif" required maxLength={200} placeholder="Contamination, rappel fournisseur…" className={field} />
              </label>
              <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input name="descendants" type="checkbox" className="h-4 w-4" defaultChecked />
                Propager aux descendants connus (miroirs + lots des OF)
              </label>
              <button disabled={bPending} className={btn}>{bPending ? "…" : "Bloquer ce lot"}</button>
              <Feedback state={bState} />
            </form>
            <form action={dAction} className="space-y-2">
              <input type="hidden" name="lotId" value={lotId} />
              <p className="text-xs text-slate-500">Le déblocage ne touche que ce lot : les descendants bloqués restent bloqués.</p>
              <button disabled={dPending} className={btn2}>{dPending ? "…" : "Débloquer ce lot"}</button>
              <Feedback state={dState} />
            </form>
          </div>
        </section>
      )}
    </div>
  );
}
