// Parcours 3/4 — Transfert : déplacer des lots entre deux sites.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE, ouvrirNavigateur, connecter } from './helpers.mjs';
import { seed } from './seed.mjs';

test('parcours transfert : déplacer des lots entre deux sites', async () => {
  assert.equal(await seed(), true, 'PATSYGEST_PG_URL est requis pour le seed');
  const browser = await ouvrirNavigateur();
  try {
    const page = await browser.newPage();
    await connecter(page);
    await page.goto(`${BASE}/transferts`, { waitUntil: 'networkidle' });

    await page.selectOption('select[name=articleId]', { index: 0 });
    await page.selectOption('select[name=fromSiteId]', { index: 0 });
    await page.selectOption('select[name=toSiteId]', { index: 1 });
    await page.fill('input[name=qte]', '2');
    await page.fill('input[name=motif]', 'Réassort E2E');
    await page.click('button:has-text("Transférer")');

    await page.locator('text=/Transfert enregistré/').first().waitFor({ timeout: 30_000 });
    const texte = await page.innerText('body');
    assert.match(texte, /Transfert enregistré \(TR-/, 'le transfert est confirmé avec sa référence');
    assert.match(texte, /Réassort E2E/, 'le motif saisi est repris');
  } finally {
    await browser.close();
  }
});
