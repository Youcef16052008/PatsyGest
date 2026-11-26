"use client";

import { useActionState, useState, useSyncExternalStore } from "react";
import { saisirCloture } from "@/lib/actions-clotures";
import { compterVentesEnAttente, messageAttenteCloture } from "@/lib/file-attente-cloture";
import { jourLocal } from "@/lib/workspace-data";

type Option = { id: string; label: string };
type Row = {
  articleId: string;
  produit: string;
  vendu: string;
  reporte: string;
  jete: string;
  casse: string;
  offert: string;
};

const emptyRow = (articleId = ""): Row => ({
  articleId,
  produit: "",
  vendu: "",
  reporte: "",
  jete: "",
  casse: "",
  offert: "",
});
const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";
const flows: { key: keyof Omit<Row, "articleId">; title: string }[] = [
  { key: "produit", title: "Fabriqué" },
  { key: "vendu", title: "Vendu" },
  { key: "reporte", title: "Reporté" },
  { key: "jete", title: "Jeté" },
  { key: "casse", title: "Casse" },
  { key: "offert", title: "Offert" },
];

/**
 * Clôture déclarative en deux volets séparés :
 * 1) Flux produits (6 quantités par produit fini).
 * 2) Tiroir-caisse (DA TTC : fond d'ouverture, espèces comptées, note d'écart) — facultatif.
 */
export default function ClotureForm({ sites, articles }: { sites: Option[]; articles: Option[] }) {
  const [state, action, pending] = useActionState(saisirCloture, {});
  const [rows, setRows] = useState<Row[]>([emptyRow(articles[0]?.id ?? "")]);
  const update = (i: number, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  /**
   * Ventes encore en file locale (coupure réseau). On ne clôture pas un tiroir
   * qui contient leur argent sans le dire explicitement.
   */
  const attente = useSyncExternalStore(
    (cb) => {
      window.addEventListener("storage", cb);
      window.addEventListener("patisgest-sale-queue", cb);
      return () => {
        window.removeEventListener("storage", cb);
        window.removeEventListener("patisgest-sale-queue", cb);
      };
    },
    () => compterVentesEnAttente(window.localStorage),
    () => ({ tickets: 0, illisible: false }),
  );
  const avertissementFile = messageAttenteCloture(attente);

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Clôture du jour · produits &amp; tiroir</h2>
      <p className="mb-3 text-xs text-slate-500">
        Déclaratif : ne modifie ni stocks ni ventes. Les corrections passent par une nouvelle révision
        (case « correction »). Les quantités produits et le comptage du tiroir-caisse sont enregistrés séparément.
      </p>
      <form action={action} className="space-y-4">
        <input type="hidden" name="lineCount" value={rows.length} />
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-40`}>
            Date
            <input
              name="date"
              type="date"
              required
              defaultValue={jourLocal()}
              className={field}
            />
          </label>
          <label className={`${label} min-w-44 flex-1`}>
            Site
            <select name="siteId" required className={field}>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className={`${label} flex items-center gap-2 py-2`}>
            <input name="revise" type="checkbox" className="h-4 w-4" /> Correction (nouvelle révision)
          </label>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, emptyRow(articles[0]?.id ?? "")])}
            className="rounded-lg border px-3 py-2 text-sm font-bold"
          >
            + Produit
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            1. Flux produits (quantités)
          </h3>
          {rows.map((row, i) => (
            <div key={i} className="grid gap-2 rounded-lg border p-2 sm:grid-cols-7">
              <label className={`${label} sm:col-span-2`}>
                Produit
                <select
                  name={`line${i}_article`}
                  required
                  value={row.articleId}
                  onChange={(e) => update(i, { articleId: e.target.value })}
                  className={field}
                >
                  {articles.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </label>
              {flows.map(({ key, title }) => (
                <label key={key} className={label}>
                  {title}
                  <input
                    name={`line${i}_${key}`}
                    type="number"
                    min={0}
                    step="0.0001"
                    required
                    value={row[key]}
                    onChange={(e) => update(i, { [key]: e.target.value } as Partial<Row>)}
                    className={field}
                  />
                </label>
              ))}
              {rows.length > 1 && (
                <button
                  type="button"
                  onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}
                  className="self-end text-xs font-bold text-red-700"
                >
                  Retirer
                </button>
              )}
            </div>
          ))}
        </div>

        <fieldset className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
          <legend className="px-1 text-xs font-bold uppercase tracking-wide text-slate-600">
            2. Comptage tiroir-caisse (en DA · facultatif, séparé des produits)
          </legend>
          <p className="mb-2 text-xs text-slate-500">
            Espèces attendues = fond initial + ventes espèces − sorties justifiées. Les règlements chèque/virement,
            et imports Z sont affichés à part dans le rapprochement.
          </p>
          <div className="grid gap-3 sm:grid-cols-4">
            <label className={label}>
              Fond de caisse initial (DA)
              <input
                name="fondInitial"
                type="number"
                min={0}
                step="0.01"
                placeholder="Ex. 5000"
                className={field}
              />
            </label>
            <label className={label}>
              Sorties d&apos;espèces (DA)
              <input
                name="sortiesEspeces"
                type="number"
                min={0}
                step="0.01"
                placeholder="Ex. 0"
                className={field}
              />
            </label>
            <label className={label}>
              Espèces comptées (DA)
              <input
                name="especesComptees"
                type="number"
                min={0}
                step="0.01"
                placeholder="Ex. 34200"
                className={field}
              />
            </label>
            <label className={label}>
              Motif de sortie / note
              <input
                name="motifSortie"
                type="text"
                maxLength={200}
                placeholder="Monnaie, petit achat…"
                className={field}
              />
            </label>
          </div>
        </fieldset>

        {avertissementFile && (
          <p role="alert" data-testid="file-attente" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            {avertissementFile}
          </p>
        )}
        <button
          disabled={pending || articles.length === 0 || attente.tickets > 0}
          className={btn}
        >
          {pending ? "Enregistrement…" : "Enregistrer la clôture"}
        </button>
        {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
        {state.succes && <p role="status" className="text-sm text-emerald-700">{state.succes}</p>}
      </form>
    </section>
  );
}
