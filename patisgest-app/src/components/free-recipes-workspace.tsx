"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import {
  deleteFreeRecipeCloud,
  saveFreeRecipeCloud,
  syncLocalRecipesToCloud,
} from "@/lib/actions-free-recipes";
import { submitEmployeePriceProposalCloud } from "@/lib/actions-price-alerts";
import {
  DEMO_OWNER_ALERTS_KEY_PREFIX,
  evaluateEmployeePriceSubmission,
  type OwnerPriceAlert,
} from "@/lib/owner-price-guard";
import {
  computeFreeRecipeSummary,
  defaultPriceBasisForUnit,
  FREE_RECIPES_KEY_PREFIX,
  lineCostDa,
  starterFreeRecipes,
  type FreeIngredientLine,
  type FreePriceBasis,
  type FreeRecipe,
  type FreeUnit,
  type StockSuggestion,
} from "@/lib/free-recipes";
import FetesPlanner from "./fetes-planner";
import PortionEstimator from "./portion-estimator";
import { Icon } from "./workspace-icons";
import { jourLocal } from "@/lib/workspace-data";
import {
  compressImageFileToDataUrl,
  defaultRecipePhoto,
  RECIPE_PHOTOS,
} from "@/lib/pastry-visuals";

/*
 * Écran « Recettes » volontairement court.
 *
 * Constat de terrain : une recette servait à tout — nom, parts, unité, photo,
 * cinq champs par ingrédient, base de prix, emballage, cuisson, marge… Trois
 * quarts des champs n'étaient utiles qu'une fois par mois.
 *
 * Règle appliquée ici : ce qui sert à CHAQUE recette est visible ; le reste est
 * replié derrière « Plus d'options » (photo, emballage, cuisson, lien au stock,
 * notes). Un seul chemin pour créer : nom → ingrédients → prix → enregistrer.
 */

type Tab = "libre" | "calculateur" | "fetes" | "stock";

const UNITS: FreeUnit[] = ["g", "kg", "ml", "cl", "L", "pcs"];
const money = (n: number) => `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n)} DA`;
const unitsLabel = (u: string) => (u === "pcs" ? "pièces" : u);

/** Photo affichée : choix explicite, sinon illustration déduite du nom. */
function photoDe(recipe: FreeRecipe): string | null {
  return recipe.photo ?? defaultRecipePhoto(recipe.nom);
}

function makeEmptyRecipe(): FreeRecipe {
  return {
    id: `free-${crypto.randomUUID()}`,
    nom: "",
    portions: 12,
    unitePortion: "parts",
    emballageDa: 0,
    cuissonMoDa: 0,
    prixVenteDa: 0,
    notes: "",
    updatedAt: jourLocal(),
    ingredients: [
      { id: crypto.randomUUID(), nom: "", qty: 500, unite: "g", prix: 0, basePrix: "par_kg", stockArticleId: null },
    ],
  };
}

export default function FreeRecipesWorkspace({
  scopeKey,
  stockSuggestions = [],
  canEdit = true,
  sessionMode = null,
  canReadCosts = false,
  userRole = "proprietaire",
  userName = "Équipe",
  initialCloudRecipes,
  cloudTableAvailable = false,
  stockLinkedNode,
}: {
  scopeKey: string;
  stockSuggestions?: StockSuggestion[];
  canEdit?: boolean;
  sessionMode?: "supabase" | "demo" | null;
  canReadCosts?: boolean;
  userRole?: string;
  userName?: string;
  initialCloudRecipes?: FreeRecipe[];
  cloudTableAvailable?: boolean;
  stockLinkedNode?: ReactNode;
}) {
  const [tab, setTab] = useState<Tab>("libre");
  const storageKey = `${FREE_RECIPES_KEY_PREFIX}${scopeKey}`;

  const [recipes, setRecipes] = useState<FreeRecipe[]>(() =>
    cloudTableAvailable && Array.isArray(initialCloudRecipes) && initialCloudRecipes.length > 0
      ? initialCloudRecipes
      : starterFreeRecipes(),
  );
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<FreeRecipe | null>(null);
  const [feedback, setFeedback] = useState<string>("");
  const [photoStatus, setPhotoStatus] = useState<string>("");
  const [localOnlyRecipes, setLocalOnlyRecipes] = useState<FreeRecipe[]>([]);
  const [syncPending, startSyncTransition] = useTransition();
  const [showExtra, setShowExtra] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as FreeRecipe[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          if (cloudTableAvailable && Array.isArray(initialCloudRecipes)) {
            const cloudNames = new Set(initialCloudRecipes.map((r) => r.nom.trim().toLowerCase()));
            const unsynced = parsed.filter((r) => !cloudNames.has(r.nom.trim().toLowerCase()));
            setLocalOnlyRecipes(unsynced);
            if (initialCloudRecipes.length > 0) {
              setRecipes(initialCloudRecipes);
            } else {
              setRecipes(parsed);
            }
          } else {
            setRecipes(parsed);
          }
        }
      } else if (cloudTableAvailable && Array.isArray(initialCloudRecipes) && initialCloudRecipes.length > 0) {
        setRecipes(initialCloudRecipes);
      }
    } catch {
      /* ignore corrupted local data */
    }
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey, cloudTableAvailable, initialCloudRecipes]);

  function persist(next: FreeRecipe[]) {
    setRecipes(next);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next));
    } catch {
      /* ignore quota errors */
    }
  }

  const activeSummary = useMemo(
    () => (editing ? computeFreeRecipeSummary(editing) : null),
    [editing],
  );

  const visibles = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("fr");
    if (!q) return recipes;
    return recipes.filter((r) => r.nom.toLocaleLowerCase("fr").includes(q));
  }, [recipes, search]);

  /** Ouvre le formulaire, ou le referme : une seule action, un seul bouton. */
  function nouvelleRecette() {
    setEditing(makeEmptyRecipe());
    setShowExtra(false);
    setPhotoStatus("");
    setFeedback("");
  }

  /** Photo choisie dans la galerie livrée, ou retirée. */
  function chooseRecipePhoto(src: string | null) {
    if (!editing) return;
    setEditing({ ...editing, photo: src });
    setPhotoStatus(src ? "Photo choisie — enregistrez la recette pour la garder." : "Photo retirée.");
  }

  /**
   * Photo prise au téléphone ou choisie dans la pellicule : elle est réduite
   * et compressée ici (520 px, JPEG 0,72) avant de partir en base — jamais
   * l'original de plusieurs Mo.
   */
  async function onRecipePhotoFile(file: File | undefined) {
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) {
      setPhotoStatus("Choisissez une photo (JPEG, PNG, WebP).");
      return;
    }
    try {
      setPhotoStatus("Préparation de la photo…");
      const compressed = await compressImageFileToDataUrl(file, 520, 0.72);
      setEditing({ ...editing, photo: compressed });
      setPhotoStatus(`Photo prête (${Math.round(compressed.length / 1024)} Ko) — enregistrez la recette.`);
    } catch {
      setPhotoStatus("Impossible de lire cette image.");
    }
  }

  function saveDraft() {
    if (!editing) return;
    const cleanName = editing.nom.trim();
    if (!cleanName) {
      setFeedback("Écrivez d’abord le nom de la recette.");
      return;
    }
    const cleanIngredients = editing.ingredients.filter((l) => l.nom.trim() !== "");
    if (cleanIngredients.length === 0) {
      setFeedback("Ajoutez au moins un ingrédient : il faut juste son nom et sa quantité.");
      return;
    }
    const saved: FreeRecipe = {
      ...editing,
      nom: cleanName,
      portions: Math.max(1, Number(editing.portions) || 1),
      unitePortion: editing.unitePortion.trim() || "parts",
      ingredients: cleanIngredients,
      updatedAt: jourLocal(),
    };
    const summary = computeFreeRecipeSummary(saved);
    const exists = recipes.some((r) => r.id === saved.id);
    const next = exists ? recipes.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...recipes];
    persist(next);
    setEditing(null);
    setShowExtra(false);

    const isEmployee = userRole !== "proprietaire" && saved.prixVenteDa > 0;
    if (sessionMode === "demo" && isEmployee) {
      const alert = evaluateEmployeePriceSubmission({
        cibleType: "recette_libre",
        cibleId: saved.id,
        nomProduit: saved.nom,
        categorie: "recette",
        prixSaisiDa: saved.prixVenteDa,
        coutEstimeDa: summary.coutParPart,
        auteurNom: userName,
        auteurRole: userRole,
      });
      if (alert) {
        try {
          const alertKey = `${DEMO_OWNER_ALERTS_KEY_PREFIX}${scopeKey}`;
          const raw = window.localStorage.getItem(alertKey);
          const list: OwnerPriceAlert[] = raw ? JSON.parse(raw) : [];
          window.localStorage.setItem(alertKey, JSON.stringify([alert, ...(Array.isArray(list) ? list : [])]));
          window.dispatchEvent(new Event("patisgest-owner-alerts"));
        } catch {
          /* ignore */
        }
        setFeedback(
          alert.severite === "critical"
            ? `Recette « ${saved.nom} » enregistrée · Le patron est averti : ce prix est très bas.`
            : `Recette « ${saved.nom} » enregistrée · Le patron vérifiera ce prix.`,
        );
        return;
      }
    }

    if (sessionMode === "supabase" && cloudTableAvailable) {
      startSyncTransition(async () => {
        const res = await saveFreeRecipeCloud(saved);
        const finalId = res.ok && res.id ? res.id : saved.id;
        if (res.ok && res.id && res.id !== saved.id) {
          persist(next.map((r) => (r.id === saved.id ? { ...r, id: res.id! } : r)));
        }
        if (isEmployee) {
          await submitEmployeePriceProposalCloud({
            cibleType: "recette_libre",
            cibleId: finalId,
            nomProduit: saved.nom,
            categorie: "recette",
            prixSaisiDa: saved.prixVenteDa,
            coutEstimeDa: summary.coutParPart,
          });
        }
        setFeedback(
          res.ok
            ? isEmployee
              ? `Recette « ${saved.nom} » enregistrée · Le patron est averti du prix ✓`
              : `Recette « ${saved.nom} » enregistrée ✓`
            : `Recette « ${saved.nom} » gardée sur cet appareil (${res.erreur ?? "synchro plus tard"}).`,
        );
      });
    } else {
      setFeedback(`Recette « ${saved.nom} » enregistrée ✓`);
    }
  }

  function removeRecipe(id: string) {
    const next = recipes.filter((r) => r.id !== id);
    persist(next);
    if (editing?.id === id) setEditing(null);
    if (sessionMode === "supabase" && cloudTableAvailable) {
      startSyncTransition(async () => {
        await deleteFreeRecipeCloud(id);
      });
    }
    setFeedback("Recette supprimée.");
  }

  function syncLocalToCloud() {
    if (localOnlyRecipes.length === 0) return;
    startSyncTransition(async () => {
      const res = await syncLocalRecipesToCloud(localOnlyRecipes);
      if (res.ok) {
        setLocalOnlyRecipes([]);
        setFeedback(`${res.count} recette(s) enregistrée(s) en ligne ✓`);
      } else {
        setFeedback(res.erreur ?? "Enregistrement en ligne indisponible pour l’instant.");
      }
    });
  }

  function duplicateRecipe(recipe: FreeRecipe) {
    const copy: FreeRecipe = {
      ...structuredClone(recipe),
      id: `free-${crypto.randomUUID()}`,
      nom: `${recipe.nom} (copie)`,
      ingredients: recipe.ingredients.map((l) => ({ ...l, id: crypto.randomUUID() })),
    };
    persist([copy, ...recipes]);
    setFeedback(`Copie de « ${recipe.nom} » ajoutée.`);
  }

  function addIngredientRow() {
    if (!editing) return;
    setEditing({
      ...editing,
      ingredients: [
        ...editing.ingredients,
        { id: crypto.randomUUID(), nom: "", qty: 100, unite: "g", prix: 0, basePrix: "par_kg", stockArticleId: null },
      ],
    });
  }

  function updateLine(lineId: string, patch: Partial<FreeIngredientLine>) {
    if (!editing) return;
    setEditing({
      ...editing,
      ingredients: editing.ingredients.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
    });
  }

  function linkIngredientToStock(lineId: string, articleId: string) {
    if (!editing) return;
    if (!articleId) {
      updateLine(lineId, { stockArticleId: null });
      return;
    }
    const art = stockSuggestions.find((a) => a.id === articleId);
    if (!art) return;
    const unitNorm = (UNITS.includes(art.unite as FreeUnit) ? art.unite : "kg") as FreeUnit;
    updateLine(lineId, {
      stockArticleId: art.id,
      nom: art.nom,
      unite: unitNorm,
      basePrix: defaultPriceBasisForUnit(unitNorm),
      ...(canReadCosts && art.prixUnitaireDa != null ? { prix: art.prixUnitaireDa } : {}),
    });
  }

  const onglets: { id: Tab; label: string; icon: "book" | "trend" | "cake" | "box" }[] = [
    { id: "libre", label: "Mes recettes", icon: "book" },
    { id: "calculateur", label: "Taille du moule", icon: "trend" },
    { id: "fetes", label: "Fêtes & Ramadan", icon: "cake" },
    ...(stockLinkedNode ? [{ id: "stock" as Tab, label: "Fiches stock", icon: "box" as const }] : []),
  ];

  return (
    <div className="pg-stack">
      <div className="pg-recipe-top">
        <div className="pg-segment" role="tablist" aria-label="Outils de recettes">
          {onglets.map((o) => (
            <button key={o.id} type="button" role="tab" aria-selected={tab === o.id} onClick={() => setTab(o.id)}>
              <Icon name={o.icon} size={16} /> {o.label}
            </button>
          ))}
        </div>
        {tab === "libre" && canEdit && (
          <button type="button" className="pg-button" onClick={() => (editing ? setEditing(null) : nouvelleRecette())}>
            <Icon name={editing ? "close" : "plus"} size={17} /> {editing ? "Fermer" : "Nouvelle recette"}
          </button>
        )}
      </div>

      {feedback && (
        <p role="status" className="pg-notice" data-kind="success">
          {feedback}
        </p>
      )}

      {sessionMode === "supabase" && cloudTableAvailable && localOnlyRecipes.length > 0 && (
        <div className="pg-notice flex flex-wrap items-center justify-between gap-2" data-kind="warning">
          <span>
            <strong>{localOnlyRecipes.length} recette(s)</strong> enregistrée(s) sur cet appareil seulement.
          </span>
          <button type="button" disabled={syncPending} onClick={syncLocalToCloud} className="pg-button text-xs">
            {syncPending ? "Envoi…" : "Enregistrer en ligne"}
          </button>
        </div>
      )}

      {tab === "libre" && (
        <>
          {editing && activeSummary && (
            <section className="pg-card pg-card-pad pg-stack" aria-label="Fiche de la recette">
              <div className="pg-card-head">
                <div>
                  <span className="pg-kicker">{recipes.some((r) => r.id === editing.id) ? "Modifier" : "Nouvelle recette"}</span>
                  <h2>{editing.nom.trim() || "Ma recette"}</h2>
                </div>
              </div>

              {/* 1 — L'essentiel : un nom, combien de parts, à quel prix. */}
              <div className="pg-recipe-essentiel">
                <label className="pg-field pg-field-wide">
                  Nom de la recette
                  <input
                    className="pg-input"
                    placeholder="Ex : Mille-feuille, Baklawa, Tarte citron…"
                    value={editing.nom}
                    onChange={(e) => setEditing({ ...editing, nom: e.target.value })}
                  />
                </label>
                <label className="pg-field">
                  Combien de parts / pièces ?
                  <input
                    className="pg-input"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    step={1}
                    value={editing.portions}
                    onChange={(e) => setEditing({ ...editing, portions: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                {canReadCosts && (
                  <label className="pg-field">
                    Prix de vente (DA)
                    <input
                      className="pg-input"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step="any"
                      placeholder="0"
                      value={editing.prixVenteDa || ""}
                      onChange={(e) => setEditing({ ...editing, prixVenteDa: Number(e.target.value) || 0 })}
                    />
                  </label>
                )}
              </div>

              {/* 2 — Les ingrédients : une ligne = un nom, une quantité, un prix. */}
              <div className="pg-stack">
                <div className="pg-card-head" style={{ marginBottom: 0 }}>
                  <div>
                    <h3 className="pg-section-title">Ingrédients</h3>
                    <p>Un ingrédient par ligne. Le total se calcule tout seul.</p>
                    <p className="pg-hint">{recipes.length} recette{recipes.length > 1 ? "s" : ""} enregistrée{recipes.length > 1 ? "s" : ""}</p>
                  </div>
                  <button type="button" className="pg-button pg-button-secondary" onClick={addIngredientRow}>
                    <Icon name="plus" size={16} /> Ajouter un ingrédient
                  </button>
                </div>

                <div className="pg-stack">
                  {editing.ingredients.map((line, index) => (
                    <div key={line.id} className="pg-recipe-line">
                      <div className="pg-recipe-line-fields">
                        <label className="pg-field pg-recipe-line-name">
                          Ingrédient {index + 1}
                          <input
                            className="pg-input"
                            placeholder="Ex : Farine, Beurre, Amandes…"
                            value={line.nom}
                            onChange={(e) => updateLine(line.id, { nom: e.target.value })}
                          />
                        </label>
                        <label className="pg-field">
                          Quantité
                          <input
                            className="pg-input"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={line.qty}
                            onChange={(e) => updateLine(line.id, { qty: Number(e.target.value) || 0 })}
                          />
                        </label>
                        <label className="pg-field">
                          Unité
                          <select
                            className="pg-input"
                            value={line.unite}
                            onChange={(e) => updateLine(line.id, { unite: e.target.value as FreeUnit })}
                          >
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u === "pcs" ? "pièces" : u}
                              </option>
                            ))}
                          </select>
                        </label>
                        {canReadCosts && (
                          <label className="pg-field">
                            Prix au {line.basePrix === "total" ? "total" : line.basePrix === "par_L" ? "litre" : line.basePrix === "par_unite" ? "pièce" : "kilo"} (DA)
                            <input
                              className="pg-input"
                              type="number"
                              inputMode="decimal"
                              min={0}
                              step="any"
                              value={line.prix}
                              onChange={(e) => updateLine(line.id, { prix: Number(e.target.value) || 0 })}
                            />
                          </label>
                        )}
                        <div className="pg-recipe-line-end">
                          {canReadCosts && <span className="pg-badge">{money(lineCostDa(line))}</span>}
                          {editing.ingredients.length > 1 && (
                            <button
                              type="button"
                              className="pg-icon-button"
                              aria-label={`Retirer ${line.nom || `l’ingrédient ${index + 1}`}`}
                              onClick={() =>
                                setEditing({ ...editing, ingredients: editing.ingredients.filter((l) => l.id !== line.id) })
                              }
                            >
                              <Icon name="close" size={16} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 3 — Le résultat, en clair : coût, prix conseillé, marge. */}
              {canReadCosts && (
                <div className="pg-recipe-resume">
                  <div>
                    <span>Coût des ingrédients</span>
                    <b>{money(activeSummary.coutTotal)}</b>
                    <small>
                      soit {money(activeSummary.coutParPart)} / {unitsLabel(editing.unitePortion)}
                    </small>
                  </div>
                  <div>
                    <span>Prix conseillé</span>
                    <div className="pg-recipe-suggestions">
                      {activeSummary.conseils.map((c) => (
                        <button
                          key={c.coef}
                          type="button"
                          className="pg-filter"
                          aria-pressed={editing.prixVenteDa === c.prix}
                          onClick={() => setEditing({ ...editing, prixVenteDa: c.prix })}
                        >
                          {money(c.prix)}
                        </button>
                      ))}
                    </div>
                    <small>Touchez un prix pour le garder.</small>
                  </div>
                  <div>
                    <span>Ce que vous gagnez</span>
                    <b className={activeSummary.beneficeParPart >= 0 ? "pg-money-ok" : "pg-money-bad"}>
                      {activeSummary.prixVente > 0 ? money(activeSummary.beneficeParPart) : "—"}
                    </b>
                    <small>
                      {activeSummary.prixVente > 0
                        ? `par ${unitsLabel(editing.unitePortion)} · marge ${activeSummary.margePct ?? 0} %`
                        : "Entrez le prix de vente"}
                    </small>
                  </div>
                </div>
              )}

              {/* 4 — Le reste, replié : utile une fois par mois, pas tous les jours. */}
              <div className="pg-recipe-more">
                <button type="button" className="pg-text-link" aria-expanded={showExtra} onClick={() => setShowExtra(!showExtra)}>
                  <Icon name="settings" size={16} /> Plus d’options (photo, emballage, cuisson, notes)
                  <Icon name="down" size={15} />
                </button>
                {showExtra && (
                  <div className="pg-stack pg-recipe-more-body">
                    <div className="pg-recipe-photo-editor">
                      <div className="pg-recipe-photo-frame">
                        {photoDe(editing) ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={photoDe(editing) as string}
                            alt={`Photo de ${editing.nom.trim() || "la recette"}`}
                            width={520}
                            height={389}
                            decoding="async"
                          />
                        ) : (
                          <span className="pg-recipe-photo-empty"><Icon name="book" size={22} /> Aucune photo</span>
                        )}
                      </div>
                      <div className="pg-stack">
                        <strong className="text-sm">Photo de la recette</strong>
                        <p className="text-xs pg-muted">Facultatif : aide à retrouver la recette d’un coup d’œil.</p>
                        <label className="pg-button pg-button-secondary w-fit cursor-pointer">
                          <Icon name="plus" size={16} /> Choisir une photo
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            className="sr-only"
                            onChange={(e) => {
                              void onRecipePhotoFile(e.target.files?.[0]);
                              e.currentTarget.value = "";
                            }}
                          />
                        </label>
                        <div className="pg-photo-choices" role="group" aria-label="Photos proposées">
                          {RECIPE_PHOTOS.map((p) => (
                            <button
                              key={p.src}
                              type="button"
                              className="pg-photo-choice"
                              aria-pressed={editing.photo === p.src}
                              title={p.label}
                              aria-label={`Photo ${p.label}`}
                              onClick={() => chooseRecipePhoto(p.src)}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={p.src} alt="" width={120} height={90} loading="lazy" decoding="async" />
                            </button>
                          ))}
                        </div>
                        {editing.photo && (
                          <button type="button" className="pg-button pg-button-secondary w-fit" onClick={() => chooseRecipePhoto(null)}>
                            <Icon name="close" size={15} /> Retirer la photo
                          </button>
                        )}
                        {photoStatus && <p className="text-xs pg-muted" role="status">{photoStatus}</p>}
                      </div>
                    </div>

                    {canReadCosts && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <label className="pg-field">
                          Emballage / boîte (DA)
                          <input
                            className="pg-input"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={editing.emballageDa || ""}
                            placeholder="0"
                            onChange={(e) => setEditing({ ...editing, emballageDa: Number(e.target.value) || 0 })}
                          />
                        </label>
                        <label className="pg-field">
                          Gaz, four, main-d’œuvre (DA)
                          <input
                            className="pg-input"
                            type="number"
                            inputMode="decimal"
                            min={0}
                            step="any"
                            value={editing.cuissonMoDa || ""}
                            placeholder="0"
                            onChange={(e) => setEditing({ ...editing, cuissonMoDa: Number(e.target.value) || 0 })}
                          />
                        </label>
                      </div>
                    )}

                    <label className="pg-field">
                      Notes de préparation
                      <input
                        className="pg-input"
                        placeholder="Ex : four 175 °C pendant 35 min"
                        value={editing.notes}
                        onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                      />
                    </label>

                    {stockSuggestions.length > 0 && (
                      <div className="pg-stack">
                        <strong className="text-sm">Lier un ingrédient à votre stock (facultatif)</strong>
                        <p className="text-xs pg-muted">
                          Une fois lié, le prix d’achat et les quantités suivent votre stock automatiquement.
                        </p>
                        {editing.ingredients.map((line, index) => (
                          <label key={`lien-${line.id}`} className="pg-field">
                            {line.nom.trim() || `Ingrédient ${index + 1}`} — article du stock
                            <select
                              className="pg-input"
                              value={line.stockArticleId ?? ""}
                              onChange={(e) => linkIngredientToStock(line.id, e.target.value)}
                            >
                              <option value="">Pas lié (je saisis le prix à la main)</option>
                              {stockSuggestions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.nom} ({s.unite}{s.prixUnitaireDa != null ? ` · ${s.prixUnitaireDa} DA` : ""})
                                </option>
                              ))}
                            </select>
                          </label>
                        ))}
                      </div>
                    )}

                    <label className="pg-field">
                      On compte en… (parts, pièces, gâteaux)
                      <input
                        className="pg-input"
                        value={editing.unitePortion}
                        onChange={(e) => setEditing({ ...editing, unitePortion: e.target.value })}
                      />
                    </label>

                    {canReadCosts && (
                      <div className="grid gap-2 sm:grid-cols-3">
                        {(
                          [
                            { basis: "par_kg", label: "Le prix est au kilo (DA/kg)" },
                            { basis: "par_L", label: "Le prix est au litre (DA/L)" },
                            { basis: "par_unite", label: "Le prix est à la pièce (DA/pièce)" },
                          ] as { basis: FreePriceBasis; label: string }[]
                        ).map((o) => (
                          <button
                            key={o.basis}
                            type="button"
                            className="pg-button pg-button-secondary"
                            onClick={() =>
                              setEditing({
                                ...editing,
                                ingredients: editing.ingredients.map((l) => ({ ...l, basePrix: o.basis })),
                              })
                            }
                          >
                            {o.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pg-recipe-actions">
                <button type="button" className="pg-button" onClick={saveDraft} disabled={syncPending}>
                  <Icon name="check" size={17} /> {syncPending ? "Enregistrement…" : "Enregistrer la recette"}
                </button>
              </div>
            </section>
          )}

          {!loaded ? (
            <p className="pg-muted text-sm">Chargement de vos recettes…</p>
          ) : recipes.length === 0 ? (
            <div className="pg-card pg-card-pad pg-empty">
              <b>Aucune recette encore</b>
              <p>Touchez « Nouvelle recette », écrivez les ingrédients : vous verrez aussitôt le coût et le prix juste.</p>
            </div>
          ) : (
            <>
              {recipes.length > 4 && (
                <div className="pg-search">
                  <Icon name="search" size={17} />
                  <input
                    type="search"
                    className="pg-input"
                    aria-label="Chercher une recette"
                    placeholder="Chercher une recette…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
              )}
              {visibles.length === 0 ? (
                <div className="pg-card pg-card-pad pg-empty"><b>Aucune recette à ce nom</b><p>Essayez un autre mot.</p></div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-2">
                  {visibles.map((r) => {
                    const s = computeFreeRecipeSummary(r);
                    return (
                      <article key={r.id} className="pg-card pg-card-pad pg-stack pg-recipe-card">
                        {photoDe(r) && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="pg-recipe-photo"
                            src={photoDe(r) as string}
                            alt={`${r.nom} — photo`}
                            width={900}
                            height={672}
                            loading="lazy"
                            decoding="async"
                          />
                        )}
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <h3 className="text-lg font-extrabold">{r.nom}</h3>
                            <p className="text-xs pg-muted">
                              {r.portions} {unitsLabel(r.unitePortion)} · {r.ingredients.length} ingrédient{r.ingredients.length > 1 ? "s" : ""}
                            </p>
                          </div>
                          <div className="text-right">
                            {canReadCosts ? (
                              <span className="pg-badge" data-tone="success">
                                {money(s.coutParPart)} / {unitsLabel(r.unitePortion)}
                              </span>
                            ) : r.prixVenteDa > 0 ? (
                              <span className="pg-badge" data-tone="planned">
                                {r.statutPrix === "valide" ? "Prix validé" : "Prix proposé"} : {money(r.prixVenteDa)}
                              </span>
                            ) : null}
                          </div>
                        </div>

                        {canReadCosts && (
                          <div className="pg-recipe-figs">
                            <div>
                              <span>Coût</span>
                              <b>{money(s.coutTotal)}</b>
                            </div>
                            <div>
                              <span>Prix juste</span>
                              <b>{money(s.conseils[1].prix)}</b>
                            </div>
                            <div>
                              <span>Votre prix</span>
                              <b>{s.prixVente > 0 ? money(s.prixVente) : "—"}</b>
                            </div>
                          </div>
                        )}

                        <details className="pg-recipe-details">
                          <summary>
                            Voir les ingrédients
                            <Icon name="down" size={15} />
                          </summary>
                          <ul>
                            {r.ingredients.map((l) => (
                              <li key={l.id} className="flex justify-between gap-2 py-1.5">
                                <span>{l.nom} · <span className="pg-muted">{l.qty} {l.unite}</span></span>
                                {canReadCosts && <b>{money(lineCostDa(l))}</b>}
                              </li>
                            ))}
                            {canReadCosts && s.fraisFixes > 0 && (
                              <li className="flex justify-between gap-2 py-1.5 pg-muted">
                                <span>Emballage + cuisson</span>
                                <b>{money(s.fraisFixes)}</b>
                              </li>
                            )}
                          </ul>
                          {r.notes && <p className="text-xs pg-muted italic">{r.notes}</p>}
                        </details>

                        {canEdit && (
                          <div className="pg-recipe-card-actions">
                            <button type="button" className="pg-button pg-button-secondary" onClick={() => setEditing(structuredClone(r))}>
                              Modifier
                            </button>
                            <button type="button" className="pg-button pg-button-secondary" onClick={() => duplicateRecipe(r)}>
                              Copier
                            </button>
                            {userRole === "proprietaire" && (
                              <button
                                type="button"
                                className="pg-button pg-button-secondary text-red-700"
                                onClick={() => {
                                  if (window.confirm(`Supprimer « ${r.nom} » ?`)) removeRecipe(r.id);
                                }}
                              >
                                Supprimer
                              </button>
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === "calculateur" && (
        <PortionEstimator sessionMode={sessionMode} canReadCosts={canReadCosts} />
      )}

      {tab === "fetes" && <FetesPlanner />}

      {tab === "stock" && stockLinkedNode}
    </div>
  );
}
