import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeShopHealth } from "../src/lib/shop-advisor.ts";
import { filterPackByActivityAndVat } from "../src/lib/pack-patisserie-dz.ts";
import { parseArticleInput } from "../src/lib/stock-input.ts";
import { serieVentes } from "../src/lib/workspace-data.ts";

test("Shop Advisor calculates daily break-even gap, equivalent units, and warns on cash/waste risks", () => {
  const today = "2026-11-24";
  const series = serieVentes(
    [
      { date: today, totalTTC: 3000 },
      { date: "2026-11-23", totalTTC: 4000 },
      { date: "2026-11-15", totalTTC: 12000 },
      { date: "2026-11-14", totalTTC: 14000 },
    ],
    today,
    30,
  );
  const articles = [
    { id: "p1", nom: "Éclair chocolat", code: "PF-ECL", niveau: "produit", unite: "pcs", seuil: 10, prixTTC: 200 },
    { id: "p2", nom: "Pain spécial", code: "PF-PAIN", niveau: "produit", unite: "pcs", seuil: 20, prixTTC: 0 },
  ];
  const lots = [
    { id: "l1", articleId: "p1", siteId: "boutique", numero: "L1", qte: 2, recu: "2026-11-22", dlc: "2026-11-25", congele: false, bloque: false },
  ];
  const sales = [
    { date: today, totalTTC: 3000, lignes: [{ articleId: "p1", qty: 15, totalTTC: 3000 }] },
  ];

  const report = analyzeShopHealth({
    today,
    config: {
      monthlyRentDa: 60000,
      monthlyPayrollDa: 120000,
      monthlyUtilitiesDa: 30000,
      openDaysPerMonth: 30,
      targetFoodCostPct: 35,
    },
    series,
    sales,
    articles,
    lots,
    shopIds: ["boutique"],
    openCreditsDa: 25000,
    pendingPriceAlertsCount: 1,
  });

  // 210 000 / 30 = 7 000 DA/jour charges fixes; marge brute 65% => ~10 769 DA break-even/jour
  assert.equal(report.dailyFixedCostsDa, 7000);
  assert.ok(report.dailyBreakEvenDa > 10000);
  assert.ok(report.remainingToBreakEvenTodayDa > 7000);
  assert.equal(report.equivalentTopProduct?.nom, "Éclair chocolat");
  assert.ok((report.equivalentTopProduct?.units ?? 0) >= 35);
  assert.equal(report.status, "danger");
  assert.ok(report.score < 50);

  const ids = report.recommendations.map((r) => r.id);
  assert.ok(ids.includes("daily-breakeven-gap"));
  assert.ok(ids.includes("monthly-survival-risk"));
  assert.ok(ids.includes("credits-cash-trap"));
  assert.ok(ids.includes("anti-waste-dlc"));
  assert.ok(ids.includes("pricing-margin-guard"));
});

test("Shop Advisor celebrates profitable day when break-even is exceeded and risks are absent", () => {
  const today = "2026-11-24";
  const salesList = Array.from({ length: 30 }, (_, i) => {
    const d = new Date("2026-10-26T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + i);
    return { date: d.toISOString().slice(0, 10), totalTTC: 20000 };
  });
  const series = serieVentes(salesList, today, 30);
  const articles = [
    { id: "p1", nom: "Baguette", code: "PF-BAG", niveau: "produit", unite: "pcs", seuil: 10, prixTTC: 15 },
  ];
  const lots = [
    { id: "l1", articleId: "p1", siteId: "boutique", numero: "L1", qte: 300, recu: today, dlc: "2026-12-01", congele: false, bloque: false },
  ];
  const report = analyzeShopHealth({
    today,
    config: { monthlyRentDa: 60000, monthlyPayrollDa: 120000, monthlyUtilitiesDa: 30000, openDaysPerMonth: 30, targetFoodCostPct: 35 },
    series,
    sales: [{ date: today, totalTTC: 20000, lignes: [{ articleId: "p1", qty: 100, totalTTC: 1500 }] }],
    articles,
    lots,
    shopIds: ["boutique"],
    openCreditsDa: 0,
    pendingPriceAlertsCount: 0,
  });
  assert.equal(report.remainingToBreakEvenTodayDa, 0);
  assert.ok(report.todayNetResultDa > 0);
  assert.equal(report.status, "sain");
  assert.ok(report.score >= 90);
  assert.equal(report.recommendations[0].severity, "bravo");
});

test("Multi-sector DZ starter pack supports Boulangerie, Cake Shop & Algerian TVA regimes", () => {
  const boulangerieIfu = filterPackByActivityAndVat("boulangerie", "ifu_0");
  assert.ok(boulangerieIfu.some((i) => i.code === "PF-BAG"));
  assert.ok(boulangerieIfu.every((i) => i.tva === 0 && i.pvHt === i.prixDa));

  const cakeReel = filterPackByActivityAndVat("cake_shop", "reel_dz");
  assert.ok(cakeReel.some((i) => i.code === "PF-BEN" && i.tva === 19));
  const bento = cakeReel.find((i) => i.code === "PF-BEN");
  assert.ok(bento);
  assert.equal(Math.round(bento.pvHt * 1.19), bento.prixDa);

  const mixteReel = filterPackByActivityAndVat("mixte", "reel_dz");
  assert.equal(mixteReel.find((i) => i.code === "PF-BAG")?.tva, 0);
  assert.equal(mixteReel.find((i) => i.code === "MP-FAR")?.tva, 9);
  assert.equal(mixteReel.find((i) => i.code === "PF-BAK")?.tva, 19);
});

test("parseArticleInput accepts boutique price (prix_ttc) and computes internal pv_ht cleanly", () => {
  const fd = new FormData();
  fd.set("code", "PF-999");
  fd.set("nom", "Bento Cake");
  fd.set("niveau", "produit");
  fd.set("unite", "pcs");
  fd.set("seuil", "2");
  fd.set("prix_ttc", "1190");
  fd.set("tva", "19");
  const parsed = parseArticleInput(fd);
  assert.equal(parsed.pv_ht, 1000);
  assert.equal(parsed.tva, 19);
});
