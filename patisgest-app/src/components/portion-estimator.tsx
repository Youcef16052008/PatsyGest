"use client";

import Link from "next/link";
import { useMemo, useState, useSyncExternalStore } from "react";
import {
  buildEstimatorDraft,
  clearEstimatorDraft,
  computeEstimationDa,
  ESTIMATOR_PRESETS,
  loadEstimatorDraft,
  moldVolumeCm3,
  mouleVersParts,
  partsVersMoule,
  PORTION_PROFILES,
  saveEstimatorDraft,
  type EstimatorDraft,
  type EstimatorIngredient,
  type EstimatorPreset,
  type MoldShape,
  type MoldSpec,
  type PortionSizeKey,
} from "@/lib/portion-estimator";
import { dateLisible, dinars, quantite } from "@/lib/workspace-data";
import { HEURES_PAYEES_PAR_JOUR_DEFAUT, SALAIRE_JOURNALIER_MAX, tauxHoraireDepuisJournee } from "@/lib/main-oeuvre";

type Props = {
  /** Rôle courant si l'utilisateur a déjà une session ouverte (null sans compte). */
  sessionMode?: "supabase" | "demo" | null;
  canReadCosts?: boolean;
};

type CalcDirection = "moule-vers-parts" | "parts-vers-moule";

function initFromPreset(preset: EstimatorPreset) {
  return {
    presetId: preset.id,
    modeleNom: preset.titre,
    forme: preset.mouleBase.forme as MoldShape,
    diametreCm: preset.mouleBase.forme === "rond" ? preset.mouleBase.diametreCm : 26,
    coteCm: preset.mouleBase.forme === "carre" ? preset.mouleBase.coteCm : 24,
    longueurCm: preset.mouleBase.forme === "rectangle" ? preset.mouleBase.longueurCm : 34,
    largeurCm: preset.mouleBase.forme === "rectangle" ? preset.mouleBase.largeurCm : 24,
    hauteurCm: preset.mouleBase.forme === "unites" ? 4.5 : preset.mouleBase.hauteurCm,
    nbUnites: preset.mouleBase.forme === "unites" ? preset.mouleBase.nbUnites : preset.partsBase,
    partsSouhaitees: preset.partsBase,
    pertePct: preset.pertePct,
    moMin: preset.moMinBase,
    tauxHoraire: preset.tauxHoraire,
    chargesPct: preset.chargesPct,
    emballageFixe: preset.emballageFixe,
    energie: preset.energie,
    fraisGeneraux: preset.fraisGeneraux,
    coefficientCible: preset.coefficientCible,
    lignes: preset.lignes.map((l) => ({ ...l })),
    baseVolume: preset.mouleBase.forme === "unites" ? null : moldVolumeCm3(preset.mouleBase),
    partsBase: preset.partsBase,
  };
}

export default function PortionEstimator({ sessionMode = null, canReadCosts = false }: Props) {
  const initial = useMemo(() => initFromPreset(ESTIMATOR_PRESETS[0]), []);
  const [presetId, setPresetId] = useState<EstimatorPreset["id"]>(initial.presetId);
  const [direction, setDirection] = useState<CalcDirection>("moule-vers-parts");
  const [portionKey, setPortionKey] = useState<PortionSizeKey>("moyenne");
  const [customVol, setCustomVol] = useState<number>(150);

  const [forme, setForme] = useState<MoldShape>(initial.forme);
  const [diametreCm, setDiametreCm] = useState<number>(initial.diametreCm);
  const [coteCm, setCoteCm] = useState<number>(initial.coteCm);
  const [longueurCm, setLongueurCm] = useState<number>(initial.longueurCm);
  const [largeurCm, setLargeurCm] = useState<number>(initial.largeurCm);
  const [hauteurCm, setHauteurCm] = useState<number>(initial.hauteurCm);
  const [nbUnites, setNbUnites] = useState<number>(initial.nbUnites);
  const [partsSouhaitees, setPartsSouhaitees] = useState<number>(initial.partsSouhaitees);

  const [modeleNom, setModeleNom] = useState<string>(initial.modeleNom);
  const [partsBase, setPartsBase] = useState<number>(initial.partsBase);
  const [baseVolume, setBaseVolume] = useState<number | null>(initial.baseVolume);
  const [pertePct, setPertePct] = useState<number>(initial.pertePct);
  const [moMin, setMoMin] = useState<number>(initial.moMin);
  const [tauxHoraire, setTauxHoraire] = useState<number>(initial.tauxHoraire);
  const [chargesPct, setChargesPct] = useState<number>(initial.chargesPct);
  const [emballageFixe, setEmballageFixe] = useState<number>(initial.emballageFixe);
  const [energie, setEnergie] = useState<number>(initial.energie);
  const [fraisGeneraux, setFraisGeneraux] = useState<number>(initial.fraisGeneraux);
  const [coefficientCible, setCoefficientCible] = useState<number>(initial.coefficientCible);
  const [prixHtSaisi, setPrixHtSaisi] = useState<string>("");
  const [tvaIndicative, setTvaIndicative] = useState<number>(19);
  const [lignes, setLignes] = useState<EstimatorIngredient[]>(initial.lignes);

  const [savedDraftOverride, setSavedDraft] = useState<EstimatorDraft | null | undefined>(undefined);
  const [draftFeedback, setDraftFeedback] = useState<string>("");
  const storedRaw = useSyncExternalStore(
    (cb) => { window.addEventListener("storage", cb); return () => window.removeEventListener("storage", cb); },
    () => { try { return window.localStorage.getItem("patisgest.estimationDraft.v1"); } catch { return null; } },
    () => null,
  );
  const savedDraft = savedDraftOverride !== undefined ? savedDraftOverride : storedRaw ? loadEstimatorDraft() : null;

  const volumePartCm3 =
    portionKey === "personnalisee" ? customVol : PORTION_PROFILES[portionKey].volumeCm3;

  function applyPreset(preset: EstimatorPreset) {
    const next = initFromPreset(preset);
    setPresetId(next.presetId);
    setModeleNom(next.modeleNom);
    setForme(next.forme);
    setDiametreCm(next.diametreCm);
    setCoteCm(next.coteCm);
    setLongueurCm(next.longueurCm);
    setLargeurCm(next.largeurCm);
    setHauteurCm(next.hauteurCm);
    setNbUnites(next.nbUnites);
    setPartsSouhaitees(next.partsSouhaitees);
    setPartsBase(next.partsBase);
    setBaseVolume(next.baseVolume);
    setPertePct(next.pertePct);
    setMoMin(next.moMin);
    setTauxHoraire(next.tauxHoraire);
    setChargesPct(next.chargesPct);
    setEmballageFixe(next.emballageFixe);
    setEnergie(next.energie);
    setFraisGeneraux(next.fraisGeneraux);
    setCoefficientCible(next.coefficientCible);
    setPrixHtSaisi("");
    setLignes(next.lignes);
    if (next.forme === "unites") setDirection("moule-vers-parts");
    setDraftFeedback("");
  }

  function resetBlank() {
    setModeleNom("Ma création à chiffrer");
    setPartsBase(16);
    setBaseVolume(null);
    setPertePct(5);
    setMoMin(60);
    setTauxHoraire(500);
    setChargesPct(25);
    setEmballageFixe(250);
    setEnergie(120);
    setFraisGeneraux(150);
    setCoefficientCible(2.5);
    setPrixHtSaisi("");
    setLignes([
      { id: crypto.randomUUID(), nom: "Ingrédient principal", qteBase: 1, unite: "kg", puHt: null, paragePct: 0, redimensionnable: true },
    ]);
    setDraftFeedback("");
  }

  // Calcul géométrique (parts ↔ moule).
  const moldCalc = useMemo(() => {
    try {
      if (direction === "parts-vers-moule" && forme !== "unites") {
        const rec = partsVersMoule(partsSouhaitees, forme, hauteurCm, volumePartCm3);
        return {
          erreur: null as string | null,
          parts: rec.partsObtenues,
          volumeCm3: rec.volumeMouleCm3,
          formatLabel: rec.formatLabel,
          conseilDecoupe: rec.conseilDecoupe,
          recommendation: rec,
        };
      }
      const spec: MoldSpec =
        forme === "rond"
          ? { forme: "rond", diametreCm, hauteurCm }
          : forme === "carre"
            ? { forme: "carre", coteCm, hauteurCm }
            : forme === "rectangle"
              ? { forme: "rectangle", longueurCm, largeurCm, hauteurCm }
              : { forme: "unites", nbUnites };
      const res = mouleVersParts(spec, volumePartCm3);
      return {
        erreur: null as string | null,
        parts: res.parts,
        volumeCm3: res.volumeCm3,
        formatLabel: res.formatLabel,
        conseilDecoupe: res.conseilDecoupe,
        recommendation: null,
      };
    } catch (e) {
      return {
        erreur: e instanceof Error ? e.message : "Dimensions invalides.",
        parts: Math.max(1, Math.round(partsSouhaitees) || 1),
        volumeCm3: null,
        formatLabel: "",
        conseilDecoupe: "",
        recommendation: null,
      };
    }
  }, [direction, forme, diametreCm, coteCm, longueurCm, largeurCm, hauteurCm, nbUnites, partsSouhaitees, volumePartCm3]);

  // Chiffrage complet en DA (RC-01..RC-10).
  const costCalc = useMemo(() => {
    try {
      const testPv = prixHtSaisi.trim() === "" ? null : Number(prixHtSaisi);
      const useVol = baseVolume != null && moldCalc.volumeCm3 != null && forme !== "unites";
      const result = computeEstimationDa({
        modeleNom,
        partsBase,
        partsCibles: moldCalc.parts,
        volumeBaseCm3: useVol ? baseVolume : null,
        volumeCibleCm3: useVol ? moldCalc.volumeCm3 : null,
        pertePct,
        moMin,
        tauxHoraire,
        chargesPct,
        emballageFixe,
        energie,
        fraisGeneraux,
        coefficientCible,
        prixHtSaisi: testPv != null && Number.isFinite(testPv) && testPv > 0 ? testPv : null,
        lignes,
      });
      return { erreur: null as string | null, result };
    } catch (e) {
      return { erreur: e instanceof Error ? e.message : "Vérifiez les valeurs saisies.", result: null };
    }
  }, [
    modeleNom,
    partsBase,
    baseVolume,
    moldCalc.parts,
    moldCalc.volumeCm3,
    forme,
    pertePct,
    moMin,
    tauxHoraire,
    chargesPct,
    emballageFixe,
    energie,
    fraisGeneraux,
    coefficientCible,
    prixHtSaisi,
    lignes,
  ]);

  function updateLine(id: string, patch: Partial<EstimatorIngredient>) {
    setLignes((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }

  function addLine(redimensionnable: boolean) {
    if (lignes.length >= 60) return;
    setLignes((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        nom: redimensionnable ? "Nouvel ingrédient" : "Élément fixe (décor / support)",
        qteBase: 1,
        unite: redimensionnable ? "kg" : "pcs",
        puHt: null,
        paragePct: 0,
        redimensionnable,
      },
    ]);
  }

  function removeLine(id: string) {
    if (lignes.length <= 1) return;
    setLignes((prev) => prev.filter((l) => l.id !== id));
  }

  function handleSaveDraft() {
    if (!costCalc.result || moldCalc.erreur) return;
    const draft = buildEstimatorDraft({
      presetId,
      modeleNom,
      formatLabel: moldCalc.formatLabel,
      conseilDecoupe: moldCalc.conseilDecoupe,
      parts: moldCalc.parts,
      pertePct,
      moMin,
      result: costCalc.result,
    });
    const ok = saveEstimatorDraft(draft);
    if (ok) {
      setSavedDraft(draft);
      setDraftFeedback(
        "Brouillon enregistré sur cet appareil uniquement. Vous pouvez le reprendre dans un nouveau devis Cake Design sans rien ressaisir.",
      );
    } else {
      setDraftFeedback("Stockage local indisponible dans ce navigateur.");
    }
  }

  function handleClearDraft() {
    clearEstimatorDraft();
    setSavedDraft(null);
    setDraftFeedback("Brouillon local effacé.");
  }

  const res = costCalc.result;
  const prixRetenuHt =
    prixHtSaisi.trim() !== "" && Number(prixHtSaisi) > 0
      ? Number(prixHtSaisi)
      : res?.prixHtPropose ?? null;
  const prixRetenuTtc =
    prixRetenuHt != null && !res?.coutIncomplet
      ? Math.round(prixRetenuHt * (1 + Math.max(0, Math.min(100, tvaIndicative)) / 100) * 100) / 100
      : null;

  return (
    <div className="pg-estimator">
      {/* Barre d'exemples rapides */}
      <section className="pg-card pg-card-pad" aria-labelledby="est-presets-title">
        <div className="pg-card-head">
          <div>
            <h2 id="est-presets-title">Modèles de départ en dinars (DA)</h2>
            <p className="pg-help">
              Tarifs purement indicatifs et librement modifiables — aucune donnée n’est envoyée sans action de votre part.
            </p>
          </div>
          <button type="button" className="pg-btn pg-btn-sec" onClick={resetBlank}>
            Partir de zéro
          </button>
        </div>
        <div className="pg-est-presets">
          {ESTIMATOR_PRESETS.map((p) => {
            const active = p.id === presetId && modeleNom === p.titre;
            return (
              <button
                key={p.id}
                type="button"
                className="pg-est-preset"
                data-active={active || undefined}
                onClick={() => applyPreset(p)}
              >
                <strong>{p.titre}</strong>
                <span>{p.sousTitre}</span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="pg-est-grid">
        <div className="pg-stack">
          {/* Étape 1 : Parts <-> moule */}
          <section className="pg-card pg-card-pad" aria-labelledby="est-mold-title">
            <div className="pg-card-head">
              <div>
                <h2 id="est-mold-title">1. Format, moule &amp; nombre de parts</h2>
                <p className="pg-help">
                  L’hypothèse de portion reste toujours visible : changez-la selon le service (boutique, buffet ou événement).
                </p>
              </div>
              <div className="pg-tabs" role="tablist" aria-label="Sens du calcul">
                <button
                  type="button"
                  role="tab"
                  aria-selected={direction === "moule-vers-parts"}
                  className="pg-tab"
                  data-active={direction === "moule-vers-parts" || undefined}
                  onClick={() => setDirection("moule-vers-parts")}
                >
                  Moule → parts
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={direction === "parts-vers-moule"}
                  className="pg-tab"
                  data-active={direction === "parts-vers-moule" || undefined}
                  onClick={() => {
                    if (forme === "unites") setForme("rond");
                    setDirection("parts-vers-moule");
                  }}
                >
                  Parts → moule
                </button>
              </div>
            </div>

            <div className="pg-form-grid">
              <label className="pg-field">
                <span className="pg-label">Forme / conditionnement</span>
                <select
                  className="pg-input"
                  value={forme}
                  onChange={(e) => {
                    const next = e.target.value as MoldShape;
                    setForme(next);
                    if (next === "unites") setDirection("moule-vers-parts");
                  }}
                >
                  <option value="rond">Cercle rond (Ø cm)</option>
                  <option value="carre">Cadre carré (côté cm)</option>
                  <option value="rectangle">Cadre rectangle (L × l cm)</option>
                  {direction === "moule-vers-parts" && (
                    <option value="unites">Coffret / pièces à l’unité</option>
                  )}
                </select>
              </label>

              {direction === "parts-vers-moule" && forme !== "unites" ? (
                <label className="pg-field">
                  <span className="pg-label">Parts souhaitées</span>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    className="pg-input"
                    value={partsSouhaitees}
                    onChange={(e) => setPartsSouhaitees(Number(e.target.value))}
                  />
                </label>
              ) : forme === "rond" ? (
                <label className="pg-field">
                  <span className="pg-label">Diamètre du moule (cm)</span>
                  <input
                    type="number"
                    min={6}
                    max={100}
                    step={1}
                    className="pg-input"
                    value={diametreCm}
                    onChange={(e) => setDiametreCm(Number(e.target.value))}
                  />
                </label>
              ) : forme === "carre" ? (
                <label className="pg-field">
                  <span className="pg-label">Côté du cadre (cm)</span>
                  <input
                    type="number"
                    min={6}
                    max={100}
                    step={1}
                    className="pg-input"
                    value={coteCm}
                    onChange={(e) => setCoteCm(Number(e.target.value))}
                  />
                </label>
              ) : forme === "rectangle" ? (
                <>
                  <label className="pg-field">
                    <span className="pg-label">Longueur (cm)</span>
                    <input
                      type="number"
                      min={6}
                      max={150}
                      step={1}
                      className="pg-input"
                      value={longueurCm}
                      onChange={(e) => setLongueurCm(Number(e.target.value))}
                    />
                  </label>
                  <label className="pg-field">
                    <span className="pg-label">Largeur (cm)</span>
                    <input
                      type="number"
                      min={6}
                      max={150}
                      step={1}
                      className="pg-input"
                      value={largeurCm}
                      onChange={(e) => setLargeurCm(Number(e.target.value))}
                    />
                  </label>
                </>
              ) : (
                <label className="pg-field">
                  <span className="pg-label">Nombre de pièces</span>
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    step={1}
                    className="pg-input"
                    value={nbUnites}
                    onChange={(e) => setNbUnites(Number(e.target.value))}
                  />
                </label>
              )}

              {forme !== "unites" && (
                <>
                  <label className="pg-field">
                    <span className="pg-label">Hauteur finie (cm)</span>
                    <input
                      type="number"
                      min={1}
                      max={40}
                      step={0.5}
                      className="pg-input"
                      value={hauteurCm}
                      onChange={(e) => setHauteurCm(Number(e.target.value))}
                    />
                  </label>
                  <label className="pg-field">
                    <span className="pg-label">Taille de part (hypothèse)</span>
                    <select
                      className="pg-input"
                      value={portionKey}
                      onChange={(e) => setPortionKey(e.target.value as PortionSizeKey)}
                    >
                      {Object.entries(PORTION_PROFILES).map(([k, p]) => (
                        <option key={k} value={k}>
                          {p.label} — {p.volumeCm3} cm³
                        </option>
                      ))}
                      <option value="personnalisee">Volume personnalisé (cm³)</option>
                    </select>
                  </label>
                  {portionKey === "personnalisee" && (
                    <label className="pg-field">
                      <span className="pg-label">Volume par part (cm³)</span>
                      <input
                        type="number"
                        min={40}
                        max={1000}
                        step={5}
                        className="pg-input"
                        value={customVol}
                        onChange={(e) => setCustomVol(Number(e.target.value))}
                      />
                    </label>
                  )}
                </>
              )}
            </div>

            {moldCalc.erreur ? (
              <p role="alert" className="pg-alert pg-alert-danger">
                {moldCalc.erreur}
              </p>
            ) : (
              <div className="pg-est-mold-result" aria-live="polite">
                <div>
                  <span className="pg-kpi-label">
                    {direction === "parts-vers-moule" ? "Moule standard recommandé" : "Nombre de parts estimé"}
                  </span>
                  <p className="pg-est-mold-headline">
                    {direction === "parts-vers-moule" && moldCalc.recommendation
                      ? `${moldCalc.formatLabel} → ${moldCalc.parts} parts`
                      : `${moldCalc.parts} ${forme === "unites" ? "pièces" : "parts"} · ${moldCalc.formatLabel}`}
                  </p>
                  <p className="pg-help">
                    {moldCalc.conseilDecoupe}
                    {moldCalc.volumeCm3 != null &&
                      ` · Volume utile ${quantite(Math.round(moldCalc.volumeCm3), "cm³")} (hypothèse : ${volumePartCm3} cm³/part${
                        moldCalc.recommendation ? ` · ${moldCalc.recommendation.dimensionIdealeCm}` : ""
                      }).`}
                  </p>
                </div>
                {res && Math.abs(res.facteurEchelle - 1) > 0.01 && (
                  <span className="pg-badge" data-tone="planned">
                    Échelle recette ×{quantite(res.facteurEchelle)}
                  </span>
                )}
              </div>
            )}
          </section>

          {/* Étape 2 : Ingrédients proportionnels vs composants fixes */}
          <section className="pg-card pg-card-pad" aria-labelledby="est-ing-title">
            <div className="pg-card-head">
              <div>
                <h2 id="est-ing-title">2. Ingrédients &amp; éléments de décor (DA)</h2>
                <p className="pg-help">
                  Les lignes « Proportionnel » suivent automatiquement la taille du moule ; les lignes « Fixe » (cake drum, topper, ruban) restent comptées une seule fois par commande.
                </p>
              </div>
              <label className="pg-field" style={{ minWidth: "min(100%, 220px)" }}>
                <span className="pg-label">Intitulé de la création</span>
                <input
                  className="pg-input"
                  maxLength={100}
                  value={modeleNom}
                  onChange={(e) => setModeleNom(e.target.value)}
                />
              </label>
            </div>

            <div className="pg-table-wrap">
              <table className="pg-table pg-est-table">
                <thead>
                  <tr>
                    <th scope="col">Ingrédient / élément</th>
                    <th scope="col">Type</th>
                    <th scope="col" className="pg-num">Qté base</th>
                    <th scope="col">Unité</th>
                    <th scope="col" className="pg-num">Parage %</th>
                    <th scope="col" className="pg-num">Prix unit. (DA)</th>
                    <th scope="col" className="pg-num">Coût ajusté</th>
                    <th scope="col"><span className="sr-only">Retirer</span></th>
                  </tr>
                </thead>
                <tbody>
                  {lignes.map((l, idx) => {
                    const computed = res?.lignes[idx];
                    return (
                      <tr key={l.id}>
                        <td>
                          <input
                            aria-label={`Nom ligne ${idx + 1}`}
                            className="pg-input pg-input-sm"
                            value={l.nom}
                            onChange={(e) => updateLine(l.id, { nom: e.target.value })}
                          />
                        </td>
                        <td>
                          <select
                            aria-label={`Type ligne ${idx + 1}`}
                            className="pg-input pg-input-sm"
                            value={l.redimensionnable ? "var" : "fixe"}
                            onChange={(e) => updateLine(l.id, { redimensionnable: e.target.value === "var" })}
                          >
                            <option value="var">Proportionnel</option>
                            <option value="fixe">Fixe / commande</option>
                          </select>
                        </td>
                        <td className="pg-num" data-label="Qté base">
                          <input
                            aria-label={`Quantité base ${l.nom}`}
                            type="number"
                            min={0.001}
                            step="any"
                            className="pg-input pg-input-sm pg-num"
                            style={{ width: 78 }}
                            value={l.qteBase}
                            onChange={(e) => updateLine(l.id, { qteBase: Number(e.target.value) })}
                          />
                        </td>
                        <td data-label="Unité">
                          <input
                            aria-label={`Unité ${l.nom}`}
                            className="pg-input pg-input-sm"
                            style={{ width: 62 }}
                            maxLength={10}
                            value={l.unite}
                            onChange={(e) => updateLine(l.id, { unite: e.target.value })}
                          />
                        </td>
                        <td className="pg-num" data-label="Parage %">
                          <input
                            aria-label={`Parage ${l.nom}`}
                            type="number"
                            min={0}
                            max={95}
                            step={1}
                            className="pg-input pg-input-sm pg-num"
                            style={{ width: 66 }}
                            value={l.paragePct}
                            onChange={(e) => updateLine(l.id, { paragePct: Number(e.target.value) })}
                          />
                        </td>
                        <td className="pg-num" data-label="Prix unit. (DA)">
                          <input
                            aria-label={`Prix unitaire ${l.nom}`}
                            type="number"
                            min={0}
                            step="any"
                            placeholder="À renseigner"
                            className="pg-input pg-input-sm pg-num"
                            style={{ width: 108 }}
                            value={l.puHt ?? ""}
                            onChange={(e) => {
                              const raw = e.target.value.trim();
                              updateLine(l.id, { puHt: raw === "" ? null : Number(raw) });
                            }}
                          />
                        </td>
                        <td className="pg-num" data-label="Coût ajusté">
                          {computed?.prixManquant ? (
                            <span className="pg-badge" data-tone="warning">Prix manquant</span>
                          ) : computed ? (
                            <span title={`${quantite(computed.qteAvecParage, computed.unite)} avec parage`}>
                              {dinars(computed.coutLigne)}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {lignes.length > 1 && (
                            <button
                              type="button"
                              className="pg-btn pg-btn-sec pg-btn-xs"
                              onClick={() => removeLine(l.id)}
                              aria-label={`Retirer ${l.nom}`}
                            >
                              ×
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pg-actions-row">
              <button type="button" className="pg-btn pg-btn-sec" onClick={() => addLine(true)}>
                + Ingrédient proportionnel
              </button>
              <button type="button" className="pg-btn pg-btn-sec" onClick={() => addLine(false)}>
                + Élément fixe (décor, support)
              </button>
            </div>
          </section>

          {/* Étape 3 : Main-d'œuvre, emballage, énergie, pertes & marge */}
          <section className="pg-card pg-card-pad" aria-labelledby="est-overhead-title">
            <div className="pg-card-head">
              <div>
                <h2 id="est-overhead-title">3. Travail, emballage, cuisson &amp; marge cible</h2>
                <p className="pg-help">
                  Formules identiques aux fiches de coût PâtisGest (RC-01 à RC-10) : coûts toujours hors TVA, rendement net après perte de cuisson/découpe.
                </p>
              </div>
            </div>
            <div className="pg-form-grid">
              <label className="pg-field">
                <span className="pg-label">Perte cuisson / parage final (%)</span>
                <input
                  type="number"
                  min={0}
                  max={95}
                  step={0.5}
                  className="pg-input"
                  value={pertePct}
                  onChange={(e) => setPertePct(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Temps de travail (min)</span>
                <input
                  type="number"
                  min={0}
                  max={10000}
                  step={5}
                  className="pg-input"
                  value={moMin}
                  onChange={(e) => setMoMin(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Salaire par journée de travail (DA)</span>
                <input
                  type="number"
                  min={0}
                  step={100}
                  className="pg-input"
                  value={Math.round(tauxHoraire * HEURES_PAYEES_PAR_JOUR_DEFAUT * 100) / 100}
                  onChange={(e) => setTauxHoraire(tauxHoraireDepuisJournee(Math.min(SALAIRE_JOURNALIER_MAX, Math.max(0, Number(e.target.value) || 0))))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Charges sur MO (%)</span>
                <input
                  type="number"
                  min={0}
                  max={300}
                  step={1}
                  className="pg-input"
                  value={chargesPct}
                  onChange={(e) => setChargesPct(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Boîte &amp; emballage fixe (DA)</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  className="pg-input"
                  value={emballageFixe}
                  onChange={(e) => setEmballageFixe(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Four &amp; énergie (DA)</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  className="pg-input"
                  value={energie}
                  onChange={(e) => setEnergie(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Frais généraux atelier (DA)</span>
                <input
                  type="number"
                  min={0}
                  step={10}
                  className="pg-input"
                  value={fraisGeneraux}
                  onChange={(e) => setFraisGeneraux(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Coefficient prix cible (× coût)</span>
                <input
                  type="number"
                  min={1}
                  max={20}
                  step={0.1}
                  className="pg-input"
                  value={coefficientCible}
                  onChange={(e) => setCoefficientCible(Number(e.target.value))}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">Tester un prix fixe (DA, optionnel)</span>
                <input
                  type="number"
                  min={0}
                  step={50}
                  placeholder="Laisser vide = auto"
                  className="pg-input"
                  value={prixHtSaisi}
                  onChange={(e) => setPrixHtSaisi(e.target.value)}
                />
              </label>
              <label className="pg-field">
                <span className="pg-label">TVA indicative affichage (%)</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className="pg-input"
                  value={tvaIndicative}
                  onChange={(e) => setTvaIndicative(Number(e.target.value))}
                />
              </label>
            </div>
          </section>
        </div>

        {/* Colonne synthèse collante */}
        <aside className="pg-card pg-card-pad pg-est-summary" aria-labelledby="est-summary-title">
          <h2 id="est-summary-title">Synthèse du chiffrage (DA)</h2>
          <p className="pg-help">{modeleNom} · {moldCalc.formatLabel || "format à vérifier"}</p>

          {costCalc.erreur && (
            <p role="alert" className="pg-alert pg-alert-danger">
              {costCalc.erreur}
            </p>
          )}

          {res && (
            <>
              {res.coutIncomplet && (
                <div role="alert" className="pg-alert pg-alert-warning">
                  <strong>Coût partiel — aucun prix plancher proposé.</strong>{" "}
                  Renseignez le prix unitaire de : {res.lignesSansPrix.join(", ")}. Un coût incomplet ne doit jamais servir de base de vente.
                </div>
              )}

              <dl className="pg-est-breakdown">
                <div>
                  <dt>Matières proportionnelles (RC-01)</dt>
                  <dd className="pg-num">{dinars(res.coutMatieresVariables)}</dd>
                </div>
                <div>
                  <dt>Éléments fixes de recette</dt>
                  <dd className="pg-num">{dinars(res.coutComposantsFixes)}</dd>
                </div>
                <div>
                  <dt>Main-d’œuvre chargée ({moMin} min · RC-04)</dt>
                  <dd className="pg-num">{dinars(res.coutMo)}</dd>
                </div>
                <div>
                  <dt>Emballage, énergie &amp; frais fixes</dt>
                  <dd className="pg-num">{dinars(res.coutFraisFixes)}</dd>
                </div>
                <div className="pg-est-total-row">
                  <dt>
                    {res.coutIncomplet ? "Coût partiel connu (incomplet)" : "Coût de revient complet (RC-03)"}
                  </dt>
                  <dd className="pg-num">{dinars(res.coutComplet)}</dd>
                </div>
                <div>
                  <dt>Parts / pièces vendables (RC-02, −{pertePct} %)</dt>
                  <dd className="pg-num">{quantite(res.rendementNet)}</dd>
                </div>
                <div>
                  <dt>Coût par part vendable (RC-05)</dt>
                  <dd className="pg-num">
                    {dinars(res.coutParPartVendable)}
                    {res.coutIncomplet ? " (partiel)" : ""}
                  </dd>
                </div>
              </dl>

              {!res.coutIncomplet && res.prixHtPropose != null && (
                <div className="pg-est-price-box">
                  <span className="pg-kpi-label">
                    {prixHtSaisi.trim() !== "" ? "Prix de vente testé" : `Prix de vente proposé (×${quantite(coefficientCible)})`}
                  </span>
                  <strong className="pg-est-price-main pg-num">{dinars(prixRetenuHt ?? res.prixHtPropose)}</strong>
                  <p className="pg-help pg-num">
                    Soit <strong>{dinars(Math.round(((prixRetenuHt ?? res.prixHtPropose) / res.rendementNet) * 100) / 100)}</strong> / part vendable
                    {prixRetenuTtc != null && tvaIndicative > 0 && ` · ${dinars(prixRetenuTtc)} avec TVA ${tvaIndicative} %`}
                  </p>
                  {res.margeCommandeHt != null && res.tauxMargePct != null && (
                    <p className="pg-help pg-num" data-tone={res.margeCommandeHt < 0 ? "danger" : undefined}>
                      Marge brute (RC-06) : <strong>{dinars(res.margeCommandeHt)}</strong> ({quantite(Math.round(res.tauxMargePct * 10) / 10)} %)
                    </p>
                  )}
                </div>
              )}

              {res.gardeFous.length > 0 && (
                <ul className="pg-est-guards" aria-label="Garde-fous de cohérence">
                  {res.gardeFous.map((g, i) => (
                    <li key={`${g.code}-${i}`}>{g.message}</li>
                  ))}
                </ul>
              )}

              <div className="pg-est-actions">
                <button
                  type="button"
                  className="pg-btn"
                  disabled={Boolean(moldCalc.erreur)}
                  onClick={handleSaveDraft}
                >
                  Garder en brouillon pour un devis
                </button>
                {sessionMode ? (
                  <div className="pg-actions-row">
                    <Link href="/cake-design" className="pg-btn pg-btn-sec">
                      Ouvrir Cake Design
                    </Link>
                    {canReadCosts && (
                      <Link href="/simulation" className="pg-btn pg-btn-sec">
                        Fiches de coût &amp; hausses
                      </Link>
                    )}
                  </div>
                ) : (
                  <Link href="/connexion" className="pg-btn pg-btn-sec">
                    Se connecter ou ouvrir la démo
                  </Link>
                )}
              </div>

              {draftFeedback && (
                <p role="status" className="pg-help" style={{ marginTop: 8 }}>
                  {draftFeedback}
                </p>
              )}

              {savedDraft && (
                <div className="pg-est-draft-box">
                  <div>
                    <strong>Brouillon gardé sur cet appareil</strong>
                    <p className="pg-help">
                      {savedDraft.modeleNom} · {savedDraft.parts} parts
                      {savedDraft.prixHtPropose != null
                        ? ` · ${dinars(savedDraft.prixHtPropose)}`
                        : " · coût partiel (prix à compléter)"}{" "}
                      ({dateLisible(savedDraft.savedAt, "short")})
                    </p>
                  </div>
                  <button type="button" className="pg-btn pg-btn-sec pg-btn-xs" onClick={handleClearDraft}>
                    Effacer
                  </button>
                </div>
              )}

              <p className="pg-help" style={{ marginTop: 10 }}>
                Estimation indicative d’aide au chiffrage : pour un coût réel basé sur vos lots FEFO, vos sous-recettes et vos réceptions fournisseurs, utilisez l’atelier PâtisGest. Les devis déjà acceptés ne sont jamais modifiés.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
