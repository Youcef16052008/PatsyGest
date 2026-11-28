"use client";

import { useActionState, useState } from "react";
import { activateVersionReal, createFamilleReal, createVersionReal, type RecettesState } from "@/lib/actions-recettes";

type Option = { id: string; label: string };
export type VersionRow = { id: string; familleId: string; version: number; active: boolean; label: string };

const UNITS = ["kg", "g", "L", "cl", "ml", "pcs"];

type Line = { kind: "article" | "sub"; ref: string; q: string; u: string; parage: string };

function Feedback({ state }: { state: RecettesState }) {
  return (
    <>
      {state.erreur && <p role="alert" className="pg-form-error">{state.erreur}</p>}
      {state.succes && <p role="status" className="pg-form-ok">{state.succes}</p>}
    </>
  );
}

/**
 * Écran court : on écrit la fiche recette, puis la préparation (ingrédients + rendement).
 * Les coûts fins (main-d'œuvre, énergie, emballage, frais généraux) sont rangés derrière
 * « Coûts (optionnel) » : ils ne bloquent pas la saisie du quotidien.
 * Versions immuables : une fois créée, une préparation ne change plus (dupliquer pour une variante).
 */
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
    <div className="pg-stack">
      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2>Nouvelle recette</h2>
            <p>Son nom, son code, et le produit qu&apos;elle donne.</p>
          </div>
        </div>
        <form action={famAction} className="pg-version-grid">
          <label className="pg-field">Code
            <input name="code" required maxLength={20} placeholder="SF-PATE" className="pg-input" />
          </label>
          <label className="pg-field">Nom
            <input name="nom" required maxLength={100} placeholder="Pâte feuilletée maison" className="pg-input" />
          </label>
          <label className="pg-field">Produit lié
            <select name="produitId" required className="pg-input">
              {produits.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          <div className="pg-version-actions">
            <button disabled={famPending || produits.length === 0} className="pg-button">
              {famPending ? "…" : "Créer la recette"}
            </button>
            <Feedback state={famState} />
          </div>
        </form>
      </section>

      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2>Nouvelle préparation</h2>
            <p>Les ingrédients, ce que ça donne, et c&apos;est enregistré.</p>
          </div>
        </div>
        <form action={createAction} className="pg-stack">
          <input type="hidden" name="lineCount" value={lines.length} />
          <div className="pg-version-grid">
            <label className="pg-field">Pour quelle recette ?
              <select name="familleId" required className="pg-input">
                {familles.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </label>
            <label className="pg-field">Ça donne (quantité)
              <input name="rendementQte" type="number" step="any" min={0.0001} required defaultValue={12} className="pg-input" />
            </label>
            <label className="pg-field">Unité
              <input name="rendementUnite" list="units-vf" required defaultValue="pcs" maxLength={10} className="pg-input" />
            </label>
          </div>
          <datalist id="units-vf">{UNITS.map((u) => <option key={u} value={u} />)}</datalist>

          <div className="pg-version-lines">
            {lines.map((line, i) => (
              <div key={i} className="pg-version-line">
                <label className="pg-field">Ingrédient
                  <select value={line.kind} onChange={(e) => upd(i, { kind: e.target.value as Line["kind"], ref: e.target.value === "article" ? articles[0]?.id ?? "" : subVersions[0]?.id ?? "" })} className="pg-input">
                    <option value="article">Matière première</option>
                    <option value="sub">Sous-recette</option>
                  </select>
                </label>
                <label className="pg-field">{line.kind === "article" ? "Laquelle ?" : "Quelle sous-recette ?"}
                  <select value={line.ref} onChange={(e) => upd(i, { ref: e.target.value })} className="pg-input">
                    {(line.kind === "article" ? articles : subVersions).map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                  <input type="hidden" name={`line${i}_kind`} value={line.kind} />
                  <input type="hidden" name={`line${i}_ref`} value={line.ref} />
                </label>
                <label className="pg-field">Quantité
                  <input name={`line${i}_q`} type="number" step="any" min={0.0001} required value={line.q}
                    onChange={(e) => upd(i, { q: e.target.value })} className="pg-input" />
                </label>
                <label className="pg-field">Unité
                  <input name={`line${i}_u`} list="units-vf" required maxLength={10} value={line.u}
                    onChange={(e) => upd(i, { u: e.target.value })} className="pg-input" />
                </label>
                {line.kind === "article" && (
                  <label className="pg-field">Perte épluchage %
                    <input name={`line${i}_parage`} type="number" step="any" min={0} value={line.parage}
                      onChange={(e) => upd(i, { parage: e.target.value })} className="pg-input" />
                  </label>
                )}
              </div>
            ))}
          </div>
          <button type="button" onClick={() => setLines((ls) => [...ls, { kind: "article", ref: articles[0]?.id ?? "", q: "", u: "kg", parage: "0" }])}
            className="pg-text-link">+ Ajouter une ligne</button>

          <details className="pg-version-more">
            <summary>Coûts (optionnel)</summary>
            <div className="pg-version-grid">
              <label className="pg-field">Perte à la cuisson %
                <input name="cuissonPertePct" type="number" step="any" min={0} max={99.99} defaultValue={0} className="pg-input" />
              </label>
              <label className="pg-field">Main-d&apos;œuvre (min)
                <input name="moMin" type="number" step="any" min={0} defaultValue={0} className="pg-input" />
              </label>
              <label className="pg-field">Énergie
                <input name="energie" type="number" step="any" min={0} defaultValue={0} className="pg-input" />
              </label>
              <label className="pg-field">Emballage
                <input name="emballage" type="number" step="any" min={0} defaultValue={0} className="pg-input" />
              </label>
              <label className="pg-field">Frais généraux
                <input name="fraisGeneraux" type="number" step="any" min={0} defaultValue={0} className="pg-input" />
              </label>
              <label className="pg-check"><input name="active" type="checkbox" className="h-4 w-4" /> Utiliser cette préparation</label>
            </div>
            <p className="pg-help">Laissez à 0 si vous ne calculez pas encore ces coûts : ils n&apos;empêchent pas de travailler.</p>
          </details>

          <div className="pg-version-actions">
            <button disabled={pending || familles.length === 0} className="pg-button pg-cake-submit">
              {pending ? "Création…" : "Enregistrer la préparation"}
            </button>
            <Feedback state={createState} />
          </div>
        </form>
      </section>

      <section className="pg-card pg-card-pad">
        <div className="pg-card-head">
          <div>
            <h2>Préparations enregistrées</h2>
            <p>Une seule préparation active par recette.</p>
          </div>
        </div>
        <ul className="pg-version-list">
          {sorted.map((v) => (
            <li key={v.id}>
              <span>{v.label}</span>
              {v.active && <span className="pg-badge" data-tone="ok">active</span>}
              {!v.active && (
                <form action={actAction}>
                  <input type="hidden" name="versionId" value={v.id} />
                  <button type="submit" disabled={actPending} className="pg-button pg-button-secondary">Activer</button>
                </form>
              )}
            </li>
          ))}
          {sorted.length === 0 && <li className="pg-muted">Aucune préparation.</li>}
        </ul>
        <Feedback state={actState} />
      </section>
    </div>
  );
}
