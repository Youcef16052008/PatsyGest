import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArticleInput, parseReceptionInput } from '../src/lib/stock-input.ts';

const articleForm = (overrides = {}) => {
  const fd = new FormData();
  const base = { code: 'PF-010', nom: 'Tarte citron', niveau: 'produit', unite: 'pcs', seuil: '5', pv_ht: '450.50', tva: '19', allergenes: 'gluten, œufs, Gluten', traces: '' };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
};

test('parseArticleInput accepts a valid article and normalizes allergens', () => {
  const input = parseArticleInput(articleForm());
  assert.equal(input.code, 'PF-010');
  assert.equal(input.niveau, 'produit');
  assert.equal(input.seuil, 5);
  assert.equal(input.pv_ht, 450.5);
  assert.equal(input.tva, 19);
  assert.deepEqual(input.allergenes, ['gluten', 'œufs']); // dédoublonné + minuscules
  assert.deepEqual(input.traces, []);
});

test('parseArticleInput rejects invalid articles', () => {
  assert.throws(() => parseArticleInput(articleForm({ code: '' })), /Code article/);
  assert.throws(() => parseArticleInput(articleForm({ code: 'x'.repeat(41) })), /Code article/);
  assert.throws(() => parseArticleInput(articleForm({ niveau: 'autre' })), /Niveau/);
  assert.throws(() => parseArticleInput(articleForm({ tva: '101' })), /TVA/);
  assert.throws(() => parseArticleInput(articleForm({ pv_ht: '-1' })), /Prix de vente/);
  assert.throws(() => parseArticleInput(articleForm({ seuil: 'abc' })), /Seuil/);
  assert.throws(() => parseArticleInput(articleForm({ allergenes: Array(11).fill('a').join(', ') })), /10 entrées/);
});

const receptionForm = (overrides = {}) => {
  const fd = new FormData();
  const base = {
    articleId: '11111111-1111-4111-8111-111111111111',
    siteId: '22222222-2222-4222-8222-222222222222',
    numero: 'LOT-900', qte: '12.5', pu: '90', dlc: '2027-06-01', fournisseurId: '', ref: 'BL-42',
  };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
};

test('parseReceptionInput accepts a valid reception and optional fields', () => {
  const input = parseReceptionInput(receptionForm());
  assert.equal(input.numero, 'LOT-900');
  assert.equal(input.qte, 12.5);
  assert.equal(input.pu, 90);
  assert.equal(input.dlc, '2027-06-01');
  assert.equal(input.fournisseurId, null);
  assert.equal(input.ref, 'BL-42');
  const empty = parseReceptionInput(receptionForm({ dlc: '', ref: '' }));
  assert.equal(empty.dlc, null);
  assert.equal(empty.ref, null);
});

test('parseReceptionInput rejects invalid receptions', () => {
  assert.throws(() => parseReceptionInput(receptionForm({ articleId: 'pas-un-uuid' })), /Article/);
  assert.throws(() => parseReceptionInput(receptionForm({ numero: '' })), /Numéro de lot/);
  assert.throws(() => parseReceptionInput(receptionForm({ qte: '0' })), /Quantité/);
  assert.throws(() => parseReceptionInput(receptionForm({ qte: '-3' })), /Quantité/);
  assert.throws(() => parseReceptionInput(receptionForm({ pu: '-1' })), /Prix unitaire/);
  assert.throws(() => parseReceptionInput(receptionForm({ dlc: '01-06-2027' })), /DLC/);
  assert.throws(() => parseReceptionInput(receptionForm({ dlc: '2027-13-45' })), /DLC/);
  assert.throws(() => parseReceptionInput(receptionForm({ fournisseurId: 'invalide' })), /Fournisseur/);
});
