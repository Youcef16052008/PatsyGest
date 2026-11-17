import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArticleInput, parseReceptionInput, parseSaleInput, parseOfCreateInput, parseOfFinishInput, parseTransferInput } from '../src/lib/stock-input.ts';

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

const saleForm = (overrides = {}) => {
  const fd = new FormData();
  const base = { articleId: '8c7a59fd-bbf2-49bc-a264-81eb85f8a31a', siteId: '22222222-2222-4222-8222-222222222202', qte: '2' };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
};

test('parseSaleInput accepts a valid sale', () => {
  const input = parseSaleInput(saleForm());
  assert.equal(input.articleId, '8c7a59fd-bbf2-49bc-a264-81eb85f8a31a');
  assert.equal(input.siteId, '22222222-2222-4222-8222-222222222202');
  assert.equal(input.qte, 2);
  assert.equal(parseSaleInput(saleForm({ qte: '0.5' })).qte, 0.5);
});

test('parseSaleInput rejects invalid sales', () => {
  assert.throws(() => parseSaleInput(saleForm({ articleId: 'x' })), /Article/);
  assert.throws(() => parseSaleInput(saleForm({ siteId: '' })), /Site/);
  assert.throws(() => parseSaleInput(saleForm({ qte: '0' })), /Quantité/);
  assert.throws(() => parseSaleInput(saleForm({ qte: '-2' })), /Quantité/);
  assert.throws(() => parseSaleInput(saleForm({ qte: 'abc' })), /Quantité/);
});

const tomorrow = () => {
  const d = new Date(Date.now() + 86400000);
  return d.toISOString().slice(0, 10);
};

const ofCreateForm = (overrides = {}) => {
  const fd = new FormData();
  const base = { versionId: '6ab9eba2-7f1d-469d-a87c-814880c2bf41', siteId: '22222222-2222-4222-8222-222222222201', qtePrevue: '12', datePrevue: tomorrow() };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
};

test('parseOfCreateInput accepts a valid OF', () => {
  const input = parseOfCreateInput(ofCreateForm());
  assert.equal(input.versionId, '6ab9eba2-7f1d-469d-a87c-814880c2bf41');
  assert.equal(input.qtePrevue, 12);
  assert.equal(input.datePrevue, tomorrow());
  assert.throws(() => parseOfCreateInput(ofCreateForm({ versionId: 'nope' })), /Version/);
  assert.throws(() => parseOfCreateInput(ofCreateForm({ qtePrevue: '0' })), /Quantité/);
  assert.throws(() => parseOfCreateInput(ofCreateForm({ datePrevue: '2020-01-01' })), /Date/);
  assert.throws(() => parseOfCreateInput(ofCreateForm({ datePrevue: 'pas-un-date' })), /Date/);
});

const ofFinishForm = (overrides = {}) => {
  const fd = new FormData();
  const base = { ofId: 'ee8bb422-1a6d-40d4-b3d6-a33cf3a4da2f', qte: '12', numeroLot: 'LOT-101', dlc: tomorrow() };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
};

test('parseOfFinishInput accepts a valid closure and rejects bad ones', () => {
  const input = parseOfFinishInput(ofFinishForm());
  assert.equal(input.qte, 12);
  assert.equal(input.numeroLot, 'LOT-101');
  assert.throws(() => parseOfFinishInput(ofFinishForm({ ofId: '' })), /OF/);
  assert.throws(() => parseOfFinishInput(ofFinishForm({ numeroLot: ' ' })), /N° de lot/);
  assert.throws(() => parseOfFinishInput(ofFinishForm({ dlc: '2020-01-01' })), /DLC/);
});

const transferForm = (overrides = {}) => {
  const fd = new FormData();
  const base = { articleId: '8b36f40d-f0ab-40ae-9014-6f38da463665', fromSiteId: '22222222-2222-4222-8222-222222222201', toSiteId: '22222222-2222-4222-8222-222222222202', qte: '5', motif: 'Réassort' };
  for (const [k, v] of Object.entries({ ...base, ...overrides })) fd.set(k, v);
  return fd;
};

test('parseTransferInput accepts a valid transfer', () => {
  const input = parseTransferInput(transferForm());
  assert.equal(input.qte, 5);
  assert.equal(input.motif, 'Réassort');
  assert.equal(parseTransferInput(transferForm({ motif: '' })).motif, null);
});

test('parseTransferInput rejects invalid transfers', () => {
  assert.throws(() => parseTransferInput(transferForm({ toSiteId: '22222222-2222-4222-8222-222222222201' })), /différents/);
  assert.throws(() => parseTransferInput(transferForm({ qte: '0' })), /Quantité/);
  assert.throws(() => parseTransferInput(transferForm({ articleId: 'x' })), /Article/);
  assert.throws(() => parseTransferInput(transferForm({ motif: 'x'.repeat(121) })), /Motif/);
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
