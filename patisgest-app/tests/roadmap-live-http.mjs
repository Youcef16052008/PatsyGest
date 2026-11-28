import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { parse } from 'parse5';

/*
 * VAGUE 4 — vérification SSR/HTTP réelle sur `next dev` en mode démo local.
 * Aucune pile Supabase, aucun secret de production, aucun déploiement.
 * Le serveur est démarré et arrêté par ce fichier ; `PATISGEST_DEMO_SECRET`
 * n'est qu'une valeur de test éphémère.
 *
 * Lancer : npm run test:roadmap:live
 */

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.ROADMAP_HTTP_PORT ?? 3418);
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO_SECRET = 'roadmap-vague4-secret-0123456789abcdef0123456789';
const NEXT_BIN = path.join(APP_ROOT, 'node_modules', '.bin', 'next');
let server;
let serverLog = '';

function demoCookie(email) {
  const payload = Buffer.from(JSON.stringify({ email, expires: Date.now() + 3_600_000 })).toString('base64url');
  const signature = createHmac('sha256', DEMO_SECRET).update(payload).digest('hex');
  return `patisgest_pilot_session=${payload}.${signature}`;
}

const SESSION = demoCookie('amina@patisserie.dz');
const cookie = (...parts) => [SESSION, ...parts].join('; ');
const LANGUE_AR = cookie('patisgest.lang=ar');
const LANGUE_FR = cookie('patisgest.lang=fr');
const LANGUE_INVALIDE = cookie('patisgest.lang=es');
const MODE_SIMPLE = cookie('patisgest.lang=fr', 'patisgest.mode_avance=0');

async function get(pathname, cookies) {
  return fetch(BASE + pathname, {
    redirect: 'manual',
    headers: cookies ? { cookie: cookies } : {},
  });
}

function redirectPath(res) {
  const loc = res.headers.get('location');
  assert.ok(loc, 'En-tête Location absent');
  return new URL(loc, BASE).pathname;
}

function log(chunk) {
  serverLog = (serverLog + chunk).slice(-4000);
}

async function waitForServer() {
  for (let i = 0; i < 180; i += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Le serveur de test a quitté (${server.exitCode}) :\n${serverLog}`);
    }
    try {
      const res = await fetch(`${BASE}/connexion`);
      if (res.status === 200) return;
    } catch { /* pas encore prêt */ }
    await sleep(500);
  }
  throw new Error(`Le serveur next dev n’a pas démarré à temps.\n${serverLog}`);
}

function texteVisible(html) {
  const arbre = parse(html);
  const morceaux = [];
  function parcourir(noeud) {
    if (['script', 'style', 'noscript'].includes(noeud.nodeName)) return;
    if (noeud.nodeName === '#text') morceaux.push(noeud.value);
    for (const enfant of noeud.childNodes ?? []) parcourir(enfant);
    if (noeud.content) parcourir(noeud.content);
  }
  parcourir(arbre);
  return morceaux.join(' ').replace(/\s+/g, ' ').trim();
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
});

after(() => {
  server?.kill('SIGTERM');
});

test('routes live : santé, pages publiques et garde des routes protégées', async () => {
  const health = await get('/api/health');
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);

  for (const route of ['/connexion', '/estimation', '/hors-ligne']) {
    const res = await get(route);
    assert.equal(res.status, 200, route);
  }
  const offline = await (await get('/hors-ligne')).text();
  assert.match(offline, /Hors-ligne|hors-ligne/);
  assert.match(offline, /Revenir à la caisse/);

  for (const route of ['/tableau-de-bord', '/stocks', '/caisse']) {
    const res = await get(route);
    assert.equal(res.status, 307, route);
    assert.equal(redirectPath(res), '/connexion', route);
  }
});

test('routes live : tous les modules du workspace répondent en SSR avec une session démo', async () => {
  const routes = [
    '/tableau-de-bord', '/stocks', '/achats', '/production', '/transferts', '/planning',
    '/tracabilite', '/cake-design', '/qualite', '/cloture', '/caisse', '/recettes',
    '/simulation', '/parametres', '/mentions-legales',
  ];
  for (const route of routes) {
    const res = await get(route, SESSION);
    assert.equal(res.status, 200, `${route} → ${res.status}\n${serverLog.slice(-800)}`);
  }
  const inconnu = await get('/module-inexistant', SESSION);
  assert.equal(inconnu.status, 404);
});

test('B.2 : le cookie AR est rendu en RTL côté serveur, FR et valeur invalide en LTR', async () => {
  const ar = await (await get('/tableau-de-bord', LANGUE_AR)).text();
  assert.match(ar, /<html[^>]*lang="ar"[^>]*dir="rtl"/, 'SSR arabe RTL absent');
  assert.match(ar, /لوحة التحكم|مبيعات اليوم/, 'libellé arabe absent du HTML');

  const stocksAr = await (await get('/stocks', LANGUE_AR)).text();
  assert.match(stocksAr, /جارٍ تحميل العرض التجريبي…/, 'coquille SSR arabe absente');
  assert.doesNotMatch(stocksAr, /Chargement de la démo/, 'coquille SSR restée française en AR');

  const fr = await (await get('/tableau-de-bord', LANGUE_FR)).text();
  assert.match(fr, /<html[^>]*lang="fr"[^>]*dir="ltr"/);
  const invalide = await (await get('/tableau-de-bord', LANGUE_INVALIDE)).text();
  assert.match(invalide, /<html[^>]*lang="fr"[^>]*dir="ltr"/, 'une langue inconnue doit retomber sur FR');
});

test('B.4 et Mode Simple : coquille SSR, cookie simple et absence de HT côté serveur', async () => {
  // Le composant B.4 est un client component alimenté par le DemoWorkspace :
  // SSR livre la coquille « Chargement de la démo… ». Le parcours photo avec
  // hydratation réelle est vérifié par `test:roadmap:e2e`, pas par une regex HTML.
  const stocks = await get('/stocks', SESSION);
  assert.equal(stocks.status, 200);
  assert.match(await stocks.text(), /Chargement de la démo/);

  const parametres = await (await get('/parametres', MODE_SIMPLE)).text();
  assert.match(parametres, /aria-pressed="true"[^>]*>\s*Simple \(6 onglets\)/, 'cookie Mode Simple non rendu');

  const caisse = await (await get('/caisse', MODE_SIMPLE)).text();
  const visible = texteVisible(caisse);
  assert.doesNotMatch(visible, /\bHT\b/, 'la coquille SSR du Mode Simple ne doit pas afficher HT');
});
