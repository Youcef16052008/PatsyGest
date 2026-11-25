import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeFreeRecipeSummary, lineCostDa } from '../src/lib/free-recipes.ts';
import { computeCashSummary, topSellingProducts } from '../src/lib/dashboard-insights.ts';
import { normalizeAlgerianPhone, whatsappOrderUrl } from '../src/lib/whatsapp.ts';

test('Recettes libres : conversion g/kg et ml/L et calcul coût par part', () => {
  assert.equal(lineCostDa({ id: '1', nom: 'Beurre', qty: 500, unite: 'g', prix: 900, basePrix: 'par_kg' }), 450);
  assert.equal(lineCostDa({ id: '2', nom: 'Crème', qty: 250, unite: 'ml', prix: 800, basePrix: 'par_L' }), 200);
  assert.equal(lineCostDa({ id: '3', nom: 'Œufs', qty: 10, unite: 'pcs', prix: 22, basePrix: 'par_unite' }), 220);
  assert.equal(lineCostDa({ id: '4', nom: 'Vanille', qty: 1, unite: 'pcs', prix: 130, basePrix: 'total' }), 130);

  const summary = computeFreeRecipeSummary({
    portions: 10,
    emballageDa: 100,
    cuissonMoDa: 100,
    prixVenteDa: 300,
    ingredients: [
      { id: '1', nom: 'Beurre', qty: 500, unite: 'g', prix: 900, basePrix: 'par_kg' },
      { id: '2', nom: 'Crème', qty: 250, unite: 'ml', prix: 800, basePrix: 'par_L' },
      { id: '3', nom: 'Œufs', qty: 10, unite: 'pcs', prix: 22, basePrix: 'par_unite' },
      { id: '4', nom: 'Vanille', qty: 1, unite: 'pcs', prix: 130, basePrix: 'total' },
    ],
  });
  assert.equal(summary.coutIngredients, 1000);
  assert.equal(summary.coutTotal, 1200);
  assert.equal(summary.coutParPart, 120);
  assert.equal(summary.beneficeParPart, 180);
  assert.equal(summary.margePct, 60);
  assert.equal(summary.conseils[1].prix, 300);
});

test('Dashboard Patron : top 5 produits vendus et répartition espèces/carte du jour', () => {
  const today = '2026-11-24';
  const articles = [
    { id: 'p1', nom: 'Éclair chocolat', code: 'PF-1', niveau: 'produit', unite: 'pcs', seuil: 5, prixTTC: 250 },
    { id: 'p2', nom: 'Croissant', code: 'PF-2', niveau: 'produit', unite: 'pcs', seuil: 5, prixTTC: 120 },
  ];
  const sales = [
    { date: today, totalTTC: 1240, modePaiement: 'especes', lignes: [{ articleId: 'p1', qty: 4 }, { articleId: 'p2', qty: 2 }] },
    { date: today, totalTTC: 600, modePaiement: 'carte', lignes: [{ articleId: 'p2', qty: 5 }] },
  ];
  const top = topSellingProducts(sales, articles, today, 7);
  assert.equal(top.length, 2);
  assert.equal(top[0].id, 'p1');
  assert.equal(top[0].revenueDa, 1000);
  assert.equal(top[1].id, 'p2');
  assert.equal(top[1].revenueDa, 840);

  const cash = computeCashSummary(sales, today);
  assert.deepEqual(cash, { totalDa: 1840, cashDa: 1240, cardDa: 600, transferDa: 0, tickets: 2 });
});

test('WhatsApp : normalisation des numéros algériens', () => {
  assert.equal(normalizeAlgerianPhone('0550 12 34 56'), '213550123456');
  assert.equal(normalizeAlgerianPhone('+213 661 11 22 33'), '213661112233');
  assert.equal(normalizeAlgerianPhone(''), null);
  const url = whatsappOrderUrl({ phone: '0550 00 00 00', client: 'Samira', numero: 'CK-01', eventDate: '2026-11-26', parts: 20, resteDa: 5000 });
  assert.ok(url?.startsWith('https://wa.me/213550000000?text='));
});
