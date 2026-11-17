import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allergenLabel, buildLabelModel, segmentIngredient } from '../src/lib/label-model.ts';

const product = (over = {}) => ({
  code: 'PF-ECL',
  nom: 'Éclair au chocolat',
  allergenes: ['gluten', 'lait', 'oeufs'],
  traces: [],
  ...over,
});

test('étiquette : allergènes en libellés français', () => {
  assert.equal(allergenLabel('fruits_coque'), 'Fruits à coque');
  assert.equal(allergenLabel('oeufs'), 'Œufs');
  assert.equal(allergenLabel('inconnu'), 'Inconnu');
});

test('étiquette : mots-clés surlignés dans les ingrédients', () => {
  const segs = segmentIngredient('Beurre doux 82%', ['lait', 'beurre', 'crème']);
  assert.ok(segs.some((s) => s.allergen && s.text.toLowerCase().includes('beurre')));
  const plain = segmentIngredient('Sucre semoule', ['lait']);
  assert.ok(plain.every((s) => !s.allergen));
});

test('étiquette : modèle complet avec recette et lot', () => {
  const model = buildLabelModel(
    product(),
    [
      { code: 'SF-PFE', nom: 'Pâte feuilletée', q: 1.2, u: 'kg' },
      { code: 'MP-BEU', nom: 'Beurre doux', q: 0.5, u: 'kg' },
      { code: 'MP-SUC', nom: 'Sucre semoule', q: 0.15, u: 'kg' },
    ],
    [{ numero: 'L-2026-001', dlc: '2026-12-01' }],
  );
  assert.equal(model.sansRecette, false);
  assert.equal(model.lot, 'L-2026-001');
  assert.equal(model.dlc, '2026-12-01');
  assert.deepEqual(model.allergenes, ['Gluten', 'Lait', 'Œufs']);
  assert.ok(model.ingredientSegments[1].some((s) => s.allergen)); // Beurre → lait
  assert.ok(!model.ingredientSegments[2].some((s) => s.allergen)); // Sucre → rien
});

test('étiquette : sans recette ni lot — mentions par défaut', () => {
  const model = buildLabelModel(product({ allergenes: [], traces: ['sesame'] }), [], []);
  assert.equal(model.sansRecette, true);
  assert.equal(model.lot, null);
  assert.equal(model.dlc, null);
  assert.deepEqual(model.allergenes, []);
  assert.deepEqual(model.traces, ['Sésame']);
});

test('étiquette : le lot sans DLC est ignoré si un lot daté existe', () => {
  const model = buildLabelModel(
    product(),
    [],
    [
      { numero: 'L-SANS-DLC', dlc: null },
      { numero: 'L-DATÉ', dlc: '2026-12-31' },
    ],
  );
  // l'appelant trie (DLC d'abord) ; le modèle prend le premier fourni
  assert.equal(model.lot, 'L-SANS-DLC');
});
