"use client";

import { useActionState, useState } from "react";
import { activateVersionReal, createFamilleReal, createVersionReal, type RecettesState } from "@/lib/actions-recettes";

type Option = { id: string; label: string };
export type VersionRow = { id: string; familleId: string; version: number; active: boolean; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const btn2 = "rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold disabled:opacity-50";
const UNITS = ["kg", "g", "L", "cl", "ml", "pcs"];

type Line = { kind: "article" | "sub"; ref: string; q: string; u: string; parage: string };

function Feedback({ state }: { state: RecettesState }) {
  return (
    <>
      {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
      {state.succes && <p role="status" className="text-sm text-emerald-700">{state.succes}</p>}
    </>
  );
}

/** Versions immuables : création (articles ou sous-recettes figées) + activation. */
export default function VersionForm({ familles, articles, subVersions, versions, produits }: {
  familles: Option[]; articles: Option[]; subVersions: Option[]; versions: VersionRow[]; produits: Option[];
}) {
  const [createState, createAction, pending] = useActionState(createVersionReal, {});
  const [famState, famAction, famPending] = useActionState(createFamilleReal, {});
  const [actState, actAction, actPending] = useActionState(activateVersionReal, {});
  const [lines, setLines] = useState<Line[]>([
    { kind: "article", ref: articles[0]?.id ?? "", q: "", u: "kg", parage: "0" },
  ]);
  const upd = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const sorted = [...versions].sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Nouvelle famille de recette</h2>
        <p className="mb-3 text-xs text-slate-500">
          Une famille est liée à un article (produit ou semifini) : c&apos;est elle qui portera ses versions.
        </p>
        <form action={famAction} className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-36`}>Code
            <input name="code" required maxLength={20} placeholder="SF-PATE" className={field} />
          </label>
          <label className={`${label} min-w-52 flex-1`}>Nom
            <input name="nom" required maxLength={100} placeholder="Pâte feuilletée maison" className={field} />
          </label>
          <label className={`${label} min-w-52 flex-1`}>Article lié
            <select name="produitId" required className={field}>
              {produits.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <button disabled={famPending || produits.length === 0} className={btn}>
            {famPending ? "…" : "Créer la famille"}
          </button>
          <Feedback state={famState} />
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-1 font-bold">Nouvelle version de recette</h2>
        <p className="mb-3 text-xs text-slate-500">
          Versions immuables : une fois créée, elle ne change plus (dupliquez pour une variante).
          Ligne <b>article</b> (quantité + unité, conversion exigée si l&apos;unité diffère de
          l&apos;article) ou <b>sous-recette</b> (pointeur vers une version figée, anti-cycle et
          profondeur max3 vérifiés côté serveur). Le coût par portion suit au Sprint3 (RC-01..06).
        </p>
        <form action={createAction} className="space-y-3">
          <input type="hidden" name="lineCount" value={lines.length} />
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${label} min-w-56 flex-1`}>Famille
              <select name="familleId" required className={field}>
                {familles.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label className={`${label} w-32`}>Rendement
              <input name="rendementQte" type="number" step="any" min={0.0001} required defaultValue={12} className={field} />
            </label>
            <label className={`${label} w-28`}>Unité
              <input name="rendementUnite" list="units-vf" required defaultValue="pcs" maxLength={10} className={field} />
            </label>
            <label className={`${label} w-28`}>Perte cuisson %
              <input name="cuissonPertePct" type="number" step="any" min={0} max={99.99} defaultValue={0} className={field} />
            </label>
            <label className={`${label} w-28`}>MO (min)
              <input name="moMin" type="number" step="any" min={0} defaultValue={0} className={field} />
            </label>
            <label className={`${label} w-28`}>Énergie
              <input name="energie" type="number" step="any" min={0} defaultValue={0} className={field} />
            </label>
            <label className={`${label} w-28`}>Emballage
              <input name="emballage" type="number" step="any" min={0} defaultValue={0} className={field} />
            </label>
            <label className={`${label} w-32`}>Frais généraux
              <input name="fraisGeneraux" type="number" step="any" min={0} defaultValue={0} className={field} />
            </label>
            <label className={`${label} flex items-center gap-2 py-2`}>
              <input name="active" type="checkbox" className="h-4 w-4" /> Activer
            </label>
          </div>
          <datalist id="units-vf">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>

          {lines.map((line, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-6">
              <label className={`${label} sm:col-span-2`}>Type
                <select value={line.kind} onChange={(e) => upd(i, { kind: e.target.value as Line["kind"], ref: e.target.value === "article" ? articles[0]?.id ?? "" : subVersions[0]?.id ?? "" })} className={field}>
                  <option value="article">Article</option>
                  <option value="sub">Sous-recette</option>
                </select>
              </label>
              <label className={`${label} sm:col-span-2`}>{line.kind === "article" ? "Article" : "Sous-recette (version)"}
                <select value={line.ref} onChange={(e) => upd(i, { ref: e.target.value })} className={field}>
                  {(line.kind === "article" ? articles : subVersions).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </select>
                <input type="hidden" name={`line${i}_kind`} value={line.kind} />
                <input type="hidden" name={`line${i}_ref`} value={line.ref} />
              </label>
              <label className={label}>Qté
                <input name={`line${i}_q`} type="number" step="any" min={0.0001} required value={line.q}
                  onChange={(e) => upd(i, { q: e.target.value })} className={field} />
              </label>
              <label className={label}>Unité
                <input name={`line${i}_u`} list="units-vf" required maxLength={10} value={line.u}
                  onChange={(e) => upd(i, { u: e.target.value })} className={field} />
              </label>
              {line.kind === "article" && (
                <label className={label}>Parage %
                  <input name={`line${i}_parage`} type="number" step="any" min={0} value={line.parage}
                    onChange={(e) => upd(i, { parage: e.target.value })} className={field} />
                </label>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setLines((ls) => [...ls, { kind: "article", ref: articles[0]?.id ?? "", q: "", u: "kg", parage: "0" }])}
            className="rounded-lg border px-3 py-2 text-sm font-bold">+ Ligne</button>
          <button disabled={pending || familles.length === 0} className={btn}>
            {pending ? "Création…" : "Créer la version"}
          </button>
          <Feedback state={createState} />
        </form>
      </section>

      <section className="rounded-2xl border bg-white p-5">
        <h2 className="mb-3 font-bold">Versions existantes</h2>
        <ul className="space-y-1">
          {sorted.map((v) => (
            <li key={v.id} className="flex flex-wrap items-center gap-2 border-b py-1 text-sm">
              <span className={v.active ? "font-bold text-emerald-700" : ""}>{v.label}</span>
              {v.active && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold">active</span>}
              {!v.active && (
                <form action={actAction} className="ml-auto">
                  <input type="hidden" name="versionId" value={v.id} />
                  <button type="submit" disabled={actPending} className={btn2}>Activer</button>
                </form>
              )}
            </li>
          ))}
          {sorted.length === 0 && <li className="text-sm text-slate-500">Aucune version.</li>}
        </ul>
        <Feedback state={actState} />
      </section>
    </div>
  );
}
