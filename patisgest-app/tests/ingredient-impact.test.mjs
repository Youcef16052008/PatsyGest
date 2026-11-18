import test from "node:test";
import assert from "node:assert/strict";
import { computeIngredientImpact, expandRecipeNeeds } from "../src/lib/ingredient-impact.ts";
import { computeScaledFicheCout, selectProductVersion } from "../src/lib/cost-sheet.ts";
import { computeFefoCost } from "../src/lib/fefo-cost.ts";

const beurreArt = { id: "beurre", code: "MP-BEU", nom: "Beurre de tourage 84 %", unite: "kg", niveau: "matiere" };
const articles = [
  beurreArt,
  { id: "farine", code: "MP-FAR", nom: "Farine T55", unite: "kg", niveau: "matiere" },
  { id: "creme", code: "MP-CRE", nom: "Crème 35 %", unite: "L", niveau: "matiere" },
  { id: "pf-art", code: "SR-PF", nom: "Pâte feuilletée", unite: "kg", niveau: "intermediaire" },
  { id: "pral-art", code: "SR-PRA", nom: "Crème diplomate", unite: "kg", niveau: "intermediaire" },
  { id: "croissant", code: "PF-CRO", nom: "Croissant pur beurre", unite: "pcs", niveau: "produit" },
  { id: "millef", code: "PF-MF", nom: "Mille-feuille", unite: "pcs", niveau: "produit" },
  { id: "macaron", code: "PF-MAC", nom: "Biscuit sec", unite: "pcs", niveau: "produit" },
];

const conversions = [
  { uniteFrom: "g", uniteTo: "kg", facteur: 0.001 },
  { uniteFrom: "ml", uniteTo: "L", facteur: 0.001 },
];

const versions = [
  // Niveau 3 : sous-recette imbriquée utilisant 200 g de beurre
  {
    id: "v-diplomate",
    familleId: "f-dipl",
    familleCode: "REC-DIPL",
    familleNom: "Crème diplomate",
    produitId: "pral-art",
    pvHt: 0,
    version: 1,
    active: true,
    rendementQte: 2,
    rendementUnite: "kg",
    cuissonPct: 0,
    moMin: 20,
    tauxHoraire: 400,
    chargesPct: 25,
    emballage: 0,
    energie: 20,
    fraisGeneraux: 0,
    ingredients: [
      { articleId: "beurre", q: 200, u: "g", parage: 0 },
      { articleId: "creme", q: 500, u: "ml", parage: 0 },
    ],
  },
  // Niveau 2 : pâte feuilletée figée v2 (1 kg de beurre pour 4 kg de pâte)
  {
    id: "v-pf-2",
    familleId: "f-pf",
    familleCode: "REC-PF",
    familleNom: "Pâte feuilletée",
    produitId: "pf-art",
    pvHt: 0,
    version: 2,
    active: true,
    rendementQte: 4,
    rendementUnite: "kg",
    cuissonPct: 0,
    moMin: 30,
    tauxHoraire: 400,
    chargesPct: 25,
    emballage: 0,
    energie: 50,
    fraisGeneraux: 0,
    ingredients: [
      { articleId: "beurre", q: 1, u: "kg", parage: 0 },
      { articleId: "farine", q: 2, u: "kg", parage: 0 },
    ],
  },
  // Produit 1 : Croissant (2 kg de pâte feuilletée v2 = 0,5 kg de beurre)
  {
    id: "v-croissant",
    familleId: "f-cro",
    familleCode: "REC-CRO",
    familleNom: "Croissant pur beurre",
    produitId: "croissant",
    pvHt: 110,
    version: 1,
    active: true,
    rendementQte: 20,
    rendementUnite: "pcs",
    cuissonPct: 0,
    moMin: 30,
    tauxHoraire: 400,
    chargesPct: 25,
    emballage: 100,
    energie: 80,
    fraisGeneraux: 120,
    ingredients: [{ subVersionId: "v-pf-2", q: 2, u: "kg" }],
  },
  // Produit 2 : Mille-feuille (pâte feuilletée + diplomate + beurre direct = 0,7 kg beurre)
  {
    id: "v-mf",
    familleId: "f-mf",
    familleCode: "REC-MF",
    familleNom: "Mille-feuille vanille",
    produitId: "millef",
    pvHt: 320,
    version: 3,
    active: true,
    rendementQte: 10,
    rendementUnite: "pcs",
    cuissonPct: 0,
    moMin: 45,
    tauxHoraire: 400,
    chargesPct: 25,
    emballage: 150,
    energie: 100,
    fraisGeneraux: 150,
    ingredients: [
      { subVersionId: "v-pf-2", q: 2, u: "kg" },            // 0.5 kg beurre
      { subVersionId: "v-diplomate", q: 1, u: "kg" },       // 0.1 kg beurre (200 g × 0.5)
      { articleId: "beurre", q: 100, u: "g", parage: 0 },   // 0.1 kg beurre direct → total 0.7 kg
    ],
  },
  // Produit 3 : non impacté (farine seule)
  {
    id: "v-mac",
    familleId: "f-mac",
    familleCode: "REC-MAC",
    familleNom: "Biscuit sec",
    produitId: "macaron",
    pvHt: 120,
    version: 1,
    active: true,
    rendementQte: 20,
    rendementUnite: "pcs",
    cuissonPct: 0,
    moMin: 15,
    tauxHoraire: 400,
    chargesPct: 25,
    emballage: 50,
    energie: 30,
    fraisGeneraux: 20,
    ingredients: [{ articleId: "farine", q: 0.5, u: "kg" }],
  },
];

test("Impact hausse matière : traverse 3 niveaux de sous-recettes, convertit les unités et exclut les lots périmés/bloqués", () => {
  const lotsByArticle = new Map([
    [
      "beurre",
      [
        { id: "old", qte_rest: 10, pu: 500, dlc: "2026-11-01", date_reception: "2026-10-01", congele: false, bloque: false },
        { id: "blk", qte_rest: 10, pu: 600, dlc: "2026-12-30", date_reception: "2026-10-15", congele: false, bloque: true },
        { id: "ok", qte_rest: 5, pu: 1400, dlc: "2026-12-15", date_reception: "2026-11-10", congele: false, bloque: false },
      ],
    ],
    ["farine", [{ id: "far", qte_rest: 50, pu: 100, dlc: "2027-03-01", date_reception: "2026-11-01", congele: false, bloque: false }]],
    ["creme", [{ id: "cre", qte_rest: 10, pu: 800, dlc: "2026-12-01", date_reception: "2026-11-12", congele: false, bloque: false }]],
  ]);

  const snapshotBefore = JSON.stringify(versions);
  const report = computeIngredientImpact({
    article: beurreArt,
    ancienPu: 1500,
    sourceAncien: "Mercuriale octobre",
    nouveauPu: 1900, // +400 DA/kg
    sourceNouveau: "Réception 18/11",
    versions,
    articles,
    lotsByArticle,
    conversions,
    asOf: "2026-11-18",
  });

  // Lecture seule stricte : aucune mutation
  assert.equal(JSON.stringify(versions), snapshotBefore);
  assert.equal(report.ecartUnitaire, 400);

  const mf = report.recettes.find((r) => r.produitId === "millef");
  const cr = report.recettes.find((r) => r.produitId === "croissant");
  const mac = report.recettes.find((r) => r.produitId === "macaron");
  assert.ok(mf && cr);
  assert.equal(mac, undefined, "une recette sans beurre ne doit pas être listée");

  // Mille-feuille : 0.7 kg de beurre → +280 DA / série de 10 = +28 DA / pièce
  assert.equal(mf.deltaSerie, 280);
  assert.equal(mf.deltaParPart, 28);
  assert.equal(mf.usage, "mixte");
  assert.ok(mf.viaSubRecipes.some((s) => s.includes("Pâte feuilletée")));
  assert.ok(mf.viaSubRecipes.some((s) => s.includes("Crème diplomate")));

  // Lot périmé exclu (10 kg) et ancien lot valide protège la série (1400 < 1900)
  assert.equal(mf.lots.perimeExcluIngredient, 10);
  assert.equal(mf.lots.ancienLotProtege, true);
  assert.ok(mf.prochainAchat.coutParPart > mf.lots.coutParPart);
  assert.ok((mf.prochainAchat.pvHtMaintienMarge ?? 0) > mf.pvHt);

  // Croissant : 0.5 kg de beurre → +200 DA / 20 pcs = +10 DA / pièce
  assert.equal(cr.deltaParPart, 10);
  assert.equal(cr.usage, "sous-recette");
});

test("Impact matière : anti-cycle sur sous-recette et baisse de prix", () => {
  const cyclic = [
    {
      id: "v-a", familleId: "fa", familleCode: "A", familleNom: "A", produitId: "pf-art", pvHt: 0,
      version: 1, active: true, rendementQte: 1, rendementUnite: "kg",
      cuissonPct: 0, moMin: 0, tauxHoraire: 400, chargesPct: 0, emballage: 0, energie: 0, fraisGeneraux: 0,
      ingredients: [{ subVersionId: "v-b", q: 1, u: "kg" }],
    },
    {
      id: "v-b", familleId: "fb", familleCode: "B", familleNom: "B", produitId: "croissant", pvHt: 100,
      version: 1, active: true, rendementQte: 1, rendementUnite: "pcs",
      cuissonPct: 0, moMin: 0, tauxHoraire: 400, chargesPct: 0, emballage: 0, energie: 0, fraisGeneraux: 0,
      ingredients: [{ subVersionId: "v-a", q: 1, u: "kg" }, { articleId: "beurre", q: 0.1, u: "kg" }],
    },
  ];
  const exp = expandRecipeNeeds({ version: cyclic[1], allVersions: cyclic, articles, conversions });
  assert.ok(exp.needs.some((n) => n.articleId === "beurre"));

  // Baisse de prix (-200 DA/kg) → delta négatif
  const baisse = computeIngredientImpact({
    article: beurreArt,
    ancienPu: 1800,
    sourceAncien: "Avant",
    nouveauPu: 1600,
    sourceNouveau: "Après",
    versions,
    articles,
    lotsByArticle: new Map([
      ["beurre", [{ id: "L1", qte_rest: 10, pu: 1800, dlc: "2026-12-31", date_reception: "2026-11-01", congele: false, bloque: false }]],
      ["farine", [{ id: "L2", qte_rest: 20, pu: 100, dlc: "2026-12-31", date_reception: "2026-11-01", congele: false, bloque: false }]],
    ]),
    conversions,
    asOf: "2026-11-18",
  });
  const cr = baisse.recettes.find((r) => r.produitId === "croissant");
  assert.equal(cr?.deltaParPart, -5);
});

test("FEFO & Fiche de coût corrigée : exclusion des DLC dépassées et sélection stricte par produitId", () => {
  const fefo = computeFefoCost(
    [
      { id: "PERIME", qte_rest: 5, pu: 900, dlc: "2026-11-17", date_reception: "2026-10-01", congele: false, bloque: false },
      { id: "BLOQUE", qte_rest: 5, pu: 800, dlc: "2026-12-31", date_reception: "2026-10-01", congele: false, bloque: true },
      { id: "VALIDE", qte_rest: 5, pu: 1600, dlc: "2026-11-18", date_reception: "2026-11-01", congele: false, bloque: false },
    ],
    2,
    "2026-11-18",
  );
  assert.equal(fefo.cout, 3200); // DLC du jour éligible, veille & bloqué exclus
  assert.equal(fefo.perimeExclu, 5);
  assert.equal(fefo.lignes[0].lotId, "VALIDE");

  // Anti-régression actions-couts : ne jamais sélectionner la version active d'un autre produit
  const picked = selectProductVersion(
    [
      { produitId: "autre-prod", code: "R1", nom: "Autre", active: true, rendementQte: 10, moMin: 999, energie: 999, emballage: 999, fraisGeneraux: 999, cuissonPct: 50 },
      { produitId: "croissant", code: "R2", nom: "Croissant", active: true, rendementQte: 20, moMin: 60, energie: 100, emballage: 200, fraisGeneraux: 100, cuissonPct: 0 },
    ],
    "croissant",
  );
  assert.equal(picked?.code, "R2");

  // Mise à l'échelle pour qte = 40 (2× rendementQte = 20) : le coût unitaire reste invariant
  const f20 = computeScaledFicheCout({ version: picked, qte: 20, matiereFefo: 1000, tauxHoraire: 400, chargesPct: 25, pvHt: 150 });
  const f40 = computeScaledFicheCout({ version: picked, qte: 40, matiereFefo: 2000, tauxHoraire: 400, chargesPct: 25, pvHt: 150 });
  assert.equal(f20.rc05ParPortion, f40.rc05ParPortion);
  assert.equal(f40.rc03Total, f20.rc03Total * 2);
});
