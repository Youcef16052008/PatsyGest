import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { recognizeInvoiceImage } from '../src/lib/ocr-server.ts';
import { parseSupplierInvoiceText } from '../src/lib/invoice-photo-parser.ts';

/*
 * VAGUE 6 — preuve OCR réelle hors ligne : Tesseract.js lit la fixture avec les
 * modèles figés, puis le parseur OCR ignore l'en-tête et le total. Aucun mock,
 * aucun PGlite, aucun appel réseau : c'est le même chemin que /api/invoice-ocr.
 */
test('VAGUE 6 : OCR serveur lit la facture et propose exactement les 4 lignes produit', { timeout: 90_000 }, async () => {
  const image = readFileSync(new URL('./fixtures/facture-ocr.png', import.meta.url));
  const resultat = await recognizeInvoiceImage(image);

  assert.equal(resultat.offline, true);
  assert.equal(resultat.engine, 'tesseract.js');
  assert.deepEqual(resultat.languages, ['fra', 'eng']);
  assert.ok(resultat.confidence > 0, `confiance OCR nulle : ${resultat.confidence}`);
  for (const attendu of [
    /FACTURE FOURNISSEUR/i,
    /Farine T55 25 kg 95 DA/i,
    /Beurre de tourage 10 kg 950 DA/i,
    /Sucre semoule 15 kg 110 DA/i,
    /Amandes 5 kg 1900 DA/i,
    /Total 4200 DA/i,
  ]) {
    assert.match(resultat.text, attendu, `texte OCR incomplet : ${attendu}`);
  }

  const catalogue = [
    { id: 'farine', nom: 'Farine T55', unite: 'kg' },
    { id: 'beurre', nom: 'Beurre de tourage', unite: 'kg' },
    { id: 'sucre', nom: 'Sucre semoule', unite: 'kg' },
    { id: 'amandes', nom: 'Amandes', unite: 'kg' },
  ];
  const lignes = parseSupplierInvoiceText(resultat.text, catalogue, { ocr: true });
  assert.equal(lignes.length, 4, `en-tête/total non filtrés : ${lignes.map((l) => l.rawText).join(' | ')}`);
  assert.deepEqual(lignes.map((l) => l.qte), [25, 10, 15, 5]);
  assert.deepEqual(lignes.map((l) => l.puDa), [95, 950, 110, 1900]);
  assert.ok(lignes.every((l) => l.matched), 'rapprochement catalogue OCR incomplet');
});
