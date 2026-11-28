// Parcours 2/4 — Stock : créer un article puis réceptionner un lot.
//
// Depuis la simplification, l'écran propose deux gestes en clair :
//   • « Ça vient d'arriver » (réception d'un lot)
//   • « Nouvel article »
// Les champs rares (code, seuil, TVA, n° de bon, DLC) sont derrière
// « Plus d'options » : le parcours les ouvre explicitement, ce qui vérifie du
// même coup que rien n'a été perdu en repliant l'écran.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ouvrirNavigateur, connecter } from './helpers.mjs';

test('parcours stock : créer un article et réceptionner un lot', async () => {
  const browser = await ouvrirNavigateur();
  try {
    const page = await browser.newPage();
    await connecter(page);
    await page.goto(`${BASE}/stocks`, { waitUntil: 'networkidle' });

    const code = `E2E${Date.now().toString().slice(-6)}`;

    // 1. « Nouvel article » — nom, type, unité, prix visibles ; le reste replié.
    await page.getByRole('button', { name: /Nouvel article/ }).first().click();
    await page.locator('input[name=nom]').fill('Éclair E2E');
    await page.locator('select[name=niveau]').selectOption('produit');
    await page.locator('select[name=unite]').selectOption('pcs');
    await page.locator('input[name=prix_ttc]').fill('250');
    await page.getByRole('button', { name: /Plus d’options \(code/ }).click();
    await page.locator('input[name=code]').fill(code);
    await page.locator('input[name=seuil]').fill('1');
    await page.locator('select[name=tva]').selectOption('19');
    await page.getByRole('button', { name: 'Créer l’article' }).click();
    await page.locator('text=Article « Éclair E2E » créé').first().waitFor({ timeout: 30_000 });

    // 2. « Ça vient d'arriver » — article, quantité, prix d'achat, site.
    await page.getByRole('button', { name: /Ça vient d’arriver/ }).first().click();
    const valeurArticle = await page
      .locator('select[name=articleId] option', { hasText: 'Éclair E2E' })
      .first()
      .getAttribute('value');
    await page.locator('select[name=articleId]').selectOption(valeurArticle);
    await page.locator('input[name=qte]').fill('12');
    await page.locator('select[name=siteId]').selectOption({ index: 0 });
    await page.locator('input[name=pu]').fill('80');
    // Le n° de bon est pré-rempli : sans y toucher, la réception doit passer.
    await page.getByRole('button', { name: /Plus d’options \(n° de bon/ }).click();
    await page.locator('input[name=numero]').fill(`L-E2E-${code}`);
    await page.locator('input[name=dlc]').fill('2027-02-01');
    await page.getByRole('button', { name: 'C’est entré en stock' }).click();
    await page.locator('text=/Lot L-E2E-/').first().waitFor({ timeout: 30_000 });
    const texte = await page.innerText('body');
    assert.match(texte, /Lot L-E2E-.*réceptionné/, 'la réception est confirmée');
  } finally {
    await browser.close();
  }
});
