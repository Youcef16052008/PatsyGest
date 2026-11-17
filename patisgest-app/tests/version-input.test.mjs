import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseVersionInput } from '../src/lib/version-input.ts';

const FAM = '7f9eba56-5473-4281-b7e3-855859a04412';
const ART = '8b36f40d-f0ab-40ae-9014-6f38da463665';
const SUB = '6ab9eba2-7f1d-469d-a87c-814880c2bf41';

const form = (pairs) => {
  const fd = new FormData();
  for (const [k, v] of pairs) fd.append(k, v);
  return fd;
};

const base = [
  ['familleId', FAM], ['rendementQte', '12'], ['rendementUnite', 'pcs'], ['lineCount', '1'],
  ['line0_kind', 'article'], ['line0_ref', ART], ['line0_q', '1.2'], ['line0_u', 'kg'], ['line0_parage', '2'],
];

test('version : ligne article avec parage', () => {
  const out = parseVersionInput(form(base));
  assert.equal(out.lignes.length, 1);
  assert.equal(out.lignes[0].kind, 'article');
  assert.equal(out.lignes[0].q, 1.2);
  assert.equal(out.lignes[0].parage, 2);
  assert.equal(out.rendementUnite, 'pcs');
  assert.equal(out.active, false);
});

test('version : ligne sous-recette (version figée)', () => {
  const out = parseVersionInput(form([
    ['familleId', FAM], ['rendementQte', '40'], ['rendementUnite', 'pcs'], ['lineCount', '1'],
    ['line0_kind', 'sub'], ['line0_ref', SUB], ['line0_q', '5'], ['line0_u', 'kg'],
  ]));
  assert.equal(out.lignes[0].kind, 'sub');
  assert.equal(out.lignes[0].subVersionId, SUB);
});

test('version : mélange article + sous-recette + case activée', () => {
  const out = parseVersionInput(form([
    ['familleId', FAM], ['rendementQte', '10'], ['rendementUnite', 'kg'], ['lineCount', '2'],
    ['line0_kind', 'article'], ['line0_ref', ART], ['line0_q', '900'], ['line0_u', 'g'], ['line0_parage', '0'],
    ['line1_kind', 'sub'], ['line1_ref', SUB], ['line1_q', '2'], ['line1_u', 'kg'],
    ['active', 'on'],
  ]));
  assert.equal(out.lignes.length, 2);
  assert.equal(out.lignes[1].kind, 'sub');
  assert.equal(out.active, true);
});

test('version : refuse un uuid invalide', () => {
  assert.throws(() => parseVersionInput(form([
    ['familleId', 'pas-uuid'], ['rendementQte', '12'], ['rendementUnite', 'pcs'], ['lineCount', '1'],
    ['line0_kind', 'article'], ['line0_ref', ART], ['line0_q', '1'], ['line0_u', 'kg'],
  ])), /identifiant/i);
});

test('version : refuse une quantité nulle et un rendement nul', () => {
  assert.throws(() => parseVersionInput(form([
    ['familleId', FAM], ['rendementQte', '12'], ['rendementUnite', 'pcs'], ['lineCount', '1'],
    ['line0_kind', 'article'], ['line0_ref', ART], ['line0_q', '0'], ['line0_u', 'kg'],
  ])));
  assert.throws(() => parseVersionInput(form([
    ['familleId', FAM], ['rendementQte', '0'], ['rendementUnite', 'pcs'], ['lineCount', '1'],
    ['line0_kind', 'article'], ['line0_ref', ART], ['line0_q', '1'], ['line0_u', 'kg'],
  ])));
});

test('version : refuse un type de ligne inconnu', () => {
  assert.throws(() => parseVersionInput(form([
    ['familleId', FAM], ['rendementQte', '12'], ['rendementUnite', 'pcs'], ['lineCount', '1'],
    ['line0_kind', 'magic'], ['line0_ref', ART], ['line0_q', '1'], ['line0_u', 'kg'],
  ])), /type invalide/i);
});
