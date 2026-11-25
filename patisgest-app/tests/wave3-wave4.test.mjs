import test from "node:test";
import assert from "node:assert/strict";
import { defaultPastryVisual } from "../src/lib/pastry-visuals.ts";
import { computeFetesShoppingList, whatsappMarketListUrl } from "../src/lib/fetes-dz.ts";
import { NAV_LABELS_AR, readLocale, UI_DICT } from "../src/lib/i18n.ts";
import { matchCatalogArticle, parseSupplierInvoiceText } from "../src/lib/invoice-photo-parser.ts";

test("B.1 pastry visuals: returns distinct offline SVG illustrations for Algerian pastries", () => {
  const baklawa = defaultPastryVisual("Baklawa Amandes");
  const makrout = defaultPastryVisual("Makrout El Louse");
  const kalb = defaultPastryVisual("Kalb El Louz");
  const millefeuille = defaultPastryVisual("Mille-feuille Vanille");
  const cake = defaultPastryVisual("Layer Cake Anniversaire");
  const generic = defaultPastryVisual("Spécialité maison");

  for (const uri of [baklawa, makrout, kalb, millefeuille, cake, generic]) {
    assert.ok(uri.startsWith("data:image/svg+xml;utf8,"));
  }
  assert.notEqual(baklawa, makrout);
  assert.notEqual(makrout, kalb);
  assert.notEqual(millefeuille, cake);
});

test("B.3 Fêtes & Ramadan planner: aggregates quantities across specialties and formats WhatsApp market list", () => {
  const plan = computeFetesShoppingList({
    "fete-baklawa": 4, // 4 kg
    "fete-makrout-assel": 2, // 2 kg
  });

  assert.ok(plan.lignesMarche.length > 0);
  const miel = plan.lignesMarche.find((l) => l.nom.includes("Miel"));
  assert.ok(miel);
  // 4 * 0.35 + 2 * 0.3 = 2.0 kg
  assert.equal(miel.quantiteBase, 2);
  assert.equal(miel.uniteBase, "kg");
  assert.equal(plan.chiffreAffairesEstimeDa, 4 * 3200 + 2 * 1600);
  assert.ok(plan.budgetAchatsDa > 0);
  assert.equal(plan.beneficeEstimeDa, plan.chiffreAffairesEstimeDa - plan.budgetAchatsDa);

  const waUrl = whatsappMarketListUrl({
    phone: "0550123456",
    titre: "Aïd El-Fitr",
    plan,
  });
  assert.ok(waUrl.startsWith("https://wa.me/213550123456?text="));
  assert.ok(decodeURIComponent(waUrl).includes("Miel"));
});

test("B.2 bilingual FR / AR i18n: locale parser and RTL dictionary coverage", () => {
  assert.equal(readLocale(undefined), "fr");
  assert.equal(readLocale("fr"), "fr");
  assert.equal(readLocale("ar"), "ar");
  assert.equal(readLocale("en"), "fr");

  for (const href of ["/tableau-de-bord", "/caisse", "/cake-design", "/recettes", "/stocks", "/parametres"]) {
    assert.ok(NAV_LABELS_AR[href] && NAV_LABELS_AR[href].length > 0);
  }
  assert.ok(UI_DICT.ar.kitchenTitle.length > 0);
  assert.ok(UI_DICT.ar.posPay.length > 0);
});

test("B.4 supplier invoice parser: extracts quantities, DA prices, and fuzzy-matches shop articles", () => {
  const catalog = [
    { id: "a1", nom: "Farine T45", unite: "kg" },
    { id: "a2", nom: "Beurre de tourage", unite: "kg" },
    { id: "a3", nom: "Sucre cristallisé", unite: "kg" },
  ];

  const match = matchCatalogArticle("Farine", catalog);
  assert.equal(match?.id, "a1");

  const lines = parseSupplierInvoiceText(
    "Farine 25 kg 95 DA\nBeurre tourage : 10 x 950\nLevure chimique 20 x 45",
    catalog,
  );
  assert.equal(lines.length, 3);
  assert.equal(lines[0].articleId, "a1");
  assert.equal(lines[0].qte, 25);
  assert.equal(lines[0].puDa, 95);
  assert.equal(lines[0].matched, true);

  assert.equal(lines[1].articleId, "a2");
  assert.equal(lines[1].qte, 10);
  assert.equal(lines[1].puDa, 950);
  assert.equal(lines[1].matched, true);

  assert.equal(lines[2].matched, false);
  assert.equal(lines[2].qte, 20);
  assert.equal(lines[2].puDa, 45);
});
