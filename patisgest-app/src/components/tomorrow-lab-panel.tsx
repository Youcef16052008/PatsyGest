"use client";

import { useActionState, useMemo, useState } from "react";
import { cancelRestockRequestReal, createRestockRequestReal, validateTomorrowLineReal } from "@/lib/actions-planning";
import { type JournalState } from "@/lib/journal-actions-communs";
import { transferReal, type TransferState } from "@/lib/actions-stock";
import ClientRefField from "./client-ref-field";
import { demoTomorrowPlan } from "@/lib/demo-workspace";
import {
  addRestockRequest,
  createProduction,
  transferStock,
  updateRestockRequests,
  type State,
} from "@/lib/patisgest-store";
import type { RestockRequestItem, TomorrowLabPlan, TomorrowLine } from "@/lib/tomorrow-lab";
import { dateLisible, jourLocal, plusJours, quantite, type WorkspaceSite } from "@/lib/workspace-data";

function ValidateLineRowConnected({
  line,
  targetDate,
  labSiteId,
  boutiqueSiteId,
  canCreateOf,
}: {
  line: TomorrowLine;
  targetDate: string;
  labSiteId: string;
  boutiqueSiteId: string;
  canCreateOf: boolean;
}) {
  const [qteOf, setQteOf] = useState(String(line.aPreparer));
  const [qteTr, setQteTr] = useState(String(line.aTransfererDuLabo));
  const [responsable, setResponsable] = useState("");
  const [ofState, ofAction, ofPending] = useActionState<JournalState, FormData>(validateTomorrowLineReal, {});
  const [trState, trAction, trPending] = useActionState<TransferState, FormData>(transferReal, {});

  return (
    <tr>
      <td>
        <strong>{line.nom}</strong> <span className="pg-muted">({line.code})</span>
        <ul className="pg-tomorrow-reasons">
          {line.raisons.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
        {line.rupturesMatieres.length > 0 && (
          <p className="pg-help" style={{ color: "var(--pg-danger)" }}>
            Manque matière :{" "}
            {line.rupturesMatieres.map((m) => `${m.nom} (${quantite(m.manque, m.unite)})`).join(", ")}
          </p>
        )}
      </td>
      <td className="pg-num">
        <strong>{quantite(line.besoinBrut, line.unite)}</strong>
        <div className="pg-help">
          {quantite(line.besoinVitrine)} vitrine
          {line.commandesConfirmees > 0 && ` + ${quantite(line.commandesConfirmees)} cmd`}
        </div>
      </td>
      <td className="pg-num">
        {quantite(line.stockBoutiqueUtilisable, line.unite)}
        {line.stockPerimeExclu > 0 && (
          <div className="pg-help" style={{ color: "var(--pg-danger)" }}>
            {quantite(line.stockPerimeExclu)} périmé(s) exclu(s)
          </div>
        )}
        {line.stockBloqueExclu > 0 && (
          <div className="pg-help">{quantite(line.stockBloqueExclu)} bloqué(s)</div>
        )}
      </td>
      <td className="pg-num">
        {line.aTransfererDuLabo > 0 && boutiqueSiteId && boutiqueSiteId !== labSiteId ? (
          <form action={trAction} className="pg-inline-action">
            <ClientRefField key={trState.succes ?? ""} />
            <input type="hidden" name="articleId" value={line.articleId} />
            <input type="hidden" name="fromSiteId" value={labSiteId} />
            <input type="hidden" name="toSiteId" value={boutiqueSiteId} />
            <input type="hidden" name="motif" value={`Demain au labo (${targetDate})`} />
            <input type="hidden" name="demandesIds" value={line.demandesIds.join(",")} />
            <input
              name="qte"
              type="number"
              min={0.0001}
              max={line.stockLaboUtilisable}
              step="any"
              aria-label={`Quantité à transférer ${line.nom}`}
              className="pg-input pg-input-sm pg-num"
              style={{ width: 72 }}
              value={qteTr}
              onChange={(e) => setQteTr(e.target.value)}
            />
            <input
              name="responsable"
              maxLength={80}
              placeholder="Responsable"
              aria-label={`Responsable transfert ${line.nom}`}
              className="pg-input pg-input-sm"
              style={{ width: 110 }}
              value={responsable}
              onChange={(e) => setResponsable(e.target.value)}
            />
            <button type="submit" className="pg-btn pg-btn-sec pg-btn-xs" disabled={trPending || Boolean(trState.succes) || Boolean(trState.erreur?.includes("effectué, mais"))}>
              {trPending ? "…" : "Transférer"}
            </button>
            {trState.succes && <span className="pg-help">{trState.succes}</span>}
            {trState.erreur && <span className="pg-help" style={{ color: "var(--pg-danger)" }}>{trState.erreur}</span>}
          </form>
        ) : (
          <span className="pg-muted">—</span>
        )}
      </td>
      <td>
        {line.aPreparer > 0 && line.recipe && !canCreateOf ? <span className="pg-help">Module Production désactivé : validation indisponible.</span> : line.aPreparer > 0 && line.recipe ? (
          <form action={ofAction} className="pg-inline-action">
            <input type="hidden" name="versionId" value={line.recipe.versionId} />
            <input type="hidden" name="siteId" value={labSiteId} />
            <input type="hidden" name="datePrevue" value={targetDate} />
            <input type="hidden" name="clientRef" value={line.clientRef ?? ""} />
            <input type="hidden" name="demandesIds" value={line.demandesIds.join(",")} />
            <input
              name="qtePrevue"
              type="number"
              min={0.0001}
              step="any"
              aria-label={`Quantité à fabriquer ${line.nom}`}
              className="pg-input pg-input-sm pg-num"
              style={{ width: 76 }}
              value={qteOf}
              onChange={(e) => setQteOf(e.target.value)}
            />
            <button type="submit" className="pg-btn pg-btn-xs" disabled={ofPending}>
              {ofPending ? "Création…" : "Valider l’OF"}
            </button>
            {line.recipe.dureeEstimeeMin > 0 && (
              <span className="pg-help">~{line.recipe.dureeEstimeeMin} min</span>
            )}
            {ofState.succes && <span className="pg-help">{ofState.succes}</span>}
            {ofState.erreur && <span className="pg-help" style={{ color: "var(--pg-danger)" }}>{ofState.erreur}</span>}
          </form>
        ) : line.aPreparer > 0 ? (
          <span className="pg-badge" data-tone="warning">
            {quantite(line.aPreparer, line.unite)} — recette active à créer
          </span>
        ) : line.dejaEnFabrication > 0 ? (
          <span className="pg-badge" data-tone="success">
            Couvert par {line.ofsExistants.join(", ")}
          </span>
        ) : (
          <span className="pg-badge" data-tone="success">Couvert en stock</span>
        )}
      </td>
    </tr>
  );
}

/** Panneau « Demain au labo » connecté (chef/propriétaire : plan + validation ; vendeur : demande boutique). */
export function TomorrowLabConnected({
  targetDate,
  boutiqueSites,
  labSite,
  products,
  restockRequests,
  plan,
  canValidate,
  canCreateOf = true,
  canTransfer = true,
}: {
  targetDate: string;
  boutiqueSites: WorkspaceSite[];
  labSite: WorkspaceSite | null;
  products: { id: string; code: string; nom: string; unite: string }[];
  restockRequests: RestockRequestItem[];
  plan: TomorrowLabPlan | null;
  canValidate: boolean;
  canCreateOf?: boolean;
  canTransfer?: boolean;
}) {
  const [reqState, reqAction, reqPending] = useActionState<JournalState, FormData>(createRestockRequestReal, {});
  const [cancelState, cancelAction, cancelPending] = useActionState<JournalState, FormData>(cancelRestockRequestReal, {});
  const prodById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const openReqs = restockRequests.filter((r) => r.statut === "ouverte");
  const defaultBoutique = boutiqueSites[0]?.id ?? "";
  // Les besoins sont encore agrégés : ne jamais envoyer le total multi-boutique
  // vers la première boutique par défaut.
  const transferBoutique = boutiqueSites.length === 1 && canTransfer ? defaultBoutique : "";

  return (
    <div className="pg-stack">
      {canValidate && plan && (
        <section className="pg-card pg-card-pad" id="demain-au-labo" aria-labelledby="tomorrow-title">
          <div className="pg-card-head">
            <div>
              <h2 id="tomorrow-title">
                Demain au labo — {plan.jourSemaineLabel} {dateLisible(plan.targetDate, "long")}
              </h2>
              <p className="pg-help">
                Proposition calculée sans réservation cachée : besoin vitrine ou demande boutique + commandes confirmées − stock utilisable à cette date (lots bloqués et périmés exclus). Le chef ajuste et valide chaque OF.
              </p>
            </div>
            <div className="pg-actions-row">
              <span className="pg-badge" data-tone={plan.totalAPreparerLignes > 0 ? "warning" : "success"}>
                {plan.totalAPreparerLignes} à fabriquer
              </span>
              {plan.totalATransfererLignes > 0 && (
                <span className="pg-badge" data-tone="planned">
                  {plan.totalATransfererLignes} à transférer du labo
                </span>
              )}
              {plan.chargeEstimeeMin > 0 && (
                <span className="pg-badge" data-tone="planned">
                  Charge ~{plan.chargeEstimeeMin} min
                </span>
              )}
            </div>
          </div>

          {!canTransfer && <p role="status" className="pg-help">Module Transferts désactivé : transfert direct indisponible.</p>}
          {boutiqueSites.length > 1 && <p role="alert" className="pg-help">Transfert direct indisponible : plusieurs boutiques nécessitent une répartition par site.</p>}
          {plan.lignes.length === 0 ? (
            <p className="pg-help">
              Aucun besoin net détecté pour le {dateLisible(plan.targetDate)}. Saisissez une demande de réassort boutique ci-dessous ou enregistrez vos ventes comptoir.
            </p>
          ) : (
            <div className="pg-table-wrap">
              <table className="pg-table">
                <thead>
                  <tr>
                    <th scope="col">Produit &amp; origine du besoin</th>
                    <th scope="col" className="pg-num">Besoin brut</th>
                    <th scope="col" className="pg-num">Boutique éligible</th>
                    <th scope="col" className="pg-num">Prêt au labo → boutique</th>
                    <th scope="col">À préparer (validation chef)</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lignes.map((line) => (
                    <ValidateLineRowConnected
                      key={line.articleId}
                      line={line}
                      targetDate={plan.targetDate}
                      labSiteId={labSite?.id ?? ""}
                      boutiqueSiteId={transferBoutique}
                      canCreateOf={canCreateOf}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {plan.commandesSurMesure.length > 0 && (
            <div className="pg-subpanel">
              <h3>Commandes Cake Design confirmées à fabriquer le {dateLisible(plan.targetDate, "short")}</h3>
              <ul className="pg-simple-list">
                {plan.commandesSurMesure.map((c) => (
                  <li key={c.id}>
                    <strong>{c.numero}</strong> · {c.clientNom} — <strong>{c.nbParts} parts</strong> (retrait{" "}
                    {dateLisible(c.eventDate, "short")}){c.ofNumero ? ` · OF lié ${c.ofNumero}` : ""}{c.notes ? ` · ${c.notes}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.matieres.length > 0 && (
            <div className="pg-subpanel">
              <h3>Couverture matières premières au labo (lots éligibles au {dateLisible(plan.targetDate, "short")})</h3>
              <div className="pg-table-wrap">
                <table className="pg-table">
                  <thead>
                    <tr>
                      <th scope="col">Matière</th>
                      <th scope="col" className="pg-num">Besoin cumulé</th>
                      <th scope="col" className="pg-num">Utilisable labo</th>
                      <th scope="col" className="pg-num">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.matieres.map((m) => (
                      <tr key={m.articleId}>
                        <td>
                          <strong>{m.nom}</strong> <span className="pg-muted">({m.code})</span>
                          <div className="pg-help">Pour : {m.produitsConcernes.join(", ")}</div>
                        </td>
                        <td className="pg-num">{quantite(m.besoin, m.unite)}</td>
                        <td className="pg-num">
                          {quantite(m.disponibleLabo, m.unite)}
                          {m.perimeExcluLabo > 0 && (
                            <div className="pg-help" style={{ color: "var(--pg-danger)" }}>
                              +{quantite(m.perimeExcluLabo)} périmé(s) exclu(s)
                            </div>
                          )}
                        </td>
                        <td className="pg-num">
                          {m.manque > 0 ? (
                            <span className="pg-badge" data-tone="danger">
                              Manque {quantite(m.manque, m.unite)}
                            </span>
                          ) : (
                            <span className="pg-badge" data-tone="success">Couvert</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Demande explicite boutique -> labo (accessible aussi au rôle vendeur, sans coût) */}
      <section className="pg-card pg-card-pad" aria-labelledby="restock-title">
        <div className="pg-card-head">
          <div>
            <h2 id="restock-title">Demande de réassort boutique → labo</h2>
            <p className="pg-help">
              Transmettez au laboratoire les quantités souhaitées en vitrine pour demain (ou une date précise), sans modifier le stock tant que le chef n’a pas validé.
            </p>
          </div>
        </div>
        <form action={reqAction} className="pg-form-grid">
          <label className="pg-field">
            <span className="pg-label">Date cible</span>
            <input name="dateCible" type="date" defaultValue={targetDate} required className="pg-input" />
          </label>
          <label className="pg-field">
            <span className="pg-label">Boutique</span>
            <select name="siteId" required className="pg-input" defaultValue={defaultBoutique}>
              {boutiqueSites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="pg-field">
            <span className="pg-label">Produit fini</span>
            <select name="articleId" required className="pg-input" disabled={products.length === 0}>
              {products.length === 0 && <option value="">— aucun produit —</option>}
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.nom} ({p.unite})
                </option>
              ))}
            </select>
          </label>
          <label className="pg-field">
            <span className="pg-label">Quantité souhaitée</span>
            <input name="qte" type="number" min={0.0001} step="any" required className="pg-input pg-num" />
          </label>
          <label className="pg-field">
            <span className="pg-label">Motif / précision</span>
            <input
              name="motif"
              maxLength={200}
              placeholder="Vitrine matin, week-end, réservation…"
              className="pg-input"
            />
          </label>
          <div className="pg-field" style={{ alignSelf: "end" }}>
            <button type="submit" className="pg-btn" disabled={reqPending || products.length === 0}>
              {reqPending ? "Envoi…" : "Envoyer au labo"}
            </button>
          </div>
        </form>
        {reqState.erreur && (
          <p role="alert" className="pg-alert pg-alert-danger">
            {reqState.erreur}
          </p>
        )}
        {reqState.succes && (
          <p role="status" className="pg-help" style={{ marginTop: 8 }}>
            {reqState.succes}
          </p>
        )}

        {openReqs.length > 0 && (
          <div className="pg-subpanel">
            <h3>Demandes boutique en attente ({openReqs.length})</h3>
            <ul className="pg-simple-list">
              {openReqs.map((r) => {
                const prod = prodById.get(r.articleId);
                return (
                  <li key={r.id} className="pg-list-between">
                    <span>
                      <strong>{dateLisible(r.targetDate, "short")}</strong> · {r.siteLabel} —{" "}
                      <strong>
                        {prod?.nom ?? "Produit"} × {quantite(r.qty, prod?.unite)}
                      </strong>
                      {r.motif ? ` · ${r.motif}` : ""}
                      {r.demandeur ? ` (${r.demandeur})` : ""}
                    </span>
                    {canValidate && (
                      <form action={cancelAction}>
                        <input type="hidden" name="id" value={r.id} />
                        <button type="submit" className="pg-btn pg-btn-sec pg-btn-xs" disabled={cancelPending}>
                          Écarter
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
            {cancelState.erreur && (
              <p role="alert" className="pg-help" style={{ color: "var(--pg-danger)" }}>
                {cancelState.erreur}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

/** Panneau « Demain au labo » en mode démonstration (local, sans réseau). */
export function TomorrowLabDemo({
  state,
  apply,
  canValidate = true,
}: {
  state: State;
  apply: (fn: (s: State) => State, ok: string) => boolean;
  canValidate?: boolean;
}) {
  const [targetDate, setTargetDate] = useState(() => plusJours(jourLocal(), 1));
  const [reqProduct, setReqProduct] = useState(
    () => state.articles.find((a) => a.niveau === "produit")?.id ?? "",
  );
  const [reqQty, setReqQty] = useState("24");
  const [reqMotif, setReqMotif] = useState("");
  const [responsable, setResponsable] = useState("Chef labo");
  const [customQty, setCustomQty] = useState<Record<string, string>>({});

  const products = useMemo(
    () => state.articles.filter((a) => a.niveau === "produit"),
    [state.articles],
  );
  const plan = useMemo(() => {
    if (!canValidate) return null;
    try {
      return demoTomorrowPlan(state, targetDate);
    } catch {
      return null;
    }
  }, [state, targetDate, canValidate]);

  return (
    <section className="pg-card pg-card-pad" id="demain-au-labo" aria-labelledby="demo-tomorrow-title">
      <div className="pg-card-head">
        <div>
          <h2 id="demo-tomorrow-title">
            Demain au labo {plan ? `— ${plan.jourSemaineLabel} ${dateLisible(plan.targetDate, "long")}` : ""}
          </h2>
          <p className="pg-help">
            Ventes comptoir attendues ou demande boutique + commandes confirmées − stock utilisable (hors lots bloqués et hors DLC dépassées) = quantités à transférer du labo et fournées à valider.
          </p>
        </div>
        <label className="pg-field" style={{ minWidth: 165 }}>
          <span className="pg-label">Date à préparer</span>
          <input
            type="date"
            className="pg-input pg-input-sm"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
          />
        </label>
      </div>

      {plan && (
        <>
          <div className="pg-actions-row" style={{ marginBottom: 12 }}>
            <span className="pg-badge" data-tone={plan.totalAPreparerLignes > 0 ? "warning" : "success"}>
              {plan.totalAPreparerLignes} produit(s) à fabriquer
            </span>
            <span className="pg-badge" data-tone="planned">
              {plan.totalATransfererLignes} transfert(s) prêt(s) au labo
            </span>
            <span className="pg-badge" data-tone="planned">
              Charge estimée : {plan.chargeEstimeeMin} min
            </span>
            <label className="pg-inline-action" style={{ marginLeft: "auto" }}>
              <span className="pg-label">Responsable transfert :</span>
              <input
                className="pg-input pg-input-sm"
                style={{ width: 140 }}
                maxLength={80}
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
              />
            </label>
          </div>

          {plan.lignes.length > 0 && (
            <div className="pg-table-wrap">
              <table className="pg-table">
                <thead>
                  <tr>
                    <th scope="col">Produit &amp; détail du calcul</th>
                    <th scope="col" className="pg-num">Besoin brut</th>
                    <th scope="col" className="pg-num">Boutique éligible</th>
                    <th scope="col">Prêt au labo</th>
                    <th scope="col">À préparer (chef)</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.lignes.map((l) => {
                    const qVal = customQty[l.articleId] ?? String(l.aPreparer);
                    return (
                      <tr key={l.articleId}>
                        <td>
                          <strong>{l.nom}</strong> <span className="pg-muted">({l.code})</span>
                          <ul className="pg-tomorrow-reasons">
                            {l.raisons.map((r, i) => (
                              <li key={i}>{r}</li>
                            ))}
                          </ul>
                          {l.rupturesMatieres.length > 0 && (
                            <p className="pg-help" style={{ color: "var(--pg-danger)" }}>
                              Rupture matière :{" "}
                              {l.rupturesMatieres.map((m) => `${m.nom} (manque ${quantite(m.manque, m.unite)})`).join(", ")}
                            </p>
                          )}
                        </td>
                        <td className="pg-num">{quantite(l.besoinBrut, l.unite)}</td>
                        <td className="pg-num">{quantite(l.stockBoutiqueUtilisable, l.unite)}</td>
                        <td>
                          {l.aTransfererDuLabo > 0 ? (
                            <button
                              type="button"
                              className="pg-btn pg-btn-sec pg-btn-xs"
                              onClick={() =>
                                apply(
                                  (s) => {
                                    const next = transferStock(
                                      s,
                                      l.articleId,
                                      l.aTransfererDuLabo,
                                      "Labo",
                                      "Boutique",
                                      {
                                        responsable,
                                        motif: `Réassort ${targetDate}`,
                                        asOf: targetDate,
                                      },
                                    );
                                    const trId = next.transfers.at(-1)?.id;
                                    return l.aPreparer === 0
                                      ? updateRestockRequests(next, l.demandesIds, "transferee", { transferId: trId })
                                      : next;
                                  },
                                  `Transfert Labo → Boutique enregistré (${l.nom} × ${l.aTransfererDuLabo}, responsable : ${responsable || "non précisé"}).`,
                                )
                              }
                            >
                              Transférer {quantite(l.aTransfererDuLabo, l.unite)}
                            </button>
                          ) : (
                            <span className="pg-muted">—</span>
                          )}
                        </td>
                        <td>
                          {l.aPreparer > 0 && l.recipe ? (
                            <div className="pg-inline-action">
                              <input
                                type="number"
                                min={0.0001}
                                step="any"
                                aria-label={`Quantité OF ${l.nom}`}
                                className="pg-input pg-input-sm pg-num"
                                style={{ width: 74 }}
                                value={qVal}
                                onChange={(e) => setCustomQty((p) => ({ ...p, [l.articleId]: e.target.value }))}
                              />
                              <button
                                type="button"
                                className="pg-btn pg-btn-xs"
                                onClick={() =>
                                  apply(
                                    (s) => {
                                      const next = createProduction(
                                        s,
                                        Number(qVal),
                                        l.recipe!.recipeId,
                                        targetDate,
                                        l.clientRef ?? undefined,
                                      );
                                      const ofId = next.productions.at(-1)?.id;
                                      return updateRestockRequests(next, l.demandesIds, "planifiee", { ofId });
                                    },
                                    `Ordre de fabrication planifié pour ${l.nom} (${qVal} ${l.unite}) le ${targetDate}.`,
                                  )
                                }
                              >
                                Valider l’OF
                              </button>
                            </div>
                          ) : l.dejaEnFabrication > 0 ? (
                            <span className="pg-badge" data-tone="success">
                              En OF ({l.ofsExistants.join(", ")})
                            </span>
                          ) : (
                            <span className="pg-badge" data-tone="success">Couvert</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {plan.commandesSurMesure.length > 0 && (
            <div className="pg-subpanel">
              <h3>Commandes Cake Design confirmées à fabriquer le {dateLisible(targetDate, "short")}</h3>
              <ul className="pg-simple-list">
                {plan.commandesSurMesure.map((c) => (
                  <li key={c.id}>
                    <strong>{c.numero}</strong> · {c.clientNom} — <strong>{c.nbParts} parts</strong> (événement{" "}
                    {dateLisible(c.eventDate, "short")}){c.ofNumero ? ` · OF lié ${c.ofNumero}` : ""}{c.notes ? ` · ${c.notes}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {plan.matieres.length > 0 && (
            <div className="pg-subpanel">
              <h3>Matières premières requises au labo (lots éligibles)</h3>
              <div className="pg-actions-row">
                {plan.matieres.map((m) => (
                  <span
                    key={m.articleId}
                    className="pg-badge"
                    data-tone={m.manque > 0 ? "danger" : "success"}
                  >
                    {m.nom} : besoin {quantite(m.besoin, m.unite)} / dispo {quantite(m.disponibleLabo, m.unite)}
                    {m.manque > 0 ? ` (manque ${quantite(m.manque)})` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <div className="pg-subpanel">
        <h3>Saisir une demande de réassort boutique</h3>
        <form
          className="pg-form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            if (
              apply(
                (s) =>
                  addRestockRequest(s, {
                    targetDate,
                    site: "Boutique",
                    articleId: reqProduct,
                    qty: Number(reqQty),
                    motif: reqMotif,
                    demandeur: "Boutique (démo)",
                  }),
                "Demande de réassort ajoutée à « Demain au labo ».",
              )
            ) {
              setReqMotif("");
            }
          }}
        >
          <label className="pg-field">
            <span className="pg-label">Produit fini</span>
            <select className="pg-input" value={reqProduct} onChange={(e) => setReqProduct(e.target.value)}>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.nom}
                </option>
              ))}
            </select>
          </label>
          <label className="pg-field">
            <span className="pg-label">Quantité souhaitée</span>
            <input
              type="number"
              min={1}
              step="any"
              required
              className="pg-input pg-num"
              value={reqQty}
              onChange={(e) => setReqQty(e.target.value)}
            />
          </label>
          <label className="pg-field">
            <span className="pg-label">Motif</span>
            <input
              className="pg-input"
              maxLength={200}
              placeholder="Vitrine, commande client…"
              value={reqMotif}
              onChange={(e) => setReqMotif(e.target.value)}
            />
          </label>
          <div className="pg-field" style={{ alignSelf: "end" }}>
            <button type="submit" className="pg-btn pg-btn-sec">
              Demander pour le {dateLisible(targetDate, "short")}
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}
