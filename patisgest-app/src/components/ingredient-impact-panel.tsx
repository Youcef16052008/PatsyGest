"use client";

import { useActionState, useMemo, useState } from "react";
import { analyserHausseMatiereReal, type ImpactActionState } from "@/lib/actions-couts";
import type { IngredientImpactReport } from "@/lib/ingredient-impact";
import { demoIngredientImpact, demoMercurialeFor } from "@/lib/demo-workspace";
import type { State } from "@/lib/patisgest-store";
import { dinars, quantite } from "@/lib/workspace-data";

export type IngredientOption = {
  id: string;
  label: string;
  unite: string;
  defaultAncien?: number | null;
  sourceAncien?: string;
  defaultNouveau?: number | null;
  sourceNouveau?: string;
};

export type QuickPriceAlert = {
  articleId: string;
  label: string;
  ancienPu: number;
  nouveauPu: number;
  variationPct: number;
  sourceAncien: string;
  sourceNouveau: string;
};

function ImpactReportView({ rapport }: { rapport: IngredientImpactReport }) {
  const hausse = rapport.ecartUnitaire > 0;
  const baisse = rapport.ecartUnitaire < 0;
  return (
    <div className="pg-impact-results" aria-live="polite">
      <div className="pg-impact-banner">
        <div>
          <strong>
            {rapport.article.nom} ({rapport.article.code})
          </strong>{" "}
          : <span className="pg-num">{dinars(rapport.ancienPu)}</span> / {rapport.article.unite}{" "}
          <span className="pg-muted">({rapport.sourceAncien})</span> →{" "}
          <strong className="pg-num">{dinars(rapport.nouveauPu)}</strong> / {rapport.article.unite}{" "}
          <span className="pg-muted">({rapport.sourceNouveau})</span>
        </div>
        <span
          className="pg-badge"
          data-tone={hausse ? "danger" : baisse ? "success" : "planned"}
        >
          {rapport.ecartUnitaire >= 0 ? "+" : ""}
          {dinars(rapport.ecartUnitaire)} / {rapport.article.unite}
          {rapport.variationPct != null &&
            ` (${rapport.variationPct >= 0 ? "+" : ""}${quantite(rapport.variationPct)} %)`}
        </span>
      </div>

      {rapport.conversionsManquantes.length > 0 && (
        <p role="alert" className="pg-alert pg-alert-warning">
          Conversions d’unités à compléter pour un calcul exhaustif : {rapport.conversionsManquantes.join(", ")}.
        </p>
      )}

      {rapport.recettes.length === 0 ? (
        <p className="pg-help">
          Aucune recette active n’emploie cet ingrédient (ni directement, ni via une sous-recette).
        </p>
      ) : (
        <div className="pg-table-wrap">
          <table className="pg-table">
            <thead>
              <tr>
                <th scope="col">Recette active &amp; usage</th>
                <th scope="col" className="pg-num">Qté / série</th>
                <th scope="col" className="pg-num">Écart achat</th>
                <th scope="col">1. Aux lots utilisables (FEFO)</th>
                <th scope="col">2. Au prochain achat</th>
                <th scope="col">Marge &amp; prix maintien</th>
              </tr>
            </thead>
            <tbody>
              {rapport.recettes.map((r) => (
                <tr key={r.versionId}>
                  <td>
                    <strong>{r.familleNom}</strong>{" "}
                    <span className="pg-muted">v{r.version}</span>
                    <div className="pg-help">
                      Série : {quantite(r.rendementBrut, r.rendementUnite)} ({quantite(r.rendementNet)} vendables)
                      {r.usage === "sous-recette" && (
                        <> · via sous-recette <strong>{r.viaSubRecipes.join(", ")}</strong></>
                      )}
                      {r.usage === "mixte" && (
                        <> · direct + sous-recette <strong>{r.viaSubRecipes.join(", ")}</strong></>
                      )}
                    </div>
                  </td>
                  <td className="pg-num">
                    {quantite(r.qteIngredient, r.uniteIngredient)}
                  </td>
                  <td className="pg-num">
                    <strong style={{ color: r.deltaSerie > 0 ? "var(--pg-danger)" : undefined }}>
                      {r.deltaSerie >= 0 ? "+" : ""}
                      {dinars(r.deltaSerie)}
                    </strong>
                    <div className="pg-help">
                      {r.deltaParPart >= 0 ? "+" : ""}
                      {dinars(r.deltaParPart)} / {r.rendementUnite === "pcs" ? "part" : r.rendementUnite}
                    </div>
                  </td>
                  <td>
                    <div className="pg-num">
                      <strong>{dinars(r.lots.coutParPart)}</strong> / part
                      {r.lots.coutPartiel ? " (partiel)" : ""}
                    </div>
                    <div className="pg-help">
                      {r.lots.ancienLotProtege ? (
                        <span className="pg-badge" data-tone="success">Ancien lot couvre la série</span>
                      ) : r.lots.stockCouvreSerie ? (
                        <span>Couvert en stock ({quantite(r.lots.couvertIngredient, r.uniteIngredient)})</span>
                      ) : (
                        <span className="pg-badge" data-tone="warning">
                          Stock partiel ({quantite(r.lots.couvertIngredient)}/{quantite(r.qteIngredient, r.uniteIngredient)})
                        </span>
                      )}
                      {r.lots.perimeExcluIngredient > 0 && (
                        <span> · {quantite(r.lots.perimeExcluIngredient, r.uniteIngredient)} périmé(s) exclu(s)</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="pg-num">
                      <strong>{dinars(r.prochainAchat.coutParPart)}</strong> / part
                      {r.prochainAchat.autresIngredientsPartiels ? " (partiel)" : ""}
                    </div>
                    <div className="pg-help pg-num">
                      Série : {dinars(r.prochainAchat.coutCompletSerie)}
                      {!r.lots.coutPartiel && (
                        <>
                          {" "}
                          ({r.prochainAchat.ecartVsLotsParPart >= 0 ? "+" : ""}
                          {dinars(r.prochainAchat.ecartVsLotsParPart)} vs stock)
                        </>
                      )}
                    </div>
                  </td>
                  <td>
                    {r.prochainAchat.autresIngredientsPartiels ? (
                      <span className="pg-badge" data-tone="warning">
                        Coût partiel ({r.lots.ingredientsPartiels.join(", ")})
                      </span>
                    ) : r.pvHt > 0 && r.prochainAchat.margeParPartHt != null ? (
                      <div className="pg-num">
                        <span
                          className="pg-badge"
                          data-tone={
                            r.prochainAchat.margeParPartHt < 0
                              ? "danger"
                              : (r.prochainAchat.tauxMargePct ?? 0) < 35
                                ? "warning"
                                : "success"
                          }
                        >
                          Marge {dinars(r.prochainAchat.margeParPartHt)} (
                          {quantite(Math.round((r.prochainAchat.tauxMargePct ?? 0) * 10) / 10)} %)
                        </span>
                        {r.prochainAchat.pvHtMaintienMarge != null && (
                          <div className="pg-help">
                            PV actuel {dinars(r.pvHt)} → maintien marge :{" "}
                            <strong>{dinars(r.prochainAchat.pvHtMaintienMarge)}</strong>
                          </div>
                        )}
                      </div>
                    ) : (
                      <span className="pg-help">Sous-recette / prix de vente non défini</span>
                    )}
                    {r.gardeFous.length > 0 && (
                      <div className="pg-help" style={{ color: "var(--pg-danger)" }}>
                        {r.gardeFous[0].message}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="pg-help">
        Lecture seule : ni vos prix de vente catalogue ni vos devis Cake Design déjà confirmés ne sont modifiés automatiquement.
      </p>
    </div>
  );
}

/** Panneau connecté (Supabase, rôles `proprietaire` et `labo` uniquement). */
export function IngredientImpactConnected({
  ingredients,
  alerts = [],
  initialArticleId,
  initialAncien,
  initialNouveau,
}: {
  ingredients: IngredientOption[];
  alerts?: QuickPriceAlert[];
  initialArticleId?: string;
  initialAncien?: number;
  initialNouveau?: number;
}) {
  const first = ingredients.find((i) => i.id === initialArticleId) ?? ingredients[0];
  const [articleId, setArticleId] = useState(first?.id ?? "");
  const [ancienPu, setAncienPu] = useState(
    initialAncien != null ? String(initialAncien) : first?.defaultAncien != null ? String(first.defaultAncien) : "",
  );
  const [nouveauPu, setNouveauPu] = useState(
    initialNouveau != null ? String(initialNouveau) : first?.defaultNouveau != null ? String(first.defaultNouveau) : "",
  );
  const [sourceAncien, setSourceAncien] = useState(first?.sourceAncien ?? "");
  const [sourceNouveau, setSourceNouveau] = useState(first?.sourceNouveau ?? "");
  const [state, action, pending] = useActionState<ImpactActionState, FormData>(analyserHausseMatiereReal, {});

  function selectIngredient(id: string) {
    setArticleId(id);
    const opt = ingredients.find((i) => i.id === id);
    if (!opt) return;
    setAncienPu(opt.defaultAncien != null ? String(opt.defaultAncien) : "");
    setNouveauPu(opt.defaultNouveau != null ? String(opt.defaultNouveau) : "");
    setSourceAncien(opt.sourceAncien ?? "");
    setSourceNouveau(opt.sourceNouveau ?? "");
  }

  function applyAlert(a: QuickPriceAlert) {
    setArticleId(a.articleId);
    setAncienPu(String(a.ancienPu));
    setNouveauPu(String(a.nouveauPu));
    setSourceAncien(a.sourceAncien);
    setSourceNouveau(a.sourceNouveau);
  }

  const currentUnit = ingredients.find((i) => i.id === articleId)?.unite ?? "u";

  return (
    <section className="pg-card pg-card-pad" id="hausse-matiere" aria-labelledby="impact-title">
      <div className="pg-card-head">
        <div>
          <h2 id="impact-title">Impact d’une hausse matière sur les recettes &amp; sous-recettes</h2>
          <p className="pg-help">
            Compare côte à côte le coût sur vos lots FEFO utilisables en stock et le coût au prochain achat fournisseur (sous-recettes et conversions d’unités incluses).
          </p>
        </div>
      </div>

      {alerts.length > 0 && (
        <div className="pg-actions-row" style={{ marginBottom: 12 }}>
          <span className="pg-label">Hausses récentes détectées :</span>
          {alerts.slice(0, 6).map((a) => (
            <button
              key={a.articleId}
              type="button"
              className="pg-btn pg-btn-sec pg-btn-xs"
              onClick={() => applyAlert(a)}
            >
              {a.label} (+{quantite(Math.round(a.variationPct * 10) / 10)} %)
            </button>
          ))}
        </div>
      )}

      <form action={action} className="pg-form-grid">
        <label className="pg-field">
          <span className="pg-label">Ingrédient / matière première</span>
          <select
            name="articleId"
            className="pg-input"
            value={articleId}
            onChange={(e) => selectIngredient(e.target.value)}
            disabled={ingredients.length === 0}
          >
            {ingredients.length === 0 && <option value="">— aucune matière —</option>}
            {ingredients.map((i) => (
              <option key={i.id} value={i.id}>
                {i.label}
              </option>
            ))}
          </select>
        </label>
        <label className="pg-field">
          <span className="pg-label">Ancien prix (DA / {currentUnit})</span>
          <input
            name="ancienPu"
            type="number"
            min={0}
            step="any"
            required
            className="pg-input pg-num"
            value={ancienPu}
            onChange={(e) => {
              setAncienPu(e.target.value);
              setSourceAncien("Prix de référence saisi");
            }}
          />
          {sourceAncien && <span className="pg-help">Source : {sourceAncien}</span>}
        </label>
        <label className="pg-field">
          <span className="pg-label">Nouveau prix (DA / {currentUnit})</span>
          <input
            name="nouveauPu"
            type="number"
            min={0}
            step="any"
            required
            className="pg-input pg-num"
            value={nouveauPu}
            onChange={(e) => {
              setNouveauPu(e.target.value);
              setSourceNouveau("Nouveau prix fournisseur saisi");
            }}
          />
          {sourceNouveau && <span className="pg-help">Source : {sourceNouveau}</span>}
        </label>
        <input type="hidden" name="sourceAncien" value={sourceAncien} />
        <input type="hidden" name="sourceNouveau" value={sourceNouveau} />
        <div className="pg-field" style={{ alignSelf: "end" }}>
          <button type="submit" className="pg-btn" disabled={pending || ingredients.length === 0}>
            {pending ? "Analyse…" : "Calculer l’impact"}
          </button>
        </div>
      </form>

      {state.erreur && (
        <p role="alert" className="pg-alert pg-alert-danger">
          {state.erreur}
        </p>
      )}
      {state.succes && !state.rapport && (
        <p role="status" className="pg-help">
          {state.succes}
        </p>
      )}
      {state.rapport && <ImpactReportView rapport={state.rapport} />}
    </section>
  );
}

/** Panneau démonstration locale (calcul instantané, sous-recette & hausse beurre préchargées). */
export function IngredientImpactDemo({ state, initialArticleId }: { state: State; initialArticleId?: string }) {
  const matieres = useMemo(
    () => state.articles.filter((a) => a.niveau === "matiere"),
    [state.articles],
  );
  const defaultId =
    matieres.find((m) => m.id === initialArticleId)?.id ??
    matieres.find((m) => m.id === "beurre")?.id ??
    matieres[0]?.id ??
    "";

  const [articleId, setArticleId] = useState(defaultId);
  const merc = useMemo(
    () => (articleId ? demoMercurialeFor(state, articleId) : null),
    [state, articleId],
  );
  const [overrideAncien, setAncienPu] = useState<string | null>(null);
  const [overrideNouveau, setNouveauPu] = useState<string | null>(null);
  const [overrideSrcAncien, setSourceAncien] = useState<string | null>(null);
  const [overrideSrcNouveau, setSourceNouveau] = useState<string | null>(null);

  const ancienPu = overrideAncien ?? (merc?.defaultAncien ? String(merc.defaultAncien.pu) : "0");
  const nouveauPu = overrideNouveau ?? (merc?.defaultNouveau ? String(merc.defaultNouveau.pu) : "0");
  const sourceAncien = overrideSrcAncien ?? merc?.defaultAncien?.source ?? "Prix de référence";
  const sourceNouveau = overrideSrcNouveau ?? merc?.defaultNouveau?.source ?? "Nouveau prix saisi";

  const calc = useMemo(() => {
    if (!articleId || ancienPu.trim() === "" || nouveauPu.trim() === "") return null;
    try {
      return {
        erreur: null as string | null,
        rapport: demoIngredientImpact(state, {
          articleId,
          ancienPu: Number(ancienPu),
          sourceAncien: sourceAncien || "Prix saisi",
          nouveauPu: Number(nouveauPu),
          sourceNouveau: sourceNouveau || "Nouveau prix saisi",
        }),
      };
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : "Saisie invalide.", rapport: null };
    }
  }, [state, articleId, ancienPu, nouveauPu, sourceAncien, sourceNouveau]);

  const currentMat = matieres.find((m) => m.id === articleId);

  return (
    <section className="pg-card pg-card-pad" id="hausse-matiere" aria-labelledby="demo-impact-title">
      <div className="pg-card-head">
        <div>
          <h2 id="demo-impact-title">Impact d’une hausse matière (recettes &amp; sous-recettes)</h2>
          <p className="pg-help">
            Visualisez immédiatement quelles recettes absorbent la variation, via un ingrédient direct ou une sous-recette commune, et si vos lots FEFO actuels couvrent encore la série.
          </p>
        </div>
      </div>

      <div className="pg-form-grid">
        <label className="pg-field">
          <span className="pg-label">Ingrédient / matière première</span>
          <select
            className="pg-input"
            value={articleId}
            onChange={(e) => {
              setArticleId(e.target.value);
              setAncienPu(null);
              setNouveauPu(null);
              setSourceAncien(null);
              setSourceNouveau(null);
            }}
          >
            {matieres.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} — {m.nom} ({m.unite})
              </option>
            ))}
          </select>
        </label>
        <label className="pg-field">
          <span className="pg-label">Ancien prix (DA / {currentMat?.unite ?? "u"})</span>
          <input
            type="number"
            min={0}
            step="any"
            className="pg-input pg-num"
            value={ancienPu}
            onChange={(e) => {
              setAncienPu(e.target.value);
              setSourceAncien("Prix de référence saisi (démo)");
            }}
          />
          <span className="pg-help">Source : {sourceAncien}</span>
        </label>
        <label className="pg-field">
          <span className="pg-label">Nouveau prix (DA / {currentMat?.unite ?? "u"})</span>
          <input
            type="number"
            min={0}
            step="any"
            className="pg-input pg-num"
            value={nouveauPu}
            onChange={(e) => {
              setNouveauPu(e.target.value);
              setSourceNouveau("Nouveau prix fournisseur saisi (démo)");
            }}
          />
          <span className="pg-help">Source : {sourceNouveau}</span>
        </label>
        <div className="pg-field" style={{ alignSelf: "end" }}>
          <div className="pg-actions-row">
            {[10, 15, 25].map((pct) => (
              <button
                key={pct}
                type="button"
                className="pg-btn pg-btn-sec pg-btn-xs"
                onClick={() => {
                  const base = Number(ancienPu) || 0;
                  setNouveauPu(String(Math.round(base * (1 + pct / 100) * 100) / 100));
                  setSourceNouveau(`Simulation hausse +${pct} %`);
                }}
              >
                +{pct} %
              </button>
            ))}
          </div>
        </div>
      </div>

      {calc?.erreur && (
        <p role="alert" className="pg-alert pg-alert-danger">
          {calc.erreur}
        </p>
      )}
      {calc?.rapport && <ImpactReportView rapport={calc.rapport} />}
    </section>
  );
}
