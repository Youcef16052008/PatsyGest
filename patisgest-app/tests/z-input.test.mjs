import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseZCsv } from '../src/lib/z-input.ts';

test('Z : format strict valide, totaux arrondis au centime', () => {
  const out = parseZCsv('PF-ECL;2;320.00\nPF-MIL;1;260,00');
  assert.equal(out.lines.length, 2);
  assert.equal(out.totalHT, 900);
  assert.equal(out.lines[1].priceHT, 260);
});

test('Z : lignes vides ignorées, retours CRLF acceptés', () => {
  const out = parseZCsv('PF-ECL;1;320\r\n\r\nPF-MIL;1;260\n\n');
  assert.equal(out.lines.length, 2);
  assert.equal(out.totalHT, 580);
});

test('Z : refuse un en-tête ou une ligne sans séparateur', () => {
  assert.throws(() => parseZCsv('code;quantite;prix\nPF-ECL;1;320'), /Ligne 1 invalide/);
  assert.throws(() => parseZCsv('PF-ECL;1;320\nligne sans separateur'), /Ligne 2 invalide/);
});

test('Z : refuse quantité nulle ou décimales trop longues', () => {
  assert.throws(() => parseZCsv('PF-ECL;0;320'), /Ligne 1 invalide|Quantité/);
  assert.throws(() => parseZCsv('PF-ECL;1.12345;320'), /Ligne 1 invalide/);
  assert.throws(() => parseZCsv('PF-ECL;1;320.123'), /Ligne 1 invalide/);
});

test('Z : refuse un code produit malformé', () => {
  assert.throws(() => parseZCsv('PF ECL;1;320'), /Ligne 1 invalide/);
  assert.throws(() => parseZCsv(';1;320'), /Ligne 1 invalide/);
});

test('Z : refuse plus de 100 lignes et données vides', () => {
  const many = Array.from({ length: 101 }, (_, i) => `PF-ECL;1;${100 + i}`).join('\n');
  assert.throws(() => parseZCsv(many), /100/);
  assert.throws(() => parseZCsv('   \n  '), /Données Z requises|lignes/);
});
