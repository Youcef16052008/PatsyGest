import test from "node:test";
import assert from "node:assert/strict";
import { applyCreditPayment, creditBalanceDa, sumOpenCreditsDa } from "../src/lib/credits.ts";
import { PACK_PATISSERIE_DZ } from "../src/lib/pack-patisserie-dz.ts";
import { whatsappCreditReminderUrl, whatsappDailyClosingUrl, whatsappSaleReceiptUrl } from "../src/lib/whatsapp.ts";

test("A.3 credits: balance, partial payment, full settlement and sum", () => {
  const credit = {
    id: "c1",
    nomDebiteur: "Café El Bahdja",
    telephone: "0551 23 45 67",
    typeCompte: "cafe_entreprise",
    montantTotalDa: 10000,
    montantRegleDa: 2500,
    dateEcheance: null,
    note: "Croissants",
    statut: "ouvert",
    reglements: [],
    createdAt: "2026-11-24T08:00:00Z",
  };
  assert.equal(creditBalanceDa(credit), 7500);
  const partial = applyCreditPayment(credit, 3000, "Acompte");
  assert.equal(partial.statut, "ouvert");
  assert.equal(creditBalanceDa(partial), 4500);

  const paid = applyCreditPayment(partial, 4500, "Solde");
  assert.equal(paid.statut, "solde");
  assert.equal(creditBalanceDa(paid), 0);

  assert.throws(() => applyCreditPayment(paid, 100), /déjà soldé/);
  assert.throws(() => applyCreditPayment(partial, 5000), /dépasse le reste/);

  const sum = sumOpenCreditsDa([partial, paid]);
  assert.equal(sum, 4500);
});

test("A.6 Pack Pâtisserie DZ contains both products and ingredients with valid DA prices", () => {
  const products = PACK_PATISSERIE_DZ.filter((x) => x.niveau === "produit");
  const ingredients = PACK_PATISSERIE_DZ.filter((x) => x.niveau === "matiere");
  assert.ok(products.length >= 8);
  assert.ok(ingredients.length >= 6);
  const codes = new Set(PACK_PATISSERIE_DZ.map((x) => x.code));
  assert.equal(codes.size, PACK_PATISSERIE_DZ.length);
  for (const item of PACK_PATISSERIE_DZ) {
    assert.ok(item.prixDa > 0);
    assert.ok(item.nom.trim().length > 2);
  }
});

test("B.5 / A.3 WhatsApp builders normalize DZ numbers and format readable messages", () => {
  const relance = whatsappCreditReminderUrl({
    phone: "0550 11 22 33",
    debiteur: "Karim",
    resteDa: 4500,
    shop: "Maison Amande",
  });
  assert.ok(relance?.startsWith("https://wa.me/213550112233?text="));
  assert.ok(decodeURIComponent(relance ?? "").includes("4") && decodeURIComponent(relance ?? "").includes("500 DA"));

  const closing = whatsappDailyClosingUrl({
    phone: "0661 44 55 66",
    shop: "Maison Amande",
    date: "2026-11-24",
    totalVentesDa: 38500,
    especesAttenduesDa: 29000,
    especesCompteesDa: 29000,
    ecartDa: 0,
    tickets: 42,
    resteEncaisserDa: 7500,
  });
  assert.ok(closing?.startsWith("https://wa.me/213661445566?text="));
  assert.ok(decodeURIComponent(closing ?? "").includes("Tickets encaissés : 42"));

  const receipt = whatsappSaleReceiptUrl({
    phone: "0770 12 34 56",
    shop: "Maison Amande",
    numero: "V-042",
    totalDa: 1200,
    lines: [{ label: "Mille-feuille", qty: 4, unit: "pcs", totalDa: 720 }],
  });
  assert.ok(receipt?.startsWith("https://wa.me/213770123456?text="));
});
