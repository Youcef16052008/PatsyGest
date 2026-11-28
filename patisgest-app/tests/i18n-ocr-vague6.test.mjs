import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI_DICT, translateUI } from '../src/lib/i18n.ts';

const ARABE = /[\u0600-\u06FF]/u;
const LATIN = /[A-Za-z]/;
const catalogue = JSON.parse(readFileSync(new URL('../src/lib/ui-catalog-fr.json', import.meta.url), 'utf8'));

const CLES_STATIQUES = [
  'invoiceOcrReading',
  'invoiceOcrRetry',
  'invoiceOcrEmpty',
  'invoiceOcrError',
  'invoiceOcrTooLarge',
  'invoiceOcrBadFormat',
  'invoiceOcrOffline',
];

test('VAGUE 6 : les nouveaux libellés OCR sont traduits FR/AR et catalogués', () => {
  assert.equal(new Set(catalogue).size, catalogue.length, 'catalogue FR avec doublons');
  for (const cle of CLES_STATIQUES) {
    const fr = UI_DICT.fr[cle];
    const ar = UI_DICT.ar[cle];
    assert.ok(typeof fr === 'string' && fr.length > 0, `libellé FR absent : ${cle}`);
    assert.ok(typeof ar === 'string' && ar.length > 0, `libellé AR absent : ${cle}`);
    assert.notEqual(ar, fr, `libellé non traduit : ${cle}`);
    assert.match(ar, ARABE, `traduction sans arabe : ${cle}`);
    assert.ok(!LATIN.test(ar), `résidu latin dans la traduction : ${cle} → ${ar}`);
    assert.ok(catalogue.includes(fr), `chaîne absente du catalogue FR : ${fr}`);
    assert.equal(translateUI(fr, 'ar'), ar, `dictionnaire B.2 divergent : ${fr}`);
  }
});

test('VAGUE 6 : le message dynamique de succès garde un gabarit sans latin côté AR', () => {
  assert.match(UI_DICT.fr.invoiceOcrSuccess, /\{n\}/u);
  assert.match(UI_DICT.ar.invoiceOcrSuccess, /\{عدد\}/u);
  assert.match(UI_DICT.ar.invoiceOcrSuccess, ARABE);
  assert.ok(!LATIN.test(UI_DICT.ar.invoiceOcrSuccess), 'gabarit AR avec lettre latine');
});
