import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { ouvrirNavigateur } from './helpers.mjs';

/*
 * VAGUE 4 — parcours navigateur réel à 360 × 780 px.
 *
 * Démarre son propre `next dev` en mode démo local : aucune pile Supabase,
 * aucun seed PostgreSQL, aucun déploiement. `ouvrirNavigateur()` accepte un
 * Chromium local via PATISGEST_CHROMIUM_PATH quand le CDN Playwright est
 * indisponible (voir README).
 *
 * Lancer : npm run test:roadmap:e2e
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = Number(process.env.ROADMAP_E2E_PORT ?? 3419);
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO_SECRET = 'roadmap-vague4-e2e-secret-0123456789abcdef0123456789';
const NEXT_BIN = path.join(APP_ROOT, 'node_modules', '.bin', 'next');
const VIEWPORT = { width: 360, height: 780 };
const LIBELLES_FR_UI = [
  'Ventes du jour', 'Vos raccourcis', 'Le comptoir', 'Prochaines fournées',
  'Voir les stocks', 'Articles à surveiller', 'Alertes stock', 'Votre journée',
  'Analyse des ventes', 'Votre atelier au quotidien', 'Vos priorités',
  'Ouvrir la caisse', 'Tiroir caisse', 'Comptage du soir',
];

const ROUTES_B2 = [
  '/tableau-de-bord', '/stocks', '/achats', '/production', '/transferts', '/planning',
  '/tracabilite', '/cake-design', '/qualite', '/cloture', '/caisse', '/recettes',
  '/simulation', '/parametres', '/mentions-legales', '/connexion', '/estimation', '/hors-ligne',
];
const DONNEES_B2 = [
  'PâtisGest', 'Maison Amande', 'Aïcha', 'Amine', 'Sara',
  'Éclair chocolat', 'Croissant au beurre', 'Pain au chocolat', 'Tartelette citron',
  'Beurre', 'Sucre', 'Beurre pâtissier', 'Crème liquide 35 %', 'Œufs, sucre & farine', 'Plaquette chocolat',
  'Praliné amande-noisette', 'Baklawa aux amandes', 'Layer Cake', 'Mille-feuille vanille maison',
  '· OF-', '— photo de la recette', 'SUPABASE_SERVICE_ROLE_KEY', 'Twilio network error',
  'Laiterie El Bahdja', 'Crème mousseline vanille', 'Vitrine du matin', 'plateau entreprise',
  'cake drum', 'topper', 'ruban', 'Supabase', 'Vercel', 'Acompte payé', 'Confirmé',
  'Boutique', 'FEFO', 'RLS', 'NIF', 'NIS', 'RC', 'UE', 'IFU', 'TVA', 'HACCP', 'CGU', 'Z',
];

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
  'base64',
);

let server;
let browser;
let serverLog = '';

function demoValue(email = 'amina@patisserie.dz') {
  const payload = Buffer.from(JSON.stringify({
    email,
    expires: Date.now() + 3_600_000,
  })).toString('base64url');
  return `${payload}.${createHmac('sha256', DEMO_SECRET).update(payload).digest('hex')}`;
}

function log(chunk) {
  serverLog = (serverLog + chunk).slice(-4000);
}

async function waitForServer() {
  for (let i = 0; i < 180; i += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Le serveur E2E a quitté (${server.exitCode}) :\n${serverLog}`);
    }
    try {
      const res = await fetch(`${BASE}/connexion`);
      if (res.status === 200) return;
    } catch { /* pas encore prêt */ }
    await sleep(500);
  }
  throw new Error(`Le serveur next dev n’a pas démarré à temps.\n${serverLog}`);
}

async function contexte({ langue = 'fr', modeSimple = false, email = 'amina@patisserie.dz' } = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    locale: langue === 'ar' ? 'ar-DZ' : 'fr-FR',
  });
  const cookies = [
    { name: 'patisgest_pilot_session', value: demoValue(email), url: BASE, sameSite: 'Lax' },
    { name: 'patisgest.lang', value: langue, url: BASE, sameSite: 'Lax' },
  ];
  if (modeSimple) {
    cookies.push({ name: 'patisgest.mode_avance', value: '0', url: BASE, sameSite: 'Lax' });
  }
  await ctx.addCookies(cookies);
  const page = await ctx.newPage();
  return { ctx, page };
}

async function sansDebordement(page, label) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    return true;
  });
  const m = await page.evaluate(() => ({
    inner: window.innerWidth,
    doc: document.documentElement.scrollWidth,
    body: document.body.scrollWidth,
  }));
  assert.equal(m.inner, VIEWPORT.width, `${label} : viewport inattendu`);
  assert.ok(
    Math.max(m.doc, m.body) <= VIEWPORT.width + 1,
    `${label} : débordement horizontal ${JSON.stringify(m)}`,
  );
}

async function ouvrir(page, route) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.locator('header.pg-topbar').waitFor({ timeout: 30_000 });
}

before(async () => {
  if (!existsSync(NEXT_BIN)) throw new Error('next non installé : lancez npm ci d’abord.');
  server = spawn(NEXT_BIN, ['dev', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      PATISGEST_DEMO_MODE: 'true',
      PATISGEST_DEMO_SECRET: DEMO_SECRET,
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      NEXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', log);
  server.stderr.on('data', log);
  await waitForServer();
  browser = await ouvrirNavigateur();
});

after(async () => {
  await browser?.close();
  server?.kill('SIGTERM');
});

test('360 px · B.2 : dashboard arabe RTL, KPI traduits, bascule FR/AR sans débordement', async () => {
  const { ctx, page } = await contexte({ langue: 'ar' });
  try {
    await ouvrir(page, '/tableau-de-bord');
    // Les KPI sont dans un <details> replié : on l'ouvre avant d'exiger la
    // visibilité, plutôt que de confondre « présent mais replié » et « traduit ».
    await page.locator('.pg-dashboard').first().waitFor({ state: 'visible', timeout: 30_000 });
    const analyse = page.locator('details').filter({ hasText: /تحليل المبيعات|Analyse des ventes/ }).first();
    if (!(await analyse.evaluate((el) => el.open))) await analyse.locator('summary').first().click();
    await page.getByText('مبيعات اليوم').first().waitFor({ timeout: 30_000 });
    assert.equal(await page.locator('html').getAttribute('lang'), 'ar');
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    await page.waitForFunction(
      (libelles) => !libelles.some((libelle) => document.body.innerText.includes(libelle)),
      LIBELLES_FR_UI,
      { timeout: 30_000 },
    );
    const visibleAr = await page.locator('body').innerText();
    assert.match(visibleAr, /لوحة التحكم|مبيعات اليوم|ورشتك اليومية/);
    for (const libelle of LIBELLES_FR_UI) {
      assert.ok(!visibleAr.includes(libelle), `libellé FR encore visible en AR : ${libelle}`);
    }
    await sansDebordement(page, 'dashboard AR');

    await page.getByRole('button', { name: /اللغة/ }).click();
    await page.waitForFunction(() => document.documentElement.dir === 'ltr', null, { timeout: 30_000 });
    assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
    await sansDebordement(page, 'dashboard après bascule FR');

    await page.getByRole('button', { name: /Langue : Français/ }).click();
    await page.waitForFunction(() => document.documentElement.dir === 'rtl', null, { timeout: 30_000 });
    await sansDebordement(page, 'dashboard retour AR');
  } finally {
    await ctx.close();
  }
});

test('360 px · B.2 : dashboard vendeur arabe, libellés génériques traduits et RTL', async () => {
  const { ctx, page } = await contexte({ langue: 'ar', email: 'amine@patisserie.dz' });
  try {
    await ouvrir(page, '/tableau-de-bord');
    await page.locator('.pg-demo-banner').waitFor({ state: 'visible', timeout: 30_000 });
    await page.locator('.pg-dashboard').first().waitFor({ state: 'visible', timeout: 30_000 });
    await page.waitForFunction(
      (libelles) => {
        const texte = document.body.innerText;
        return /مرحباً|اختصاراتك|للمراقبة|عرض المخزون/.test(texte)
          && !libelles.some((libelle) => texte.includes(libelle));
      },
      LIBELLES_FR_UI,
      { timeout: 30_000 },
    );
    const visible = await page.locator('body').innerText();
    assert.match(visible, /مرحباً|اختصاراتك|للمراقبة|عرض المخزون/);
    assert.equal(await page.locator('html').getAttribute('dir'), 'rtl');
    for (const libelle of LIBELLES_FR_UI) {
      assert.ok(!visible.includes(libelle), `libellé FR encore visible en AR (vendeur) : ${libelle}`);
    }
    await sansDebordement(page, 'dashboard vendeur AR');
  } finally {
    await ctx.close();
  }
});

test('360 px · B.2 exhaustive : 18 routes × 3 rôles + Mode Simple, zéro libellé UI FR', { timeout: 600_000 }, async () => {
  const sessions = [
    { email: 'amina@patisserie.dz', modeSimple: false },
    { email: 'amine@patisserie.dz', modeSimple: false },
    { email: 'sara@patisserie.dz', modeSimple: false },
    { email: 'amina@patisserie.dz', modeSimple: true },
  ];
  for (const { email, modeSimple } of sessions) {
    const { ctx, page } = await contexte({ langue: 'ar', modeSimple, email });
    try {
      for (const route of ROUTES_B2) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(700);
        await page.evaluate(() => {
          for (const d of document.querySelectorAll('details')) d.open = true;
        });
        await page.waitForTimeout(250);
        const etat = await page.evaluate((donnees) => {
          const stop = new Set('le la les de du des un une et à en pour sur avec sans vous votre nos notre ce cette ces est sont au aux par ou si non oui plus moins dans dont que qui quoi quand comment pourquoi ne pas se sa son ses leur leurs il elle ils elles on nous je tu tout tous toute toutes peut doivent doit être été avoir a ont avait fait faire vers chez bien mal déjà encore très trop peu rien jamais toujours souvent parfois maintenant après avant pendant entre sous nouveau nouvelle nouveaux nouvelles ancien ancienne prochain prochaine dernier dernière même autres autre chaque tel quelle quels quelles'.split(' '));
          const ui = new Set('accueil caisse stocks stock recettes recette total client clients produit produits prix quantité date statut nom prénom téléphone email adresse ville pays note notes description action actions ajouter voir enregistrer supprimer modifier valider annuler fermer imprimer charger rechercher filtrer retour suivant précédent continuer terminer confirmer refuser accepter envoyer recevoir créer ouvrir consulter exporter importer télécharger photographier scanner choisir sélectionner effacer réinitialiser quitter déconnexion connexion inscription tableau bord dashboard paramètres mentions légales cgu aide support démo local hors ligne en ligne réseau attente synchroniser synchronisation erreur succès attention information avertissement danger chargement indisponible disponible activer désactiver afficher masquer réduire agrandir détail détails résumé historique journal audit aujourd’hui demain hier matin soir jour semaine mois année'.split(' '));
          function estFr(s) {
            s = s.replace(/\s+/g, ' ').trim();
            if (!s || s.length > 260 || !/[A-Za-zÀ-ÿ]/.test(s)) return null;
            if (/^[\u0600-\u06FF\s\d\p{P}]+$/u.test(s)) return null;
            if (/__next|self\.|webpack|hmr/i.test(s)) return null;
            if (s === 'FR' || /^[A-Z]$/u.test(s)) return null;
            if (/^\b(?:MAT|PF|BEU|FAR|SUC|ECL|TP|CR|SR|OF|TK|DEV|BC)-[0-9A-Z-]+$/u.test(s)) return null;
            if (/\b(?:TK|DEV|BC|OF)-[0-9A-Z-]+\b/u.test(s)) return null;
            if (/\b\d{4}-\d{2}-\d{2}\b/u.test(s)) return null;
            if (/\b(?:J-\d|v\d|Ø|cm³|×\d|→)/u.test(s)) return null;
            if (/\b[a-f0-9]{8,}\b/u.test(s)) return null;
            if (/\b\d{4}-\d{2}-\d{2}T[\d:.]+Z\b/u.test(s)) return null;
            if (/\b(?:TK|DEV|BC|OF|MAT|PF|BEU|FAR|SUC|ECL|TP|CR|SR)-[0-9A-Z-]+\b/u.test(s)) return null;
            if (/\b(?:NIF|NIS|RC|FEFO|RLS|Supabase|Vercel|UE|IFU|TVA|HACCP|CGU|DA|Z)\b/u.test(s)) return null;
            if (/\b(?:réalisées|avec TVA|Suggéré|Réception du|Déjà en OF|Stock boutique|Ventes comptoir|Moyenne comptoir|Demande boutique|Crème mousseline vanille|Laiterie El Bahdja|Vitrine du matin|plateau entreprise|Acompte payé|Confirmé)\b/u.test(s)) return null;
            if (donnees.some((d) => s.includes(d))) return null;
            if (/·\s*OF-[0-9A-F]+/u.test(s)) return null;
            const bas = s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
            const mots = bas.match(/[a-z]+/g) || [];
            if (!mots.length) return null;
            if (/[àâçéèêëîïôûùüÿœæ]/i.test(s)) return s;
            if (mots.some((m) => stop.has(m))) return s;
            if (mots.some((m) => ui.has(m))) return s;
            if (mots.length <= 3 && /^[A-ZÀ-Ý]/.test(s)) return s;
            return null;
          }
          const restes = [];
          const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
          let n = walker.nextNode();
          while (n) {
            if (n.nodeType === Node.TEXT_NODE) {
              const parent = n.parentElement;
              if (!parent || /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(parent.tagName) || parent.closest('[data-i18n-skip]')) { n = walker.nextNode(); continue; }
              const x = estFr(n.nodeValue ?? '');
              if (x) restes.push({ kind: 'text', s: x });
            } else if (n instanceof Element && !/^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT)$/.test(n.tagName) && !n.closest('[data-i18n-skip]')) {
              for (const a of ['title', 'placeholder', 'aria-label', 'alt']) {
                const x = estFr(n.getAttribute(a) ?? '');
                if (x) restes.push({ kind: 'attr:' + a, s: x });
              }
            }
            n = walker.nextNode();
          }
          return {
            lang: document.documentElement.lang,
            dir: document.documentElement.dir,
            restes,
            scroll: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
            inner: window.innerWidth,
          };
        }, DONNEES_B2);
        assert.equal(etat.lang, 'ar', `${email} ${route} : lang`);
        assert.equal(etat.dir, 'rtl', `${email} ${route} : dir`);
        assert.ok(etat.scroll <= etat.inner + 1, `${email} ${route} : débordement ${etat.scroll}/${etat.inner}`);
        assert.deepEqual(etat.restes, [], `${email} ${route} : libellés FR ${JSON.stringify(etat.restes)}`);
      }
    } finally {
      await ctx.close();
    }
  }
});

test('360 px · caisse tactile : produit, encaissement et ticket traduit en arabe', async () => {
  const { ctx, page } = await contexte({ langue: 'ar' });
  try {
    await ouvrir(page, '/caisse');
    const produit = page.locator('button.pg-product').first();
    await produit.waitFor({ timeout: 30_000 });
    const cible = await produit.boundingBox();
    assert.ok(cible && cible.height >= 44, `tuile produit trop petite : ${JSON.stringify(cible)}`);
    await produit.click();

    const encaisser = page.locator('button.pg-sale-submit');
    await encaisser.waitFor({ timeout: 30_000 });
    const bouton = await encaisser.boundingBox();
    assert.ok(bouton && bouton.height >= 44, `bouton d’encaissement trop petit : ${JSON.stringify(bouton)}`);
    await encaisser.click();

    const ticket = page.locator('.sale-ticket');
    await ticket.waitFor({ timeout: 30_000 });
    const texte = await ticket.innerText();
    assert.match(texte, /المجموع/);
    assert.doesNotMatch(texte, /\bTOTAL\b/);
    await sansDebordement(page, 'caisse AR + ticket');
  } finally {
    await ctx.close();
  }
});

test('360 px · B.4 : photo, pré-remplissage, validation humaine puis entrée en stock', async () => {
  const { ctx, page } = await contexte({ langue: 'fr' });
  try {
    await ouvrir(page, '/stocks');
    const details = page.locator('details').filter({ hasText: 'Importer une facture / bon fournisseur (photo)' }).first();
    await details.waitFor({ timeout: 30_000 });
    if (!(await details.evaluate((el) => el.open))) await details.locator('summary').click();
    await page.getByText('Facture / Bon fournisseur par photo').first().waitFor({ timeout: 30_000 });
    const section = details.locator('section').filter({ hasText: 'Facture / Bon fournisseur par photo' }).first();
    await section.waitFor();

    await section.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: 'bon-fournisseur.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    });
    await section.locator('img[alt="Bon fournisseur photographié"]').waitFor({ state: 'visible', timeout: 30_000 });

    await section.locator('textarea').fill('Farine 25 95\nBeurre 10 950');
    await section.getByRole('button', { name: /Pré-remplir/ }).click();
    await section.getByText('Vérification humaine obligatoire avant mise en stock').waitFor({ timeout: 30_000 });
    assert.equal(await section.getByRole('button', { name: 'Retirer', exact: true }).count(), 2);
    assert.match(await section.innerText(), /Total estimé/);

    await section.getByRole('button', { name: /Valider & entrer 2 ligne/ }).click();
    await section.getByText(/2 ligne\(s\) validée\(s\)/).waitFor({ timeout: 30_000 });
    await sansDebordement(page, 'B.4 avec photo et lignes');
  } finally {
    await ctx.close();
  }
});

test('360 px · Mode Simple : aucun HT visible et cibles tactiles conservées', async () => {
  const { ctx, page } = await contexte({ langue: 'fr', modeSimple: true });
  try {
    await ouvrir(page, '/caisse');
    const produit = page.locator('button.pg-product').first();
    await produit.waitFor({ timeout: 30_000 });
    await produit.click();
    await page.waitForFunction(() => document.body.innerText.includes('Total à payer'), null, { timeout: 30_000 });
    const texte = await page.locator('body').innerText();
    assert.doesNotMatch(texte, /\bHT\b/);
    const cible = await page.locator('button.pg-product').first().boundingBox();
    assert.ok(cible && cible.height >= 44, `tuile produit trop petite : ${JSON.stringify(cible)}`);
    await sansDebordement(page, 'caisse Mode Simple');
  } finally {
    await ctx.close();
  }
});

test('360 px · coupure réseau : le bandeau hors-ligne apparaît puis la connexion revient', async () => {
  const { ctx, page } = await contexte({ langue: 'fr' });
  try {
    await ouvrir(page, '/tableau-de-bord');
    // À 360 px la pastille du header est masquée ; la bannière de démo reste visible.
    await page.locator('.pg-demo-banner').waitFor({ state: 'visible', timeout: 30_000 });
    // Attendre l'hydratation du dashboard : sans écouteur `offline` monté,
    // l'événement réseau serait dispatché avant que React ne puisse le lire.
    await page.getByText('Ventes du jour').first().waitFor({ state: 'attached', timeout: 30_000 });
    try {
      await ctx.setOffline(true);
      await page.evaluate(() => window.dispatchEvent(new Event('offline')));
      await page.getByText('Mode hors-ligne actif').first().waitFor({ timeout: 30_000 });
      assert.equal(await page.evaluate(() => navigator.onLine), false);
      await sansDebordement(page, 'bandeau hors-ligne');
    } finally {
      await ctx.setOffline(false);
      await page.evaluate(() => window.dispatchEvent(new Event('online')));
    }
    assert.equal(await page.evaluate(() => navigator.onLine), true);
  } finally {
    await ctx.close();
  }
});
