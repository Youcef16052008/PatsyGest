import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommandeInput, parseReceptionLinesInput } from '../src/lib/purchase-input.ts';

const FAR = '8b36f40d-f0ab-40ae-9014-6f38da463665';
const SUC = 'a4a0be2f-fe2a-424a-b30c-76607324fba6';
const FOUR = '44444444-4444-4444-8444-444444444401';
const SITE = '22222222-2222-4222-8222-222222222201';
const BC = '99999999-8888-4777-8666-555555555555';
const TODAY = new Date().toISOString().slice(0, 10);

const form = (pairs) => {
  const fd = new FormData();
  for (const [k, v] of pairs) fd.append(k, v);
  return fd;
};

test('commande : accepte un bon multi-lignes', () => {
  const out = parseCommandeInput(form([
    ['fournisseurId', FOUR], ['lineCount', '2'],
    ['line0_article', FAR], ['line0_qte', '10'], ['line0_pu', '90'],
    ['line1_article', SUC], ['line1_qte', '5'], ['line1_pu', '115'],
  ]));
  assert.equal(out.lignes.length, 2);
  assert.equal(out.lignes[1].articleId, SUC);
  assert.equal(out.lignes[1].qte, 5);
  assert.equal(out.lignes[1].pu, 115);
  assert.equal(out.notes, null);
});

test('commande : refuse une quantité nulle', () => {
  assert.throws(() => parseCommandeInput(form([
    ['fournisseurId', FOUR], ['lineCount', '1'],
    ['line0_article', FAR], ['line0_qte', '0'], ['line0_pu', '90'],
  ])));
});

test('commande : refuse un fournisseur sans uuid', () => {
  assert.throws(() => parseCommandeInput(form([
    ['fournisseurId', 'pas-uuid'], ['lineCount', '1'],
    ['line0_article', FAR], ['line0_qte', '1'], ['line0_pu', '1'],
  ])), /identifiant/i);
});

test('réception : accepte des lignes datées à partir d’aujourd’hui', () => {
  const out = parseReceptionLinesInput(form([
    ['commandeId', BC], ['siteId', SITE], ['receptionCount', '2'],
    ['rec0_index', '0'], ['rec0_qte', '4'], ['rec0_numero', 'LOT-A'], ['rec0_dlc', TODAY],
    ['rec1_index', '1'], ['rec1_qte', '5'], ['rec1_numero', 'LOT-B'], ['rec1_dlc', '2026-12-31'],
  ]));
  assert.equal(out.receptions.length, 2);
  assert.equal(out.receptions[0].index, 0);
});

test('réception : refuse une DLC passée', () => {
  assert.throws(() => parseReceptionLinesInput(form([
    ['commandeId', BC], ['siteId', SITE], ['receptionCount', '1'],
    ['rec0_index', '0'], ['rec0_qte', '1'], ['rec0_numero', 'LOT'], ['rec0_dlc', '2020-01-01'],
  ])), /DLC/i);
});

test('réception : refuse un index négatif', () => {
  assert.throws(() => parseReceptionLinesInput(form([
    ['commandeId', BC], ['siteId', SITE], ['receptionCount', '1'],
    ['rec0_index', '-1'], ['rec0_qte', '1'], ['rec0_numero', 'LOT'], ['rec0_dlc', TODAY],
  ])));
});
