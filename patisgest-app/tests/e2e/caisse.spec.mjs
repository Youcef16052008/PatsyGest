// Parcours 1/4 — Caisse : composer un panier et encaisser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ouvrirNavigateur, connecter } from './helpers.mjs';
import { seed } from './seed.mjs';

test('parcours caisse : composer un panier et encaisser', async () => {
  assert.equal(await seed(), true, 'PATSYGEST_PG_URL est requis pour le seed');
  const browser = await ouvrirNavigateur();
  try {
    const page = await browser.newPage();
    await connecter(page);
    await page.goto(`${BASE}/caisse`, { waitUntil: 'networkidle' });

    await page.click('button.pg-product');
    await page.waitForSelector('.pg-sale-submit', { timeout: 15_000 });
    await page.click('button.pg-sale-submit');

    await page.locator('text=Ticket enregistré').first().waitFor({ timeout: 30_000 });
    await page.locator('#ventes-recentes').locator('text=/V-[0-9A-Za-z-]+/').first().waitFor({ timeout: 15_000 });
    const texte = await page.innerText('body');
    assert.match(texte, /Ticket enregistré/, 'la vente est confirmée');
    assert.match(texte, /\bTOTAL\b/i, 'le ticket affiche le total');
    assert.match(texte, /\bV-[0-9A-Za-z-]+/, 'le numéro de ticket est présenté');
  } finally {
    await browser.close();
  }
});
