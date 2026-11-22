// Parcours 4/4 — Vitrine : commande publique d'une boutique publiée.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE } from './helpers.mjs';
import { seed } from './seed.mjs';

test('parcours vitrine : un visiteur commande sans compte', async () => {
  assert.equal(await seed(), true, 'PATSYGEST_PG_URL est requis pour le seed');
  const browser = await await import('playwright').then((m) => m.chromium.launch());
  try {
    const page = await browser.newPage();
    await page.goto(`${BASE}/vitrine/el-yasmine`, { waitUntil: 'networkidle' });

    // La page publique ne doit exposer ni coût ni marge.
    const html = await page.content();
    assert.match(html, /Baba au rhum/, 'le produit public est affiché');

    await page.selectOption('select[name=cleRecette]', { index: 0 });
    await page.fill('input[name=nom]', 'Client E2E');
    await page.fill('input[name=telephone]', '0555123456');
    await page.fill('input[name=dateEvent]', '2026-12-20');
    await page.click('button:has-text("Envoyer la demande")');

    await page.locator('text=Demande envoyée').first().waitFor({ timeout: 30_000 });
    const texte = await page.innerText('body');
    assert.match(texte, /Demande envoyée/, 'la demande est confirmée');
    assert.doesNotMatch(texte, /coût de revient|marge/i, 'aucune donnée de coût sur la page publique');
  } finally {
    await browser.close();
  }
});
