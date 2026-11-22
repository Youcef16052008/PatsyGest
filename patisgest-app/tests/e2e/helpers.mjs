// Harness Playwright des parcours E2E (Phase 4).
//
// Prérequis (voir tests/e2e/README.md) : une stack Supabase locale, la chaîne
// de déploiement appliquée, le seed `seed.mjs`, et l'app en production
// (`npm run build && npm run start`) joignable sur PATSYGEST_E2E_BASE.
import { chromium } from 'playwright';

export const BASE = process.env.PATSYGEST_E2E_BASE ?? 'http://127.0.0.1:3416';
export const PROPRIETAIRE = { email: 'amina@patisserie.dz', motdepasse: 'PatisGest2026!' };

/** Ouvre un navigateur Chromium headless. */
export async function ouvrirNavigateur() {
  return chromium.launch();
}

/** Connexion par le formulaire réel, puis attente du tableau de bord. */
export async function connecter(page, email = PROPRIETAIRE.email) {
  await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=motdepasse]', PROPRIETAIRE.motdepasse);
  await page.click('button:has-text("Se connecter")');
  await page.waitForURL('**/tableau-de-bord', { timeout: 60_000 });
}
