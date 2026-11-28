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

type Tab = "libre" | "calculateur" | "fetes" | "stock";

const UNITS: FreeUnit[] = ["g", "kg", "ml", "cl", "L", "pcs"];
const BASIS_LABELS: Record<FreePriceBasis, string> = {
  total: "DA (pour cette qté)",
  par_kg: "DA / kg",
  par_L: "DA / L",
  par_unite: "DA / unité",
};
const money = (n: number) => `${new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 }).format(n)} DA`;

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

  /** Photo choisie dans la galerie livrée, ou retirée. */
  function chooseRecipePhoto(src: string | null) {
    if (!editing) return;
    setEditing({ ...editing, photo: src });
    setPhotoStatus(src ? "Photo sélectionnée — enregistrez la recette pour la conserver." : "Photo retirée.");
  }

  /**
   * Photo prise au téléphone ou choisie dans la pellicule : elle est réduite
   * et compressée ici (520 px, JPEG 0,72) avant de partir en base — jamais
   * l'original de plusieurs Mo.
   */
  async function onRecipePhotoFile(file: File | undefined) {
    if (!file || !editing) return;
    if (!file.type.startsWith("image/")) {
      setPhotoStatus("Choisissez un fichier image (JPEG, PNG, WebP).");
      return;
    }
    try {
      setPhotoStatus("Compression de la photo…");
      const compressed = await compressImageFileToDataUrl(file, 520, 0.72);
      setEditing({ ...editing, photo: compressed });
      setPhotoStatus(
        `Photo compressée (${Math.round(compressed.length / 1024)} Ko) — enregistrez la recette pour la conserver.`,
      );
    } catch {
      setPhotoStatus("Impossible de lire cette image.");
    }
  }

  function saveDraft() {
    if (!editing) return;
    const cleanName = editing.nom.trim();
    if (!cleanName) {
      setFeedback("Donnez un nom à la recette avant d’enregistrer.");
      return;
    }
    const cleanIngredients = editing.ingredients.filter((l) => l.nom.trim() !== "");
    if (cleanIngredients.length === 0) {
      setFeedback("Ajoutez au moins un ingrédient avec un nom.");
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
            ? `Recette « ${saved.nom} » enregistrée · Alerte envoyée au patron (prix très bas par rapport au coût !).`
            : `Recette « ${saved.nom} » enregistrée · Le patron a été notifié pour vérifier ce prix.`,
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
              ? `Recette « ${saved.nom} » synchronisée · Le patron a été averti du prix saisi ✓`
              : `Recette « ${saved.nom} » enregistrée et synchronisée dans le cloud ✓`
            : `Recette « ${saved.nom} » sauvée localement (${res.erreur ?? "synchro différée"}).`,
        );
      });
    } else {
      setFeedback(`Recette « ${saved.nom} » enregistrée.`);
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
        setFeedback(`${res.count} recette(s) synchronisée(s) vers le cloud ✓`);
      } else {
        setFeedback(res.erreur ?? "Synchronisation cloud indisponible.");
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
    setEditing(copy);
    setFeedback("");
  }

  function linkIngredientToStock(lineId: string, articleId: string) {
    if (!editing) return;
    if (!articleId) {
      setEditing({
        ...editing,
        ingredients: editing.ingredients.map((l) => (l.id === lineId ? { ...l, stockArticleId: null } : l)),
      });
      return;
    }
    const art = stockSuggestions.find((a) => a.id === articleId);
    if (!art) return;
    const unitNorm = (UNITS.includes(art.unite as FreeUnit) ? art.unite : "kg") as FreeUnit;
    const basis = defaultPriceBasisForUnit(unitNorm);
    setEditing({
      ...editing,
      ingredients: editing.ingredients.map((l) =>
        l.id === lineId
          ? {
              ...l,
              stockArticleId: art.id,
              nom: art.nom,
              unite: unitNorm,
              basePrix: basis,
              prix: canReadCosts && art.prixUnitaireDa != null ? art.prixUnitaireDa : l.prix,
            }
          : l,
      ),
    });
  }

  return (
    <div className="pg-stack">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="pg-segment" role="tablist" aria-label="Outils de recettes">
          <button type="button" role="tab" aria-selected={tab === "libre"} onClick={() => setTab("libre")}>
            <Icon name="book" size={16} /> Mes Recettes (saisie libre)
          </button>
          <button type="button" role="tab" aria-selected={tab === "calculateur"} onClick={() => setTab("calculateur")}>
            <Icon name="trend" size={16} /> Calculateur Moules &amp; Parts
          </button>
          <button type="button" role="tab" aria-selected={tab === "fetes"} onClick={() => setTab("fetes")}>
            <Icon name="cake" size={16} /> Fêtes &amp; Ramadan
          </button>
          {stockLinkedNode && (
            <button type="button" role="tab" aria-selected={tab === "stock"} onClick={() => setTab("stock")}>
              <Icon name="box" size={16} /> Fiches liées au stock
            </button>
          )}
        </div>
        {tab === "libre" && canEdit && !editing && (
          <button
            type="button"
            className="pg-button"
            onClick={() => {
              setEditing(makeEmptyRecipe());
              setFeedback("");
            }}
          >
            <Icon name="plus" size={17} /> Écrire une recette libre
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
            <strong>{localOnlyRecipes.length} recette(s) locale(s)</strong> trouvée(s) sur cet appareil.
          </span>
          <button type="button" disabled={syncPending} onClick={syncLocalToCloud} className="pg-button text-xs">
            {syncPending ? "Synchronisation…" : `Synchroniser mes ${localOnlyRecipes.length} recettes vers le cloud`}
          </button>
        </div>
      )}

      {tab === "libre" && (
        <>
          {editing && activeSummary && (
            <section className="pg-card pg-card-pad pg-stack">
              <div className="pg-card-head">
                <div>
                  <span className="pg-kicker">Cahier de recette libre</span>
                  <h2>{editing.nom.trim() || "Nouvelle recette"}</h2>
                  <p>Écrivez vos ingrédients et prix librement en DA — sans obligation de passer par le stock.</p>
                </div>
                <button type="button" className="pg-button pg-button-secondary" onClick={() => setEditing(null)}>
                  Annuler
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className="pg-field sm:col-span-2">
                  Nom de la recette
                  <input
                    className="pg-input"
                    placeholder="Ex : Mille-feuille, Baklawa, Tarte citron…"
                    value={editing.nom}
                    onChange={(e) => setEditing({ ...editing, nom: e.target.value })}
                  />
                </label>
                <label className="pg-field">
                  Nombre de parts / pièces
                  <input
                    className="pg-input"
                    type="number"
                    min={1}
                    step={1}
                    value={editing.portions}
                    onChange={(e) => setEditing({ ...editing, portions: Math.max(1, Number(e.target.value) || 1) })}
                  />
                </label>
                <label className="pg-field">
                  Unité (parts, pièces…)
                  <input
                    className="pg-input"
                    value={editing.unitePortion}
                    onChange={(e) => setEditing({ ...editing, unitePortion: e.target.value })}
                  />
                </label>
              </div>

              <div className="pg-recipe-photo-editor">
                <div className="pg-recipe-photo-frame">
                  {photoDe(editing) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoDe(editing) as string}
                      alt={`Aperçu de la photo pour ${editing.nom.trim() || "la recette"}`}
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
                  <p className="text-xs pg-muted">
                    Choisissez une photo de la galerie PâtisGest, ou ajoutez la vôtre : elle est
                    compressée sur cet appareil avant l’envoi (520 px, JPEG).
                  </p>
                  <label className="pg-button pg-button-secondary w-fit cursor-pointer">
                    <Icon name="plus" size={16} /> Ajouter une photo
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
                  <div className="pg-photo-choices" role="group" aria-label="Galerie de photos">
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
                    <button
                      type="button"
                      className="pg-button pg-button-secondary w-fit"
                      onClick={() => chooseRecipePhoto(null)}
                    >
                      <Icon name="close" size={15} /> Retirer la photo
                    </button>
                  )}
                  {photoStatus && <p className="text-xs pg-muted" role="status">{photoStatus}</p>}
                </div>
              </div>

              <div className="pg-stack">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong className="text-sm">Ingrédients (saisie libre)</strong>
                  <button
                    type="button"
                    className="pg-button pg-button-secondary"
                    onClick={() =>
                      setEditing({
                        ...editing,
                        ingredients: [
                          ...editing.ingredients,
                          {
                            id: crypto.randomUUID(),
                            nom: "",
                            qty: 100,
                            unite: "g",
                            prix: 0,
                            basePrix: "par_kg",
                            stockArticleId: null,
                          },
                        ],
                      })
                    }
                  >
                    <Icon name="plus" size={16} /> Ajouter un ingrédient
                  </button>
                </div>

                <div className="space-y-3">
                  {editing.ingredients.map((line, index) => {
                    const cost = lineCostDa(line);
                    return (
                      <div key={line.id} className="rounded-xl border p-3 space-y-2" style={{ background: "var(--pg-subtle)" }}>
                        <div className="grid gap-2 sm:grid-cols-[2fr_1fr_90px_1fr_1.4fr_auto] items-end">
                          <label className="pg-field">
                            Ingrédient {index + 1}
                            <input
                              className="pg-input"
                              placeholder="Ex : Farine, Beurre, Amandes…"
                              value={line.nom}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  ingredients: editing.ingredients.map((l) =>
                                    l.id === line.id ? { ...l, nom: e.target.value } : l,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="pg-field">
                            Quantité
                            <input
                              className="pg-input"
                              type="number"
                              min={0}
                              step="any"
                              value={line.qty}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  ingredients: editing.ingredients.map((l) =>
                                    l.id === line.id ? { ...l, qty: Number(e.target.value) || 0 } : l,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label className="pg-field">
                            Unité
                            <select
                              className="pg-input"
                              value={line.unite}
                              onChange={(e) =>
                                setEditing({
                                  ...editing,
                                  ingredients: editing.ingredients.map((l) =>
                                    l.id === line.id ? { ...l, unite: e.target.value as FreeUnit } : l,
                                  ),
                                })
                              }
                            >
                              {UNITS.map((u) => (
                                <option key={u} value={u}>
                                  {u}
                                </option>
                              ))}
                            </select>
                          </label>
                          {canReadCosts && (
                            <>
                              <label className="pg-field">
                                Prix (DA)
                                <input
                                  className="pg-input"
                                  type="number"
                                  min={0}
                                  step="any"
                                  value={line.prix}
                                  onChange={(e) =>
                                    setEditing({
                                      ...editing,
                                      ingredients: editing.ingredients.map((l) =>
                                        l.id === line.id ? { ...l, prix: Number(e.target.value) || 0 } : l,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label className="pg-field">
                                Base du prix
                                <select
                                  className="pg-input"
                                  value={line.basePrix}
                                  onChange={(e) =>
                                    setEditing({
                                      ...editing,
                                      ingredients: editing.ingredients.map((l) =>
                                        l.id === line.id ? { ...l, basePrix: e.target.value as FreePriceBasis } : l,
                                      ),
                                    })
                                  }
                                >
                                  {(Object.keys(BASIS_LABELS) as FreePriceBasis[]).map((k) => (
                                    <option key={k} value={k}>
                                      {BASIS_LABELS[k]}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            </>
                          )}
                          <div className="flex items-center gap-2">
                            {canReadCosts && (
                              <span className="pg-badge" title="Coût de cette ligne">
                                {money(cost)}
                              </span>
                            )}
                            {editing.ingredients.length > 1 && (
                              <button
                                type="button"
                                className="pg-icon-button"
                                aria-label="Supprimer cet ingrédient"
                                onClick={() =>
                                  setEditing({
                                    ...editing,
                                    ingredients: editing.ingredients.filter((l) => l.id !== line.id),
                                  })
                                }
                              >
                                <Icon name="close" size={16} />
                              </button>
                            )}
                          </div>
                        </div>

                        {stockSuggestions.length > 0 && (
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="pg-muted">Optionnel :</span>
                            <select
                              aria-label={`Lier l'ingrédient ${index + 1} au stock`}
                              className="rounded-lg border px-2 py-1 text-xs"
                              value={line.stockArticleId ?? ""}
                              onChange={(e) => linkIngredientToStock(line.id, e.target.value)}
                            >
                              <option value="">Saisie libre (non liée au stock)</option>
                              {stockSuggestions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  Lier au stock : {s.nom} ({s.unite}
                                  {s.prixUnitaireDa != null ? ` · ${s.prixUnitaireDa} DA` : ""})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                {canReadCosts && (
                  <>
                    <label className="pg-field">
                      Boîte / Emballage (DA, optionnel)
                      <input
                        className="pg-input"
                        type="number"
                        min={0}
                        step="any"
                        value={editing.emballageDa}
                        onChange={(e) => setEditing({ ...editing, emballageDa: Number(e.target.value) || 0 })}
                      />
                    </label>
                    <label className="pg-field">
                      Cuisson / Gaz / Main-d’œuvre (DA, optionnel)
                      <input
                        className="pg-input"
                        type="number"
                        min={0}
                        step="any"
                        value={editing.cuissonMoDa}
                        onChange={(e) => setEditing({ ...editing, cuissonMoDa: Number(e.target.value) || 0 })}
                      />
                    </label>
                  </>
                )}
                <label className="pg-field">
                  {userRole !== "proprietaire"
                    ? `Prix de vente suggéré pour validation patron (DA / ${editing.unitePortion})`
                    : `Votre prix de vente (DA / ${editing.unitePortion})`}
                  <input
                    className="pg-input"
                    type="number"
                    min={0}
                    step="any"
                    value={editing.prixVenteDa}
                    onChange={(e) => setEditing({ ...editing, prixVenteDa: Number(e.target.value) || 0 })}
                  />
                </label>
              </div>

              <label className="pg-field">
                Notes de préparation (température four, astuce…)
                <input
                  className="pg-input"
                  placeholder="Ex : Cuire 35 min à 175°C"
                  value={editing.notes}
                  onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
                />
              </label>

              {canReadCosts && (
                <div className="grid gap-3 sm:grid-cols-4 rounded-xl border p-4" style={{ background: "var(--pg-tint)" }}>
                  <div>
                    <span className="text-xs font-bold uppercase pg-muted">Coût total recette</span>
                    <div className="text-xl font-extrabold">{money(activeSummary.coutTotal)}</div>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase pg-muted">Coût par {editing.unitePortion}</span>
                    <div className="text-xl font-extrabold">{money(activeSummary.coutParPart)}</div>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase pg-muted">Prix conseillé</span>
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {activeSummary.conseils.map((c) => (
                        <button
                          key={c.coef}
                          type="button"
                          className="pg-filter"
                          onClick={() => setEditing({ ...editing, prixVenteDa: c.prix })}
                        >
                          ×{c.coef} = <b>{money(c.prix)}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-xs font-bold uppercase pg-muted">Votre marge / part</span>
                    <div
                      className={`text-xl font-extrabold ${
                        activeSummary.beneficeParPart >= 0 ? "text-emerald-700" : "text-red-700"
                      }`}
                    >
                      {activeSummary.prixVente > 0
                        ? `${money(activeSummary.beneficeParPart)} (${activeSummary.margePct ?? 0} %)`
                        : "Saisir un prix"}
                    </div>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button type="button" className="pg-button" onClick={saveDraft}>
                  <Icon name="check" size={17} /> Enregistrer la recette
                </button>
              </div>
            </section>
          )}

          {!loaded ? (
            <p className="pg-muted text-sm">Chargement du cahier de recettes…</p>
          ) : recipes.length === 0 ? (
            <div className="pg-card pg-card-pad pg-empty">
              <b>Aucune recette pour l’instant</b>
              <p>Cliquez sur « Écrire une recette libre » pour noter vos ingrédients et connaître votre vrai coût en DA.</p>
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {recipes.map((r) => {
                const s = computeFreeRecipeSummary(r);
                return (
                  <article key={r.id} className="pg-card pg-card-pad pg-stack">
                    {photoDe(r) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        className="pg-recipe-photo"
                        src={photoDe(r) as string}
                        alt={`${r.nom} — photo de la recette`}
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
                          Rendement : <b>{r.portions} {r.unitePortion}</b> · {r.ingredients.length} ingrédients
                        </p>
                      </div>
                      <div className="text-right">
                        {canReadCosts ? (
                          <span className="pg-badge" data-tone="success">
                            Coût : {money(s.coutParPart)} / {r.unitePortion}
                          </span>
                        ) : r.prixVenteDa > 0 ? (
                          <span className="pg-badge" data-tone="planned">
                            {r.statutPrix === "valide"
                              ? `Prix validé : ${money(r.prixVenteDa)}`
                              : `Suggéré (patron) : ${money(r.prixVenteDa)}`}
                          </span>
                        ) : (
                          <span className="pg-badge">Grammage atelier</span>
                        )}
                      </div>
                    </div>

                    <ul className="divide-y text-sm">
                      {r.ingredients.map((l) => (
                        <li key={l.id} className="flex justify-between py-1.5 gap-2">
                          <span>
                            {l.nom} · <span className="pg-muted">{l.qty} {l.unite}</span>
                            {l.stockArticleId && <span className="ml-1.5 pg-badge">Stock</span>}
                          </span>
                          {canReadCosts && <b>{money(lineCostDa(l))}</b>}
                        </li>
                      ))}
                      {canReadCosts && s.fraisFixes > 0 && (
                        <li className="flex justify-between py-1.5 pg-muted">
                          <span>Emballage + cuisson / MO</span>
                          <b>{money(s.fraisFixes)}</b>
                        </li>
                      )}
                    </ul>

                    {canReadCosts && (
                      <div className="grid grid-cols-3 gap-2 rounded-xl border p-3 text-xs" style={{ background: "var(--pg-subtle)" }}>
                        <div>
                          <span className="pg-muted block">Coût total</span>
                          <b className="text-sm">{money(s.coutTotal)}</b>
                        </div>
                        <div>
                          <span className="pg-muted block">Prix conseillé (×2,5)</span>
                          <b className="text-sm">{money(s.conseils[1].prix)}</b>
                        </div>
                        <div>
                          <span className="pg-muted block">Marge actuelle</span>
                          <b className={`text-sm ${s.beneficeParPart >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                            {s.prixVente > 0 ? `${money(s.beneficeParPart)} (${s.margePct ?? 0}%)` : "—"}
                          </b>
                        </div>
                      </div>
                    )}

                    {r.notes && <p className="text-xs pg-muted italic">{r.notes}</p>}

                    {canEdit && (
                      <div className="flex flex-wrap gap-2">
                        <button type="button" className="pg-button pg-button-secondary" onClick={() => setEditing(structuredClone(r))}>
                          Modifier
                        </button>
                        <button type="button" className="pg-button pg-button-secondary" onClick={() => duplicateRecipe(r)}>
                          Dupliquer
                        </button>
                        {userRole === "proprietaire" && (
                          <button
                            type="button"
                            className="pg-button pg-button-secondary text-red-700"
                            onClick={() => {
                              if (window.confirm(`Supprimer la recette « ${r.nom} » ?`)) removeRecipe(r.id);
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

      {tab === "calculateur" && (
        <PortionEstimator sessionMode={sessionMode} canReadCosts={canReadCosts} />
      )}

      {tab === "fetes" && <FetesPlanner />}

      {tab === "stock" && stockLinkedNode}
    </div>
  );
}
