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

    // « Nouvel article » et « Réceptionner un lot » sont dans des <details> : les cibler par leur titre.
    const nouvelArticle = page.locator('details.pg-disclosure', { hasText: 'Nouvel article' });
    await nouvelArticle.locator('summary').click();
    const code = `E2E${Date.now().toString().slice(-6)}`;
    await nouvelArticle.locator('input[name=code]').fill(code);
    await nouvelArticle.locator('input[name=nom]').fill('Éclair E2E');
    await nouvelArticle.locator('select[name=niveau]').selectOption('produit');
    await nouvelArticle.locator('input[name=unite]').fill('pcs');
    await nouvelArticle.locator('input[name=seuil]').fill('1');
    await nouvelArticle.locator('input[name=prix_ttc]').fill('250');
    await nouvelArticle.locator('select[name=tva]').selectOption('19');
    await nouvelArticle.locator('button:has-text("Créer l\'article")').click();
    await page.locator(`text=Article « Éclair E2E » créé`).first().waitFor({ timeout: 30_000 });

    // Réception d'un lot sur la Boutique.
    const reception = page.locator('details.pg-disclosure', { hasText: 'Réceptionner un lot' });
    await reception.locator('summary').click();
    const valeurArticle = await reception
      .locator('select[name=articleId] option', { hasText: 'Éclair E2E' })
      .first()
      .getAttribute('value');
    await reception.locator('select[name=articleId]').selectOption(valeurArticle);
    await reception.locator('input[name=qte]').fill('12');
    await reception.locator('select[name=siteId]').selectOption({ index: 0 });
    await reception.locator('input[name=numero]').fill(`L-E2E-${code}`);
    await reception.locator('input[name=pu]').fill('80');
    await reception.locator('input[name=dlc]').fill('2027-02-01');
    await reception.locator('button:has-text("Réceptionner")').click();
    await page.locator('text=/Lot L-E2E-/').first().waitFor({ timeout: 30_000 });
    const texte = await page.innerText('body');
    assert.match(texte, /Lot L-E2E-.*réceptionné/, 'la réception est confirmée');
  } finally {
    await browser.close();
  }
});
