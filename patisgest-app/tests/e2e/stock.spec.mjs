// Parcours 2/4 — Stock : créer un article puis réceptionner un lot.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ouvrirNavigateur, connecter } from './helpers.mjs';

test('parcours stock : créer un article et réceptionner un lot', async () => {
  const browser = await ouvrirNavigateur();
  try {
    const page = await browser.newPage();
    await connecter(page);
    await page.goto(`${BASE}/stocks`, { waitUntil: 'networkidle' });

    // « Nouvel article » est dans un <details> : il faut déplier avant de saisir.
    const nouvelArticle = page.locator('details.pg-disclosure').nth(0);
    await nouvelArticle.locator('summary').click();
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await page.fill('input[name=code]', code);
    await page.fill('input[name=nom]', 'Éclair E2E');
    await page.selectOption('select[name=niveau]', 'produit');
    await page.fill('input[name=unite]', 'pcs');
    await page.fill('input[name=seuil]', '1');
    await page.fill('input[name=pv_ht]', '250');
    await page.fill('input[name=tva]', '19');
    await nouvelArticle.locator('button:has-text("Créer l\'article")').click();
    await page.locator(`text=Article « Éclair E2E » créé`).first().waitFor({ timeout: 30_000 });

    // Réception d'un lot sur la Boutique.
    const reception = page.locator('details.pg-disclosure').nth(1);
    await reception.locator('summary').click();
    const valeurArticle = await page
      .locator('select[name=articleId] option', { hasText: 'Éclair E2E' })
      .first()
      .getAttribute('value');
    await page.selectOption('select[name=articleId]', valeurArticle);
    await page.fill('input[name=qte]', '12');
    await page.selectOption('select[name=siteId]', { index: 0 });
    await page.fill('input[name=numero]', `L-E2E-${code}`);
    await page.fill('input[name=pu]', '80');
    await page.fill('input[name=dlc]', '2027-02-01');
    await reception.locator('button:has-text("Réceptionner")').click();
    await page.locator('text=/Lot L-E2E-/').first().waitFor({ timeout: 30_000 });
    const texte = await page.innerText('body');
    assert.match(texte, /Lot L-E2E-.*réceptionné/, 'la réception est confirmée');
  } finally {
    await browser.close();
  }
});
