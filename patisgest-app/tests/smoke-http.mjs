/**
 * Tests de fumée HTTP — vérifient les gardes de routes et la connexion de démonstration
 * tels qu'ils se comportent réellement dans un navigateur (redirects, cookies, server actions).
 *
 * Lancer avec : npm run test:smoke   (npm ci au préalable ; démarre son propre next dev)
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { existsSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.SMOKE_PORT ?? 3411);
const BASE = `http://127.0.0.1:${PORT}`;
const DEMO_SECRET = 'smoke-test-secret-0123456789abcdef0123456789abcdef';
let server;

function demoCookie(email) {
  const payload = Buffer.from(JSON.stringify({ email, expires: Date.now() + 3_600_000 })).toString('base64url');
  const signature = createHmac('sha256', DEMO_SECRET).update(payload).digest('hex');
  return `${payload}.${signature}`;
}

function redirectPath(res) {
  const loc = res.headers.get('location');
  assert.ok(loc, 'En-tête Location absent');
  return new URL(loc, BASE).pathname;
}

async function get(pathname, cookie) {
  return fetch(BASE + pathname, {
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
}

async function waitForServer() {
  for (let i = 0; i < 180; i++) {
    try {
      const res = await fetch(`${BASE}/connexion`);
      if (res.status === 200) return;
    } catch { /* pas encore prêt */ }
    await sleep(500);
  }
  throw new Error('Le serveur next dev n\'a pas démarré à temps.');
}

/** Extrait l'identifiant d'une server action depuis un formulaire du HTML rendu. */
function actionId(html, marker) {
  const idx = html.indexOf(marker);
  assert.notEqual(idx, -1, `Marqueur absent du HTML : ${marker}`);
  const forms = [...html.matchAll(/<form[\s\S]*?<\/form>/g)];
  const form = forms.find((m) => m.index <= idx && m.index + m[0].length >= idx);
  assert.ok(form, 'Formulaire introuvable autour du marqueur.');
  const id = form[0].match(/name="(\$ACTION_ID_[a-f0-9]+)"/);
  assert.ok(id, 'Identifiant de server action introuvable.');
  return id[1];
}

before(async () => {
  const nextBin = path.join(APP_ROOT, 'node_modules', '.bin', 'next');
  if (!existsSync(nextBin)) throw new Error('next non installé : lancez npm ci d\'abord.');
  server = spawn(nextBin, ['dev', '-p', String(PORT), '-H', '127.0.0.1'], {
    cwd: APP_ROOT,
    env: {
      ...process.env,
      PATISGEST_DEMO_MODE: 'true',
      PATISGEST_DEMO_SECRET: DEMO_SECRET,
      // Pas de Supabase dans ce test : le middleware doit court-circuiter sans bloquer.
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
    },
    stdio: 'ignore',
  });
  await waitForServer();
});

after(() => {
  server?.kill('SIGTERM');
});

test('sans session, les pages protégées redirigent vers /connexion', async () => {
  for (const route of ['/tableau-de-bord', '/stocks', '/caisse', '/cake-design']) {
    const res = await get(route);
    assert.equal(res.status, 307, route);
    assert.equal(redirectPath(res), '/connexion', route);
  }
});

test('la page de connexion propose la connexion de démonstration', async () => {
  const res = await get('/connexion');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.ok(html.includes('Essayer'), 'Boutons de démonstration absents');
});

test('la connexion de démonstration crée un cookie signé et ouvre le tableau de bord', async () => {
  const page = await (await get('/connexion')).text();
  // « Essayer » suffit : les libellés sont découpés par des commentaires HTML entre les mots.
  const action = actionId(page, 'Essayer');
  const form = new FormData();
  form.set(action, '');
  form.set('email', 'amina@patisserie.dz');
  const res = await fetch(`${BASE}/connexion`, { method: 'POST', body: form, redirect: 'manual', headers: { origin: BASE } });
  assert.equal(res.status, 303);
  assert.equal(redirectPath(res), '/tableau-de-bord');
  const setCookie = res.headers.getSetCookie().find((c) => c.startsWith('patisgest_pilot_session='));
  assert.ok(setCookie, 'Cookie de session absent');
  assert.ok(/HttpOnly/i.test(setCookie), 'Le cookie doit être HttpOnly');

  const cookie = setCookie.split(';')[0];
  const dash = await get('/tableau-de-bord', cookie);
  assert.equal(dash.status, 200);
  const html = await dash.text();
  assert.ok(html.includes('DÉMO LOCALE'), 'Bannière de démonstration absente');
  assert.ok(html.includes('Déconnexion'), 'Bouton de déconnexion absent');
});

test('un cookie de démonstration forgé est rejeté', async () => {
  const forged = `${Buffer.from(JSON.stringify({ email: 'amina@patisserie.dz', expires: Date.now() + 3_600_000 })).toString('base64url')}.deadbeef`;
  const res = await get('/tableau-de-bord', `patisgest_pilot_session=${forged}`);
  assert.equal(res.status, 307);
  assert.equal(redirectPath(res), '/connexion');
});

test('avec une session valide, les modules s\'ouvrent et un module inconnu renvoie 404', async () => {
  const cookie = `patisgest_pilot_session=${demoCookie('amine@patisserie.dz')}`;
  for (const route of ['/tableau-de-bord', '/stocks', '/achats', '/recettes', '/production', '/transferts', '/simulation', '/planning', '/tracabilite', '/cake-design', '/qualite', '/cloture', '/caisse']) {
    const res = await get(route, cookie);
    assert.equal(res.status, 200, route);
  }
  const root = await get('/', cookie);
  assert.equal(root.status, 307);
  assert.equal(redirectPath(root), '/tableau-de-bord');
  const missing = await get('/module-inexistant', cookie);
  assert.equal(missing.status, 404);
});

test('la déconnexion efface la session et revient à /connexion', async () => {
  const cookie = `patisgest_pilot_session=${demoCookie('sara@patisserie.dz')}`;
  const dash = await (await get('/tableau-de-bord', cookie)).text();
  const action = actionId(dash, 'Déconnexion');
  const form = new FormData();
  form.set(action, '');
  const res = await fetch(`${BASE}/tableau-de-bord`, {
    method: 'POST',
    body: form,
    redirect: 'manual',
    headers: { cookie, origin: BASE },
  });
  assert.equal(res.status, 303);
  assert.equal(redirectPath(res), '/connexion');
  const cleared = res.headers.getSetCookie().find((c) => c.startsWith('patisgest_pilot_session='));
  assert.ok(cleared, 'Le cookie doit être supprimé à la déconnexion');
  assert.ok(/Max-Age=0|Expires=Thu, 01 Jan 1970/i.test(cleared), 'Suppression de cookie invalide');
});

test('MOD-15 : export CSV refusé sans session (401) et pour un vendeur sur une table de coût (403)', async () => {
  // Sans session : la route API répond, elle ne redirige pas.
  const anon = await get('/api/export?table=ventes');
  assert.equal(anon.status, 401);

  // Vendeur : tables métier autorisées, tables de coût interdites.
  const vendeur = `patisgest_pilot_session=${demoCookie('amine@patisserie.dz')}`;
  const couts = await get('/api/export?table=couts', vendeur);
  assert.equal(couts.status, 403, 'un vendeur ne doit pas exporter les coûts');
  const recettes = await get('/api/export?table=recettes', vendeur);
  assert.equal(recettes.status, 403, 'un vendeur ne doit pas exporter les recettes');
  const inconnue = await get('/api/export?table=pas-une-table', vendeur);
  assert.equal(inconnue.status, 403);

  // Propriétaire : la table de coût est autorisée (peut échouer en 503 sans
  // Supabase, mais jamais en 403).
  const proprio = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  const ok = await get('/api/export?table=couts', proprio);
  assert.notEqual(ok.status, 403, 'le propriétaire doit pouvoir exporter les coûts');
});
