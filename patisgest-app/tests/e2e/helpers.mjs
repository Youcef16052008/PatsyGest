// Harness Playwright des parcours E2E (Phase 4).
//
// Prérequis (voir tests/e2e/README.md) : une stack Supabase locale, la chaîne
// de déploiement appliquée, le seed `seed.mjs`, et l'app en production
// (`npm run build && npm run start`) joignable sur PATSYGEST_E2E_BASE.
import { chromium } from 'playwright';

export const BASE = process.env.PATSYGEST_E2E_BASE ?? 'http://127.0.0.1:3416';
export const PROPRIETAIRE = { email: 'amina@patisserie.dz', motdepasse: 'PatisGest2026!' };

/**
 * Ouvre un navigateur Chromium headless.
 *
 * En environnement hors ligne, `PATISGEST_CHROMIUM_PATH` permet d'utiliser un
 * binaire Chrome for Testing extrait localement (aucun téléchargement CDN).
 * `PATISGEST_CHROMIUM_LIBS` et `PATISGEST_CHROMIUM_FONTS` désignent alors les
 * bibliothèques et polices décompressées ; ils ne sont jamais commités.
 */
export async function ouvrirNavigateur() {
  const executablePath = process.env.PATISGEST_CHROMIUM_PATH;
  if (!executablePath) return chromium.launch();

  if (process.env.PATISGEST_CHROMIUM_LIBS) {
    process.env.LD_LIBRARY_PATH = [
      process.env.PATISGEST_CHROMIUM_LIBS,
      process.env.LD_LIBRARY_PATH,
    ].filter(Boolean).join(':');
  }
  if (process.env.PATISGEST_CHROMIUM_FONTS) {
    process.env.FONTCONFIG_PATH = process.env.PATISGEST_CHROMIUM_FONTS;
  }
  return chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--headless=shell',
      '--no-zygote',
    ],
  });
}

/** Connexion par le formulaire réel, puis attente du tableau de bord. */
export async function connecter(page, email = PROPRIETAIRE.email) {
  await page.goto(`${BASE}/connexion`, { waitUntil: 'networkidle' });
  await page.fill('input[name=email]', email);
  await page.fill('input[name=motdepasse]', PROPRIETAIRE.motdepasse);
  await page.click('form button:has-text("Se connecter")');
  await page.waitForURL('**/tableau-de-bord', { waitUntil: 'commit', timeout: 60_000 });
  await page.waitForLoadState('networkidle');
}
