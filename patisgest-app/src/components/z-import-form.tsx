"use client";

import { useActionState, useState } from "react";
import { importZReal, type SaleState } from "@/lib/actions-caisse";
import { parseZCsv } from "@/lib/z-input";
import { jourLocal } from "@/lib/workspace-data";

type Option = { id: string; label: string };

const field = "mt-1 w-full rounded-lg border border-slate-300 p-2 text-sm";
const label = "block text-xs font-semibold text-slate-600";
const btn = "rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white disabled:opacity-50";

/**
 * Import Z sécurisé : aperçu local du format (code;quantité;prix), puis
 * validation serveur. Si un autre Z du jour a le même total, la base
 * refuse et la case « import distinct » permet de confirmer.
 */
export default function ZImportForm({ sites }: { sites: Option[] }) {
  const [state, action, pending] = useActionState(importZReal, {});
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{ lines: number; totalHT: number } | null>(null);
  const [previewError, setPreviewError] = useState("");
  const today = jourLocal();

  const doPreview = () => {
    try {
      const p = parseZCsv(csv);
      setPreview({ lines: p.lines.length, totalHT: p.totalHT });
      setPreviewError("");
    } catch (e) {
      setPreview(null);
      setPreviewError(e instanceof Error ? e.message : "Aperçu impossible.");
    }
  };

  return (
    <section className="mb-6 rounded-2xl border bg-white p-5">
      <h2 className="mb-1 font-bold">Import Z (caisse)</h2>
      <p className="mb-3 text-xs text-slate-500">
        Format strict <code>code;quantité;prix (DA)</code> (1 à 100 lignes, sans en-tête). Aperçu puis
        validation : la base résout chaque code, consomme en FEFO et refuse tout code inconnu — aucun
        achat ni vente d&apos;article hors périmètre. Un identifiant (date, caisse, n° Z) ne s&apos;importe
        qu&apos;une fois ; un total identique le même jour exige la confirmation « import distinct ».
      </p>
      <form action={action} className="space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className={`${label} w-40`}>Date du Z
            <input name="date" type="date" max={today} required defaultValue={today} className={field} />
          </label>
          <label className={`${label} min-w-44 flex-1`}>Site
            <select name="siteId" required className={field}>
              {sites.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className={`${label} w-40`}>Caisse
            <input name="caisse" required maxLength={80} placeholder="Caisse 1" className={field} />
          </label>
          <label className={`${label} w-40`}>N° Z
            <input name="numeroZ" required maxLength={80} placeholder="Z-2026-001" className={field} />
          </label>
        </div>
        <label className={`${label}`}>
          Données (code;quantité;prix en DA)
          <textarea name="csv" required rows={5} value={csv} onChange={(e) => setCsv(e.target.value)}
            placeholder={"PF-ECL;2;320.00\nPF-MIL;1;260.00"} className={field} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={doPreview} className="rounded-lg border px-3 py-2 text-sm font-bold">
            Aperçu
          </button>
          {preview && (
            <span className="text-sm text-emerald-700">
              {preview.lines} ligne(s) — total {preview.totalHT.toLocaleString("fr-FR")} DA
            </span>
          )}
          {previewError && <span role="alert" className="text-sm text-red-700">{previewError}</span>}
          <label className={`${label} ml-auto flex items-center gap-2 py-2`}>
            <input name="confirm" type="checkbox" className="h-4 w-4" />
            Import distinct (même total le même jour)
          </label>
          <button disabled={pending} className={btn}>
            {pending ? "Import en cours…" : "Valider l'import"}
          </button>
        </div>
        {state.erreur && <p role="alert" className="text-sm text-red-700">{state.erreur}</p>}
        {state.succes && <p role="status" className="text-sm text-emerald-700">{state.succes}</p>}
      </form>
    </section>
  );
}
