"use client";

import { useActionState, useState } from "react";
import {
  accepterCgvReal, createCakeReal, editerCakeReal, evolveCakeReal, type JournalState,
} from "@/lib/actions-journaux";
import { traiterDemandeVitrine } from "@/lib/actions-vitrine";
import { peutTraiterDemande, type Role } from "@/lib/vitrine-permissions";
import CakeTicket from "./cake-ticket";

export type CakeRow = {
  id: string; numero: string; statut: string; clientNom: string;
  telephone: string | null; dateEvent: string; nbParts: number;
  prixHt: number; tvaPct: number; acompte: number;
  notes: string | null; cgv: boolean; cgvVersion: string | null;
  /** Vient de la vitrine publique (origine = 'vitrine') : à traiter. */
  origineVitrine?: boolean;
};

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50";

type Opt = { name: string; cout: string; minutes: string };

/** Cake Design : devis (tous rôles), rétroplanning, paiements et transitions verrouillées. */
export default function CakeForms({ cakes, role }: { cakes: CakeRow[]; role: Role }) {
  const [createState, createAction, pending] = useActionState(createCakeReal, {});
  const [evolveState, evolveAction, evolvePending] = useActionState(evolveCakeReal, {});
  const [editState, editAction, editPending] = useActionState(editerCakeReal, {});
  const [cgvState, cgvAction, cgvPending] = useActionState(accepterCgvReal, {});
  const [demandeState, demandeAction, demandePending] = useActionState(traiterDemandeVitrine, {});
  const [opts, setOpts] = useState<Opt[]>([]);
  const [payId, setPayId] = useState("");
  const [editId, setEditId] = useState("");
  const [ticketId, setTicketId] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  // Les demandes de vitrine ne sont PAS des devis : elles n'ont ni prix ni
  // paiement. On les isole en haut pour que le vendeur voie d'abord ce qui
  // attend une réponse, au lieu de les chercher au milieu des devis.
  const demandes = cakes
    .filter((c) => c.statut === "demande")
    .sort((a, b) => a.dateEvent.localeCompare(b.dateEvent));
  const autres = cakes.filter((c) => c.statut !== "demande");
  const sorted = [...autres].sort((a, b) => a.numero.localeCompare(b.numero));
  const peutTraiter = peutTraiterDemande(role);

  return (
    <div className="space-y-6">
      {demandes.length > 0 && (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <h2 className="mb-1 font-bold">Demandes de la vitrine</h2>
          <p className="mb-3 text-xs text-slate-600">
            Reçues depuis votre boutique publique. Accepter crée un devis à chiffrer —
            aucun prix n&apos;est fixé tant que vous ne l&apos;avez pas saisi.
          </p>
          <ul className="space-y-3">
            {demandes.map((c) => (
              <li key={c.id} className="rounded-lg border border-amber-200 bg-white p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-bold text-violet-800">{c.numero}</span>
                  <span>{c.clientNom}</span>
                  {c.telephone && <span className="text-slate-500">{c.telephone}</span>}
                  <span className="text-slate-500">
                    {c.nbParts} parts · {c.dateEvent}
                  </span>
                  {c.notes && <span className="text-xs italic text-slate-500">{c.notes}</span>}
                </div>
                {peutTraiter ? (
                  <form action={demandeAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="id" value={c.id} />
                    <button type="submit" name="decision" value="accepter" disabled={demandePending}
                      className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                      Accepter → devis
                    </button>
                    <button type="submit" name="decision" value="refuser" disabled={demandePending}
                      className="rounded-lg bg-red-700 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50">
                      Refuser
                    </button>
                  </form>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">
                    Un vendeur répondra à cette demande.
                  </p>
                )}
              </li>
            ))}
          </ul>
          {demandeState.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{demandeState.erreur}</p>}
          {demandeState.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{demandeState.succes}</p>}
        </section>
      )}

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
        <p className="mb-3 text-xs text-slate-500">
          Édition réservée au statut devis · paiements historisés · acompte30 % minimum
          pour confirmer · solde avant livraison · preuve CGV horodatée · ticket imprimable.
        </p>
        <ul className="space-y-3">
          {sorted.map((c) => (
            <li key={c.id} className={`rounded-lg border p-3 text-sm ${payId === c.id ? "border-violet-500 ring-1 ring-violet-500" : ""}`}>
              <form action={evolveAction} className="space-y-2">
                <input type="hidden" name="id" value={c.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => setPayId(payId === c.id ? "" : c.id)} className="font-bold text-violet-800 underline">{c.numero}</button>
                  <span>{c.clientNom}</span>
                  <span className="text-slate-500">{Number(c.prixHt).toLocaleString("fr-FR")} DA HT · TVA {c.tvaPct} %</span>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold uppercase text-xs">{c.statut}</span>
                  <span className="text-xs text-slate-500">versé {Number(c.acompte).toLocaleString("fr-FR")} DA</span>
                  {c.cgv
                    ? <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700">CGV {c.cgvVersion ?? ""} ✓</span>
                    : <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-700">CGV non acceptées</span>}
                  <span className="ml-auto flex flex-wrap gap-1">
                    {c.statut === "devis" && (
                      <button type="button" onClick={() => setEditId(editId === c.id ? "" : c.id)} className={btn2}>éditer</button>
                    )}
                    <button type="button" onClick={() => setTicketId(ticketId === c.id ? "" : c.id)} className={btn2}>ticket</button>
                    {["payer", "confirme", "produit", "livre", "annule"].map((t) => (
                      <button key={t} type="submit" name="transition" value={t} disabled={evolvePending}
                        className={btn2}>{t === "confirme" ? "confirmer" : t === "produit" ? "produire" : t === "livre" ? "livrer" : t === "annule" ? "annuler" : "payer"}</button>
                    ))}
                  </span>
                </div>
                {payId === c.id && (
                  <label className={`${label} max-w-64`}>Montant du paiement (DA)
                    <input name="montant" type="number" step="any" min={0.01} required className={`${field} mt-0`} />
                  </label>
                )}
              </form>

              {editId === c.id && (
                <form action={editAction} className="mt-2 grid gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 sm:grid-cols-4">
                  <input type="hidden" name="id" value={c.id} />
                  <label className={label}>Client
                    <input name="clientNom" required maxLength={100} defaultValue={c.clientNom} className={field} />
                  </label>
                  <label className={label}>Téléphone
                    <input name="telephone" maxLength={40} defaultValue={c.telephone ?? ""} className={field} />
                  </label>
                  <label className={label}>Événement
                    <input name="dateEvent" type="date" required defaultValue={c.dateEvent} className={field} />
                  </label>
                  <label className={label}>Parts
                    <input name="nbParts" type="number" min={1} max={10000} required defaultValue={c.nbParts} className={field} />
                  </label>
                  <label className={label}>Prix HT
                    <input name="prixHt" type="number" step="any" min={0.01} required defaultValue={c.prixHt} className={field} />
                  </label>
                  <label className={label}>TVA %
                    <input name="tvaPct" type="number" step="any" min={0} max={100} required defaultValue={c.tvaPct} className={field} />
                  </label>
                  <label className={`${label} sm:col-span-2`}>Notes
                    <input name="notes" maxLength={500} defaultValue={c.notes ?? ""} className={field} />
                  </label>
                  <div className="flex items-end gap-2">
                    <button disabled={editPending} className={btn}>{editPending ? "…" : "Enregistrer"}</button>
                    <button type="button" onClick={() => setEditId("")} className={btn2}>fermer</button>
                  </div>
                </form>
              )}

              {!c.cgv && (
                <form action={cgvAction} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="id" value={c.id} />
                  <label className={`${label} max-w-56`}>Version des CGV
                    <input name="version" required maxLength={50} defaultValue="CGV-2026-v1" className={field} />
                  </label>
                  <button disabled={cgvPending} className={btn2}>{cgvPending ? "…" : "Enregistrer l'acceptation"}</button>
                </form>
              )}

              {ticketId === c.id && (
                <div className="mt-3">
                  <CakeTicket data={{
                    numero: c.numero, clientNom: c.clientNom, telephone: c.telephone,
                    dateEvent: c.dateEvent, nbParts: c.nbParts, prixHt: Number(c.prixHt),
                    tvaPct: Number(c.tvaPct), acompte: Number(c.acompte), statut: c.statut,
                  }} />
                </div>
              )}
            </li>
          ))}
          {sorted.length === 0 && <li className="text-sm text-slate-500">Aucun devis.</li>}
        </ul>
        {evolveState.erreur && <p role="alert" className="mt-2 text-sm text-red-700">{evolveState.erreur}</p>}
        {evolveState.succes && <p role="status" className="mt-2 text-sm text-emerald-700">{evolveState.succes}</p>}
        {editState.erreur && <p role="alert" className="text-sm text-red-700">{editState.erreur}</p>}
        {editState.succes && <p role="status" className="text-sm text-emerald-700">{editState.succes}</p>}
        {cgvState.erreur && <p role="alert" className="text-sm text-red-700">{cgvState.erreur}</p>}
        {cgvState.succes && <p role="status" className="text-sm text-emerald-700">{cgvState.succes}</p>}
      </section>
    </div>
  );
}
