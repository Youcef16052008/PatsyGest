"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createCommandeReal, receiveCommandeReal, type AchatsState } from "@/lib/actions-achats";
import type { PriceAlert } from "@/lib/price-alerts";

type Option = { id: string; label: string };
export type CommandeRow = { id: string; numero: string; statut: string; fournisseur: string; lignes: { articleId: string; qte: number; pu?: number; recu: number }[] };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50";
const today = new Date().toISOString().slice(0, 10);

type Line = { articleId: string; qte: string; pu: string };

function CommandeCreate({ fournisseurs, articles, alerts }: { fournisseurs: Option[]; articles: Option[]; alerts: PriceAlert[] }) {
  const [state, action, pending] = useActionState(createCommandeReal, {});
  const [fournisseur, setFournisseur] = useState(fournisseurs[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>([{ articleId: articles[0]?.id ?? "", qte: "", pu: "" }]);
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const alertFor = (articleId: string) =>
    alerts.find((a) => a.articleId === articleId && a.fournisseurId === fournisseur);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="lineCount" value={lines.length} />
      <div className="flex flex-wrap items-end gap-3">
        <label className={`${label} min-w-52 flex-1`}>Fournisseur
          <select name="fournisseurId" required value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} className={field}>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </label>
        <label className={`${label} min-w-52 flex-1`}>Notes (opt.)<input name="notes" maxLength={500} className={field} /></label>
        <button type="button" onClick={() => setLines((ls) => [...ls, { articleId: articles[0]?.id ?? "", qte: "", pu: "" }])}
          className="rounded-lg border px-3 py-2 text-sm font-bold">+ Ligne</button>
      </div>
      {lines.map((line, i) => (
        <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-4">
          <label className={`${label} sm:col-span-2`}>Article
            <select name={`line${i}_article`} required value={line.articleId} onChange={(e) => upd(i, { articleId: e.target.value })} className={field}>
              {articles.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
            </select>
          </label>
          <label className={label}>Quantité
            <input name={`line${i}_qte`} type="number" step="any" min={0.0001} required value={line.qte}
              onChange={(e) => upd(i, { qte: e.target.value })} className={field} />
          </label>
          <label className={label}>Prix unitaire (DA)
            <input name={`line${i}_pu`} type="number" step="any" min={0} required value={line.pu}
              onChange={(e) => upd(i, { pu: e.target.value })} className={field} />
            {(() => { const a = alertFor(line.articleId); return a ? (
              <span className="mt-1 block text-xs font-bold text-amber-700">
                Prix bougé de {a.deltaPct > 0 ? "+" : ""}{a.deltaPct} % — dernier connu {a.previous} DA, maintenant {a.latest} DA ({a.dateLatest})
              </span>
            ) : null; })()}
          </label>
        </div>
      ))}
      <button disabled={pending || articles.length === 0} className={btn}>{pending ? "…" : "Créer le bon de commande"}</button>
      {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="text-sm text-emerald-700">{state.succes}</p>}
    </form>
  );
}

function ReceptionBlock({ commande, sites, articlesById, voirPrix }: { commande: CommandeRow; sites: Option[]; articlesById: Record<string, string>; voirPrix: boolean }) {
  const [state, action, pending] = useActionState(receiveCommandeReal, {});
  const [on, setOn] = useState<boolean[]>(() => commande.lignes.map(() => false));
  const [vals, setVals] = useState(() => commande.lignes.map((l) => ({ qte: String(Math.max(0, l.qte - l.recu)), numero: "", dlc: today })));
  const active = on.map((v, i) => (v ? i : -1)).filter((i) => i >= 0);
  const upd = (i: number, patch: Partial<{ qte: string; numero: string; dlc: string }>) =>
    setVals((vs) => vs.map((v, j) => (j === i ? { ...v, ...patch } : v)));
  return (
    <form action={action} className="rounded-lg border p-3">
      <input type="hidden" name="commandeId" value={commande.id} />
      <input type="hidden" name="receptionCount" value={active.length} />
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <b>{commande.numero}</b>
        <span className="text-slate-500">{commande.fournisseur}</span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 font-bold uppercase text-xs">{commande.statut}</span>
        <label className={`${label} ml-auto w-44`}>Site de réception
          <select name="siteId" required className={`${field} mt-0`}>
            {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
          </select>
        </label>
      </div>
      <ul className="space-y-2">
        {commande.lignes.map((l, i) => {
          const reste = Math.max(0, l.qte - l.recu);
          return (
            <li key={i} className="flex flex-wrap items-end gap-2 rounded bg-slate-50 p-2">
              <label className={`${label} flex items-center gap-2 py-1`}>
                <input type="checkbox" className="h-4 w-4" checked={on[i]}
                  disabled={reste <= 0}
                  onChange={(e) => setOn((os) => os.map((v, j) => (j === i ? e.target.checked : v)))} />
                <span className="font-bold">{articlesById[l.articleId] ?? l.articleId.slice(0, 8)}</span>
                <span className="text-xs text-slate-500">{l.qte}{voirPrix && l.pu != null ? ` @ ${l.pu} DA` : ""} — reçu {l.recu} (reste {reste})</span>
              </label>
              {on[i] && (
                <>
                  <input type="hidden" name={`rec${active.indexOf(i)}_index`} value={i} />
                  <label className={`${label} w-24`}>Qté reçue
                    <input name={`rec${active.indexOf(i)}_qte`} type="number" step="any" min={0.0001} max={reste} required value={vals[i].qte}
                      onChange={(e) => upd(i, { qte: e.target.value })} className={`${field} mt-0`} />
                  </label>
                  <label className={`${label} w-36`}>N° de lot
                    <input name={`rec${active.indexOf(i)}_numero`} required maxLength={80} value={vals[i].numero}
                      onChange={(e) => upd(i, { numero: e.target.value })} className={`${field} mt-0`} />
                  </label>
                  <label className={`${label} w-40`}>DLC
                    <input name={`rec${active.indexOf(i)}_dlc`} type="date" min={today} required value={vals[i].dlc}
                      onChange={(e) => upd(i, { dlc: e.target.value })} className={`${field} mt-0`} />
                  </label>
                </>
              )}
            </li>
          );
        })}
      </ul>
      <button disabled={pending || active.length === 0} className={`${btn} mt-2`}>
        {pending ? "Réception…" : `Recevoir (${active.length})`}
      </button>
      {state.erreur && <p role="alert" className="ml-3 inline text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="ml-3 inline text-sm text-emerald-700">{state.succes}</p>}
    </form>
  );
}

/** Achats : BC multi-lignes + réceptions partielles/totales avec création de lots. */
export default function CommandeForms({ fournisseurs, articles, sites, commandes, alerts = [], voirPrix = true }: {
  fournisseurs: Option[]; articles: Option[]; sites: Option[]; commandes: CommandeRow[]; alerts?: PriceAlert[]; voirPrix?: boolean;
}) {
  const articlesById = Object.fromEntries(articles.map((a) => [a.id, a.label]));
  const fournById = Object.fromEntries(fournisseurs.map((f) => [f.id, f.label]));
  const ouvertes = commandes.filter((c) => c.statut !== "recu");
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Nouveau bon de commande (multi-lignes)</h2>
        <p className="mb-3 text-xs text-slate-500">Chaque ligne : article + quantité + prix unitaire (le prix sert au rapprochement).</p>
        {alerts.length > 0 && (
          <div role="status" className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <b>Alertes de variation de prix (&gt; 10 %)</b>
            <ul className="mt-1 list-inside list-disc">
              {alerts.map((a) => (
                <li key={`${a.articleId}-${a.fournisseurId}`}>
                  {articlesById[a.articleId] ?? a.articleId.slice(0, 8)} · {fournById[a.fournisseurId] ?? ""} —
                  dernier prix {a.previous} DA → {a.latest} DA ({a.deltaPct > 0 ? "+" : ""}{a.deltaPct} %) le {a.dateLatest}{" "}
                  <Link
                    href={`/simulation?matiere=${encodeURIComponent(a.articleId)}&ancien=${encodeURIComponent(String(a.previous))}&nouveau=${encodeURIComponent(String(a.latest))}#hausse-matiere`}
                    className="font-bold text-violet-800 underline"
                  >
                    Voir l’impact sur les recettes →
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <CommandeCreate fournisseurs={fournisseurs} articles={articles} alerts={alerts} />
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Réceptions fournisseur</h2>
        <p className="mb-3 text-xs text-slate-500">
          Création de lots (n° + DLC exigés) + mouvements entrants. Réception partielle → statut « partiel »,
          tout reçu → « reçu ». Historique des prix alimenté pour l&apos;alerte &gt; 10 %.
        </p>
        <div className="space-y-3">
          {ouvertes.map((c) => <ReceptionBlock key={c.id} commande={c} voirPrix={voirPrix} sites={sites} articlesById={articlesById} />)}
          {ouvertes.length === 0 && <p className="text-sm text-slate-500">Aucune commande ouverte.</p>}
        </div>
      </section>
    </div>
  );
}
