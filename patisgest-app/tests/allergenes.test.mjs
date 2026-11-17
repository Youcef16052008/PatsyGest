import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ALLERGEN_SLUGS, normaliserSlug, normaliserListe,
  allergenesDerives, verifierDeclaration, declarationConforme,
} from '../src/lib/allergenes.ts';

/** @typedef {import('../src/lib/allergenes.ts').ArticleAllergene} ArticleAllergene */
/** @typedef {import('../src/lib/allergenes.ts').VersionRecette} VersionRecette */
/** @type {ArticleAllergene[]} */

/**
 * MOD-10 — allergènes matières → produits (décret 13-378, annexe II).
 * Les cas reprennent les données réelles du jeu pilote.
 */

const articles = [
  { code: 'MP-FAR', nom: 'Farine T55', niveau: 'matiere', allergenes: ['gluten'] },
  { code: 'MP-BEU', nom: 'Beurre doux 82%', niveau: 'matiere', allergenes: ['lait'] },
  { code: 'MP-LAI', nom: 'Lait entier', niveau: 'matiere', allergenes: ['lait'] },
  { code: 'MP-SUC', nom: 'Sucre semoule', niveau: 'matiere', allergenes: [] },
  { code: 'MP-OEU', nom: 'Œufs frais', niveau: 'matiere', allergenes: ['oeufs'] },
  { code: 'MP-AMA', nom: 'Amandes moulues', niveau: 'matiere', allergenes: ['fruits_coque'] },
  { code: 'SF-PFE', nom: 'Pâte feuilletée', niveau: 'semifini', allergenes: ['gluten', 'lait'] },
];

// Recette réelle du croissant pilote (v1) : farine, beurre, sucre, lait.
/** @type {VersionRecette} */
const croissant = {
  id: 'v-cro', familleId: 'RF-CRO',
  ingredients: [
    { articleId: 'MP-FAR', q: 3, u: 'kg' },
    { articleId: 'MP-BEU', q: 0.8, u: 'kg' },
    { articleId: 'MP-SUC', q: 0.3, u: 'kg' },
    { articleId: 'MP-LAI', q: 1.2, u: 'L' },
  ],
};

test('MOD-10 : les 14 allergènes légaux sont couverts par la normalisation', () => {
  assert.equal(ALLERGEN_SLUGS.length, 14);
  for (const slug of ALLERGEN_SLUGS) assert.equal(normaliserSlug(slug), slug);
});

test('MOD-10 : normalisation des saisies libres et des accents', () => {
  assert.equal(normaliserSlug('Œufs'), 'oeufs');
  assert.equal(normaliserSlug('oeuf'), 'oeufs');
  assert.equal(normaliserSlug('Céleri'), 'celeri');
  assert.equal(normaliserSlug('céléri'), 'celeri');
  assert.equal(normaliserSlug('Fruits à coque'), 'fruits_coque');
  assert.equal(normaliserSlug('fruits-a-coque'), 'fruits_coque');
  assert.equal(normaliserSlug('arachide'), 'arachides');
});

test('MOD-10 : normaliserListe déduplique, filtre hors-référentiel et trie', () => {
  assert.deepEqual(normaliserListe(['lait', 'gluten', 'lait', 'Œufs']), ['gluten', 'lait', 'oeufs']);
  // « colorant » n'est pas un allergène légal : ignoré, pas d'exception.
  assert.deepEqual(normaliserListe(['colorant', 'lait']), ['lait']);
  assert.deepEqual(normaliserListe([]), []);
});

test('MOD-10 : croissant — dérivés = gluten + lait, PAS œufs', () => {
  const { derives, articlesLus } = allergenesDerives('v-cro', [croissant], articles);
  assert.deepEqual(derives, ['gluten', 'lait']);
  assert.deepEqual(articlesLus.sort(), ['MP-BEU', 'MP-FAR', 'MP-LAI', 'MP-SUC']);
});

test('MOD-10 : sur-déclaration réelle du pilote — « oeufs » déclaré sans matière', () => {
  // État mesuré en base : PF-CRO déclarait gluten, lait, oeufs.
  const { derives, articlesLus } = allergenesDerives('v-cro', [croissant], articles);
  const d = verifierDeclaration(['gluten', 'lait', 'oeufs'], derives, articlesLus);
  assert.deepEqual(d.enTrop, ['oeufs']);
  assert.deepEqual(d.manquants, []);
  assert.equal(declarationConforme(d), true, 'une sur-déclaration ne bloque pas l’impression');
});

test('MOD-10 : sous-déclaration = BLOQUANT (allergène présent non déclaré)', () => {
  const { derives } = allergenesDerives('v-cro', [croissant], articles);
  const d = verifierDeclaration(['gluten'], derives);
  assert.deepEqual(d.manquants, ['lait']);
  assert.equal(declarationConforme(d), false);
});

test('MOD-10 : sous-recette traversée recursivement (pâte feuilletée → gluten + lait)', () => {
  /** @type {VersionRecette} */
  const tarte = {
    id: 'v-tarte', familleId: 'RF-TAR',
    ingredients: [
      { subVersionId: 'v-pfe', q: 1, u: 'kg' },
      { articleId: 'MP-AMA', q: 0.2, u: 'kg' },
    ],
  };
  /** @type {VersionRecette} */
  const pfe = {
    id: 'v-pfe', familleId: 'RF-PFE',
    ingredients: [{ articleId: 'MP-FAR', q: 1, u: 'kg' }, { articleId: 'MP-BEU', q: 0.5, u: 'kg' }],
  };
  const { derives } = allergenesDerives('v-tarte', [pfe, tarte], articles);
  // gluten/lait viennent de la sous-recette, fruits_coque de la matière directe.
  assert.deepEqual(derives, ['fruits_coque', 'gluten', 'lait']);
});

test('MOD-10 : anti-cycle — une sous-recette qui se référence ne boucle pas', () => {
  /** @type {VersionRecette} */
  const a = { id: 'v-a', familleId: 'RF-A', ingredients: [{ subVersionId: 'v-b' }] };
  /** @type {VersionRecette} */
  const b = { id: 'v-b', familleId: 'RF-B', ingredients: [{ subVersionId: 'v-a' }] };
  const { derives } = allergenesDerives('v-a', [a, b], articles);
  assert.deepEqual(derives, []); // aucune matière atteinte, mais surtout : pas de stack overflow
});

test('MOD-10 : profondeur bornée à 3 générations comme la RPC serveur', () => {
  /** @type {VersionRecette} */
  const v4 = { id: 'v4', familleId: 'F4', ingredients: [{ articleId: 'MP-OEU' }] };
  /** @type {VersionRecette} */
  const v3 = { id: 'v3', familleId: 'F3', ingredients: [{ subVersionId: 'v4' }] };
  /** @type {VersionRecette} */
  const v2 = { id: 'v2', familleId: 'F2', ingredients: [{ subVersionId: 'v3' }] };
  /** @type {VersionRecette} */
  const v1 = { id: 'v1', familleId: 'F1', ingredients: [{ subVersionId: 'v2' }] };
  /** @type {VersionRecette} */
  const v0 = { id: 'v0', familleId: 'F0', ingredients: [{ subVersionId: 'v1' }] };
  const { derives } = allergenesDerives('v0', [v0, v1, v2, v3, v4], articles);
  assert.deepEqual(derives, [], 'la 4e génération est hors limite, comme côté serveur');
});

test('MOD-10 : une version inconnue ne casse rien (recette non renseignée)', () => {
  const { derives, articlesLus } = allergenesDerives('v-inexistante', [croissant], articles);
  assert.deepEqual(derives, []);
  assert.deepEqual(articlesLus, []);
});

test('MOD-10 : les traces ne descendent pas dans le produit', () => {
  const avecTrace = [
    { code: 'MP-FAR', nom: 'Farine', niveau: 'matiere', allergenes: ['gluten'], traces: ['sesame'] },
  ];
  /** @type {VersionRecette} */
  const v = { id: 'v', familleId: 'F', ingredients: [{ articleId: 'MP-FAR' }] };
  const { derives } = allergenesDerives('v', [v], avecTrace);
  assert.deepEqual(derives, ['gluten'], 'une trace n’est pas un ingrédient déclaré');
});
