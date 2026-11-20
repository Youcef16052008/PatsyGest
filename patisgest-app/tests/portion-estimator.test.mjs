import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEstimatorDraft,
  computeEstimationDa,
  ESTIMATOR_PRESETS,
  mouleVersParts,
  parseEstimatorDraft,
  partsVersMoule,
  PORTION_PROFILES,
} from "../src/lib/portion-estimator.ts";

test("Estimateur moule → parts : rond, carré, rectangle et unités individuelles", () => {
  const rond20 = mouleVersParts(
    { forme: "rond", diametreCm: 20, hauteurCm: 6 },
    PORTION_PROFILES.moyenne.volumeCm3,
  );
  assert.ok(rond20.parts >= 10 && rond20.parts <= 16, `attendu ~12-13 parts, obtenu ${rond20.parts}`);
  assert.match(rond20.formatLabel, /20/);
  assert.ok(rond20.conseilDecoupe.length > 5);

  const rond26 = mouleVersParts(
    { forme: "rond", diametreCm: 26, hauteurCm: 6 },
    PORTION_PROFILES.moyenne.volumeCm3,
  );
  assert.ok(rond26.parts > rond20.parts, "un moule Ø 26 doit donner plus de parts qu’un Ø 20");

  // Un profil généreux donne moins (ou autant) de parts qu'une petite part événementielle.
  const petite20 = mouleVersParts(
    { forme: "rond", diametreCm: 20, hauteurCm: 6 },
    PORTION_PROFILES.petite.volumeCm3,
  );
  const genereuse20 = mouleVersParts(
    { forme: "rond", diametreCm: 20, hauteurCm: 6 },
    PORTION_PROFILES.genereuse.volumeCm3,
  );
  assert.ok(petite20.parts >= rond20.parts && rond20.parts >= genereuse20.parts);

  const carre = mouleVersParts(
    { forme: "carre", coteCm: 24, hauteurCm: 6 },
    PORTION_PROFILES.moyenne.volumeCm3,
  );
  assert.ok(carre.parts >= 20);

  const rect = mouleVersParts(
    { forme: "rectangle", longueurCm: 40, largeurCm: 30, hauteurCm: 5 },
    PORTION_PROFILES.moyenne.volumeCm3,
  );
  assert.ok(rect.parts >= 35);

  const coffret = mouleVersParts(
    { forme: "unites", nbUnites: 24 },
    PORTION_PROFILES.moyenne.volumeCm3,
  );
  assert.equal(coffret.parts, 24);
});

test("Estimateur parts → moule : recommande des dimensions d'atelier cohérentes et monotones", () => {
  const r12 = partsVersMoule(12, "rond", 6, PORTION_PROFILES.moyenne.volumeCm3);
  const r24 = partsVersMoule(24, "rond", 6, PORTION_PROFILES.moyenne.volumeCm3);
  assert.equal(r12.moule.forme, "rond");
  assert.equal(r24.moule.forme, "rond");
  assert.ok(r24.moule.diametreCm > r12.moule.diametreCm);
  assert.ok(r24.partsObtenues >= 24);

  const sq = partsVersMoule(16, "carre", 6, PORTION_PROFILES.moyenne.volumeCm3);
  assert.equal(sq.moule.forme, "carre");
  assert.ok(sq.moule.coteCm >= 16);

  const rc = partsVersMoule(30, "rectangle", 5, PORTION_PROFILES.moyenne.volumeCm3);
  assert.equal(rc.moule.forme, "rectangle");
  assert.ok(rc.moule.longueurCm >= rc.moule.largeurCm);
});

test("Estimateur coût DA : distingue ingrédients proportionnels et frais fixes par commande (RC-01..RC-06)", () => {
  const res = computeEstimationDa({
    modeleNom: "Royal chocolat",
    lignes: [
      { id: "1", nom: "Chocolat", qteBase: 0.5, unite: "kg", puHt: 2400, paragePct: 0, redimensionnable: true },
      { id: "2", nom: "Amandes", qteBase: 0.2, unite: "kg", puHt: 2000, paragePct: 10, redimensionnable: true },
      { id: "3", nom: "Support doré", qteBase: 1, unite: "pcs", puHt: 250, paragePct: 0, redimensionnable: false },
    ],
    partsBase: 10,
    partsCibles: 20, // facteur ×2
    pertePct: 10,    // rendement net = 18 parts vendables
    moMin: 60,
    tauxHoraire: 500,
    chargesPct: 20,  // MO = 600 DA
    emballageFixe: 150,
    energie: 100,
    fraisGeneraux: 150,
    coefficientCible: 2.5,
  });

  assert.equal(res.facteurEchelle, 2);
  // Chocolat : 0.5 * 2 * 2400 = 2400 ; Amandes : 0.2 * 2 * 1.1 * 2000 = 880 → variable = 3280
  assert.equal(res.coutMatieresVariables, 3280);
  // Support doré reste à 1 × 250 (non doublé quand les parts doublent)
  assert.equal(res.coutComposantsFixes, 250);
  assert.equal(res.coutMatieres, 3530);
  assert.equal(res.coutMo, 600);
  assert.equal(res.coutFraisFixes, 400);
  assert.equal(res.coutComplet, 4530);
  assert.equal(res.rendementNet, 18);
  assert.equal(res.coutIncomplet, false);
  assert.equal(res.prixHtPropose, 11325); // 4530 × 2.5 (jamais de TVA incluse)
  assert.equal(res.margeCommandeHt, 6795);
  assert.equal(res.tauxMargePct, 60); // (11325 - 4530) / 11325 = 60 %
});

test("Estimateur coût DA : une estimation incomplète ne publie jamais de prix plancher ni conseillé", () => {
  const res = computeEstimationDa({
    modeleNom: "Entremets pistache",
    lignes: [
      { id: "1", nom: "Farine", qteBase: 1, unite: "kg", puHt: 120, paragePct: 0, redimensionnable: true },
      { id: "2", nom: "Pistache", qteBase: 0.3, unite: "kg", puHt: null, paragePct: 0, redimensionnable: true },
    ],
    partsBase: 10,
    partsCibles: 10,
    pertePct: 0,
    moMin: 30,
    tauxHoraire: 400,
    chargesPct: 25,
    emballageFixe: 100,
    energie: 50,
    fraisGeneraux: 50,
    coefficientCible: 3,
    prixHtSaisi: 5000,
  });

  assert.equal(res.coutIncomplet, true);
  assert.deepEqual(res.lignesSansPrix, ["Pistache"]);
  assert.equal(res.prixHtPropose, null);
  assert.equal(res.prixParPartHtPropose, null);
  assert.equal(res.margeCommandeHt, null);
  assert.equal(res.tauxMargePct, null);

  const draft = buildEstimatorDraft({
    presetId: "entremets-20",
    modeleNom: "Entremets pistache",
    formatLabel: "Rond Ø 20 cm × H 6 cm",
    conseilDecoupe: "12 parts",
    parts: 12,
    pertePct: 0,
    moMin: 30,
    result: res,
  });
  assert.equal(draft.coutIncomplet, true);
  assert.equal(draft.prixHtPropose, null);

  // Même si le JSON local est altéré, parseEstimatorDraft force prixHtPropose à null
  const tampered = parseEstimatorDraft({ ...draft, prixHtPropose: 9999 });
  assert.equal(tampered?.prixHtPropose, null);
  assert.equal(parseEstimatorDraft({ version: 99 }), null);
});

test("Estimateur DA : les 3 préréglages algériens donnent des fiches complètes et valides", () => {
  assert.equal(ESTIMATOR_PRESETS.length, 3);
  for (const preset of ESTIMATOR_PRESETS) {
    const moldRes = mouleVersParts(preset.mouleBase, preset.volumePartCm3);
    const cost = computeEstimationDa({
      modeleNom: preset.titre,
      lignes: preset.lignes,
      partsBase: preset.partsBase,
      partsCibles: moldRes.parts,
      pertePct: preset.pertePct,
      moMin: preset.moMinBase,
      tauxHoraire: preset.tauxHoraire,
      chargesPct: preset.chargesPct,
      emballageFixe: preset.emballageFixe,
      energie: preset.energie,
      fraisGeneraux: preset.fraisGeneraux,
      coefficientCible: preset.coefficientCible,
    });
    assert.equal(cost.coutIncomplet, false, `préréglage ${preset.id} devrait être complet`);
    assert.ok((cost.prixHtPropose ?? 0) > cost.coutComplet, `préréglage ${preset.id} marge positive`);
  }
});
