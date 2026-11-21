import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cellule, versCsv, nomFichier, tableExportable, CSV_BOM, CSV_SEPARATEUR,
} from '../src/lib/csv.ts';

/**
 * MOD-15 — export CSV (US-15.2). Les cas couvrent les pièges qui cassent
 * réellement le fichier chez un comptable algérien sur Excel FR.
 */

test('CSV : séparateur point-virgule attendu par Excel FR', () => {
  assert.equal(CSV_SEPARATEUR, ';');
  assert.equal(versCsv(['a', 'b'], [[1, 2]]).includes('a;b'), true);
});

test('CSV : BOM UTF-8 en tête (sinon « é » devient « Ã© »)', () => {
  const csv = versCsv(['Nom'], [['Crème pâtissière']]);
  assert.equal(csv.startsWith(CSV_BOM), true);
  assert.equal(csv.includes('Crème pâtissière'), true);
});

test('CSV : virgule décimale, sans séparateur de milliers', () => {
  assert.equal(cellule(12.5), '12,5');
  assert.equal(cellule(1000), '1000');
  assert.equal(cellule(1234.567), '1234,567');
  assert.equal(cellule(-0.05), '-0,05');
});

test('CSV : nombres non finis → cellule vide, jamais NaN', () => {
  assert.equal(cellule(Number.NaN), '');
  assert.equal(cellule(Number.POSITIVE_INFINITY), '');
  assert.equal(cellule(null), '');
  assert.equal(cellule(undefined), '');
});

test('CSV : échappement RFC 4180 (séparateur, guillemets, saut de ligne)', () => {
  assert.equal(cellule('Mme Belkacem; étage 2'), '"Mme Belkacem; étage 2"');
  assert.equal(cellule('il a dit "oui"'), '"il a dit ""oui"""');
  assert.equal(cellule('ligne1\nligne2'), '"ligne1\nligne2"');
});

test('CSV : injection de formule neutralisée (OWASP)', () => {
  // Un nom saisi au comptoir ne doit pas s'exécuter dans Excel.
  assert.equal(cellule('=1+1'), "'=1+1");
  assert.equal(cellule('+33600000000'), "'+33600000000");
  assert.equal(cellule('-2+3'), "'-2+3");
  assert.equal(cellule('@SUM(A1)'), "'@SUM(A1)");
  assert.equal(cellule('\tcmd'), "'\tcmd");
  // Une formule contenant un séparateur est aussi échappée.
  assert.equal(cellule('=A1;B1'), '"\'=A1;B1"');
  assert.equal(cellule('  =1+1'), "'  =1+1");
  const bom = String.fromCharCode(0xfeff);
  assert.equal(cellule(`${bom}@SUM(A1)`), `'${bom}@SUM(A1)`);
});

test('CSV : un montant négatif reste un nombre, pas une formule', () => {
  // -42 est un nombre JS : il ne passe pas par echapper(), donc pas d'apostrophe.
  assert.equal(cellule(-42), '-42');
  // Mais la chaîne "-42" saisie en texte est neutralisée.
  assert.equal(cellule('-42'), "'-42");
});

test('CSV : tableaux et JSON sont reconstruisibles dans une cellule', () => {
  assert.equal(cellule(['gluten', 'lait']), '"[""gluten"",""lait""]"');
  assert.equal(cellule([]), '[]');
  assert.equal(cellule({ lignes: [{ nom: 'Tarte; citron', qte: 2 }] }), '"{""lignes"":[{""nom"":""Tarte; citron"",""qte"":2}]}"');
  const csv = versCsv(['lignes'], [[[{ nom: 'Cake', qte: 3 }]]]);
  assert.equal(csv.includes('[object Object]'), false);
  const cell = csv.slice(CSV_BOM.length).split('\r\n')[1];
  assert.deepEqual(JSON.parse(cell.slice(1, -1).replace(/""/g, '"')), [{ nom: 'Cake', qte: 3 }]);
  const canonique = cellule({ z: 1, a: { y: 2, b: 3 } });
  assert.equal(canonique, '"{""a"":{""b"":3,""y"":2},""z"":1}"');
  assert.equal(cellule({ a: { b: 3, y: 2 }, z: 1 }), canonique);
});

test('CSV : dates en ISO, date invalide → vide', () => {
  assert.equal(cellule(new Date('2026-11-17T00:00:00.000Z')), '2026-11-17T00:00:00.000Z');
  assert.equal(cellule(new Date('pas une date')), '');
});

test('CSV : booléens en oui/non, CRLF en fin de ligne', () => {
  assert.equal(cellule(true), 'oui');
  assert.equal(cellule(false), 'non');
  const csv = versCsv(['a'], [[1], [2]]);
  assert.equal(csv.includes('\r\n1\r\n2\r\n'), true);
});

test('CSV : nom de fichier horodaté, sans accent ni espace', () => {
  const d = new Date('2026-11-17T10:00:00.000Z');
  assert.equal(nomFichier('ventes', d), 'patisgest-ventes-2026-11-17.csv');
  assert.equal(nomFichier('Clôtures & pertes', d), 'patisgest-clotures-pertes-2026-11-17.csv');
  assert.equal(nomFichier('', d), 'patisgest-export-2026-11-17.csv');
});

test('CSV : les tables de coût ne sont pas exportables par un vendeur', () => {
  assert.equal(tableExportable('ventes', false), true);
  assert.equal(tableExportable('lots', false), true);
  assert.equal(tableExportable('recettes', false), false);
  assert.equal(tableExportable('couts', false), false);
  assert.equal(tableExportable('couts', true), true);
  assert.equal(tableExportable('table-inconnue', true), false);
});
