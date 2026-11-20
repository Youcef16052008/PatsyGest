// F-01 : un article à prix 0 ne doit JAMAIS produire un ticket valide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeCartTotals } from '../src/lib/pos-cart.ts';

test('F-01 : une ligne à prixHT 0 rend le ticket invalide (aucun encaissement à 0 DA)', () => {
  const t = computeCartTotals([{ articleId: 'a', label: 'Gâteau', qte: 1, prixHT: 0, tva: 0 }]);
  assert.equal(t.valide, false);
  assert.equal(t.prixIncomplet, true);
  assert.equal(t.totalTTC, null);
});

test('F-01 : un ticket mixte avec une ligne à 0 est invalide, même si l’autre ligne est correcte', () => {
  const t = computeCartTotals([
    { articleId: 'a', label: 'Éclair', qte: 2, prixHT: 100, tva: 9 },
    { articleId: 'b', label: 'Offert', qte: 1, prixHT: 0, tva: 0 },
  ]);
  assert.equal(t.valide, false);
});

test('F-01 : un prix strictement positif reste valide (non-régression)', () => {
  const t = computeCartTotals([{ articleId: 'a', label: 'Éclair', qte: 1, prixHT: 100, tva: 9 }]);
  assert.equal(t.valide, true);
  assert.equal(t.totalTTC, 109);
});
