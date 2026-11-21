import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { computeCartTotals } from '../src/lib/pos-cart.ts';

const roundHalfUp = (numerateur, denominateur) =>
  (2n * numerateur + denominateur) / (2n * denominateur);

test('POS : le cas 2,50 × 1,19 est identique à PostgreSQL numeric (demi-centime)', async () => {
  const db = new PGlite();
  try {
    const sql = await db.query(`
      select round(1::numeric * 2.50::numeric, 2) as total_ht,
             round(1::numeric * 2.50::numeric * (1 + 19::numeric / 100), 2) as total_ttc
    `);
    const js = computeCartTotals([{
      articleId: 'article', label: 'Produit', qte: 1, prixHT: 2.5, tva: 19,
    }]);
    assert.equal(js.lignes[0].totalHT, Number(sql.rows[0].total_ht));
    assert.equal(js.lignes[0].totalTTC, Number(sql.rows[0].total_ttc));
    assert.equal(js.lignes[0].totalHT, 2.5);
    assert.equal(js.lignes[0].totalTVA, 0.48);
    assert.equal(js.lignes[0].totalTTC, 2.98);
    assert.equal(js.totalTTC, 2.98);
  } finally {
    await db.close();
  }
});

test('POS : concorde avec l’arrondi décimal demi-haut sur une matrice déterministe de 200 000 cas', () => {
  const batchSize = 50;
  for (let start = 0; start < 200_000; start += batchSize) {
    const cart = [];
    const expected = [];
    for (let index = start; index < Math.min(start + batchSize, 200_000); index += 1) {
      // Prix en centimes, quantités à 4 décimales, TVA de 0 à 25 %.
      const prixCentimes = (index * 7919) % 500_000 + 1;
      const qteDixMilles = (index * 104_729) % 1_000_000 + 1;
      const tva = (index * 13) % 26;
      cart.push({
        articleId: `article-${index}`,
        label: 'Produit',
        qte: qteDixMilles / 10_000,
        prixHT: prixCentimes / 100,
        tva,
      });
      expected.push({
        ht: roundHalfUp(BigInt(qteDixMilles) * BigInt(prixCentimes), 10_000n),
        ttc: roundHalfUp(BigInt(qteDixMilles) * BigInt(prixCentimes) * BigInt(100 + tva), 1_000_000n),
      });
    }

    const result = computeCartTotals(cart);
    for (let index = 0; index < expected.length; index += 1) {
      const ht = Number(expected[index].ht);
      const ttc = Number(expected[index].ttc);
      assert.equal(Math.round(result.lignes[index].totalHT * 100), ht, `HT, cas ${start + index}`);
      assert.equal(Math.round(result.lignes[index].totalTTC * 100), ttc, `TTC, cas ${start + index}`);
      assert.equal(Math.round(result.lignes[index].totalTVA * 100), ttc - ht, `TVA, cas ${start + index}`);
    }
  }
});
