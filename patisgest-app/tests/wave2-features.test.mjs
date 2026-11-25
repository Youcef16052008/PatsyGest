import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateEmployeePriceSubmission,
  resolveOwnerPriceAlert,
} from "../src/lib/owner-price-guard.ts";

test("B.6 owner price guard: proprietor edits create no alert", () => {
  const res = evaluateEmployeePriceSubmission({
    cibleType: "recette_libre",
    nomProduit: "Tarte citron",
    categorie: "tarte",
    prixSaisiDa: 250,
    coutEstimeDa: 200,
    auteurNom: "Amina",
    auteurRole: "proprietaire",
  });
  assert.equal(res, null);
});

test("B.6 owner price guard: employee normal price creates warning notification", () => {
  const alert = evaluateEmployeePriceSubmission({
    cibleType: "nouveau_produit",
    nomProduit: "Layer Cake Mangue",
    categorie: "gateau_entier",
    prixSaisiDa: 3200,
    coutEstimeDa: 1100,
    auteurNom: "Sara (Labo)",
    auteurRole: "labo",
    nowIso: "2026-11-24T10:00:00Z",
  });
  assert.ok(alert);
  assert.equal(alert.type, "nouveau_prix_employe");
  assert.equal(alert.severite, "warning");
  assert.equal(alert.traiteStatut, "en_attente");
  assert.equal(alert.prixConseilleDa, 2750);
  assert.ok(alert.message.includes("Sara (Labo)"));
});

test("B.6 owner price guard: abnormally low or below-cost employee price triggers critical alert", () => {
  const belowCost = evaluateEmployeePriceSubmission({
    cibleType: "recette_libre",
    nomProduit: "Tarte aux noix",
    categorie: "tarte",
    prixSaisiDa: 900,
    coutEstimeDa: 850,
    auteurNom: "Sara",
    auteurRole: "labo",
  });
  assert.ok(belowCost);
  assert.equal(belowCost.type, "prix_trop_bas");
  assert.equal(belowCost.severite, "critical");
  assert.ok(belowCost.message.includes("Prix très bas"));

  const belowFloor = evaluateEmployeePriceSubmission({
    cibleType: "nouveau_produit",
    nomProduit: "Gâteau mariage 20 parts",
    categorie: "gateau_entier",
    prixSaisiDa: 600,
    coutEstimeDa: null,
    auteurNom: "Amine",
    auteurRole: "vendeur",
  });
  assert.ok(belowFloor);
  assert.equal(belowFloor.type, "prix_trop_bas");
  assert.equal(belowFloor.severite, "critical");
});

test("B.6 owner resolution: approve, correct price, or block", () => {
  const alert = evaluateEmployeePriceSubmission({
    cibleType: "recette_libre",
    cibleId: "r-1",
    nomProduit: "Cake marbré",
    categorie: "cake",
    prixSaisiDa: 500,
    coutEstimeDa: 420,
    auteurNom: "Sara",
    auteurRole: "labo",
  });
  assert.ok(alert);

  const approved = resolveOwnerPriceAlert(alert, "approuve");
  assert.equal(approved.traiteStatut, "approuve");
  assert.equal(approved.prixFinalDa, 500);

  const corrected = resolveOwnerPriceAlert(alert, "corrige", 1100);
  assert.equal(corrected.traiteStatut, "corrige");
  assert.equal(corrected.prixFinalDa, 1100);

  const blocked = resolveOwnerPriceAlert(alert, "bloque");
  assert.equal(blocked.traiteStatut, "bloque");
  assert.equal(blocked.prixFinalDa, null);

  assert.throws(() => resolveOwnerPriceAlert(alert, "corrige", 0), /prix positif/);
});
