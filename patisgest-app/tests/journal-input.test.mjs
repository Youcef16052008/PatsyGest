import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCakeActionInput,
  parseCakeInput,
  parseCleaningInput,
  parseClosingInput,
  parseNcInput,
  parseNcUpdateInput,
  parseTaskInput,
  parseTaskToggleInput,
  parseTemperatureInput,
} from '../src/lib/journal-input.ts';

const A1 = '8c7a59fd-bbf2-49bc-a264-81eb85f8a31a';
const A2 = 'e6870c98-fe3b-4073-9191-4222c78eef08';
const SITE = '22222222-2222-4222-8222-222222222201';
const TODAY = new Date().toISOString().slice(0, 10);

const form = (pairs) => {
  const fd = new FormData();
  for (const [k, v] of pairs) fd.append(k, v);
  return fd;
};

test('clôture : ligne six flux valide', () => {
  const out = parseClosingInput(form([
    ['date', TODAY], ['siteId', SITE], ['revise', 'true'], ['lineCount', '1'],
    ['line0_article', A1], ['line0_produit', '10'], ['line0_vendu', '8'],
    ['line0_reporte', '1'], ['line0_jete', '0'], ['line0_casse', '1'], ['line0_offert', '0'],
  ]));
  assert.equal(out.revise, true);
  assert.equal(out.lignes.length, 1);
  assert.equal(out.lignes[0].produit, 10);
  assert.equal(out.lignes[0].vendu, 8);
  assert.equal(out.lignes[0].casse, 1);
});

test('clôture : refuse un produit en double', () => {
  assert.throws(() => parseClosingInput(form([
    ['date', TODAY], ['siteId', SITE], ['lineCount', '2'],
    ['line0_article', A1], ['line0_produit', '1'], ['line0_vendu', '1'], ['line0_reporte', '0'],
    ['line0_jete', '0'], ['line0_casse', '0'], ['line0_offert', '0'],
    ['line1_article', A1], ['line1_produit', '1'], ['line1_vendu', '1'], ['line1_reporte', '0'],
    ['line1_jete', '0'], ['line1_casse', '0'], ['line1_offert', '0'],
  ])), /double/i);
});

test('clôture : refuse une date future', () => {
  assert.throws(() => parseClosingInput(form([
    ['date', '2199-01-01'], ['siteId', SITE], ['lineCount', '1'],
    ['line0_article', A1], ['line0_produit', '1'], ['line0_vendu', '0'], ['line0_reporte', '0'],
    ['line0_jete', '0'], ['line0_casse', '0'], ['line0_offert', '0'],
  ])), /futur/i);
});

test('clôture : refuse plus de quatre décimales', () => {
  assert.throws(() => parseClosingInput(form([
    ['date', TODAY], ['siteId', SITE], ['lineCount', '1'],
    ['line0_article', A1], ['line0_produit', '1.12345'], ['line0_vendu', '0'], ['line0_reporte', '0'],
    ['line0_jete', '0'], ['line0_casse', '0'], ['line0_offert', '0'],
  ])), /décimales/i);
});

test('qualité : relevé de température valide, agent optionnel', () => {
  const out = parseTemperatureInput(form([
    ['date', TODAY], ['frigoId', 'F1'], ['frigoNom', 'Frigo labo'], ['seuilMax', '4'], ['temperature', '2.5'],
  ]));
  assert.equal(out.temperature, 2.5);
  assert.equal(out.agent, null);
});

test('qualité : nettoyage avec fait coché', () => {
  const out = parseCleaningInput(form([['date', TODAY], ['zone', 'Four'], ['fait', 'on']]));
  assert.equal(out.fait, true);
});

test('qualité : NC valide, lot et action optionnels', () => {
  const out = parseNcInput(form([['date', TODAY], ['type', 'T°'], ['description', 'Frigo hors seuil']]));
  assert.equal(out.lotNumero, null);
  assert.equal(out.action, null);
});

test('qualité : refuse un statut NC invalide', () => {
  assert.throws(() => parseNcUpdateInput(form([['id', A1], ['statut', 'bizarre'], ['action', 'x']])), /statut/i);
});

test('qualité : accepte clôture et réouverture de NC', () => {
  const close = parseNcUpdateInput(form([['id', A1], ['statut', 'cloturee'], ['action', 'Réapprovisionné']]));
  assert.equal(close.statut, 'cloturee');
  const reopen = parseNcUpdateInput(form([['id', A1], ['statut', 'ouverte'], ['action', '']]));
  assert.equal(reopen.action, null);
});

test('planning : tâche valide, OF optionnel', () => {
  const out = parseTaskInput(form([
    ['date', '2026-12-01'], ['tache', 'Laminage'], ['dureeMin', '30'], ['responsable', 'Labo'],
  ]));
  assert.equal(out.ofNumero, null);
  assert.equal(out.dureeMin, 30);
});

test('planning : refuse une durée négative', () => {
  assert.throws(() => parseTaskInput(form([
    ['date', '2026-12-01'], ['tache', 'X'], ['dureeMin', '-5'],
  ])));
});

test('planning : bascule avec uuid valide', () => {
  const out = parseTaskToggleInput(form([['id', A2], ['fait', 'true']]));
  assert.equal(out.id, A2);
  assert.equal(out.fait, true);
});

test('cakes : devis valide avec options', () => {
  const out = parseCakeInput(form([
    ['clientNom', 'Sonia'], ['telephone', '0661000000'], ['dateEvent', '2026-12-15'],
    ['nbParts', '30'], ['prixHt', '12000'], ['optionCount', '1'],
    ['opt0_name', 'Pâte imprimée'], ['opt0_cout', '1500'], ['opt0_minutes', '45'],
    ['notes', 'Sans noisettes'], ['cgv', 'on'],
  ]));
  assert.equal(out.options.length, 1);
  assert.equal(out.cgv, true);
  assert.equal(out.prixHt, 12000);
});

test('cakes : refuse un prix nul', () => {
  assert.throws(() => parseCakeInput(form([
    ['clientNom', 'X'], ['dateEvent', '2026-12-15'], ['nbParts', '10'], ['prixHt', '0'], ['optionCount', '0'],
  ])));
});

test('cakes : action payer exige un montant, confirme non', () => {
  assert.throws(() => parseCakeActionInput(form([['id', A1], ['transition', 'payer'], ['montant', '']])));
  const ok = parseCakeActionInput(form([['id', A1], ['transition', 'payer'], ['montant', '3000']]));
  assert.equal(ok.montant, 3000);
  const confirme = parseCakeActionInput(form([['id', A1], ['transition', 'confirme'], ['montant', '']]));
  assert.equal(confirme.montant, null);
});
