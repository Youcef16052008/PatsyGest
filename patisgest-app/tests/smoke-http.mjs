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
let serverLog = '';
const log = (chunk) => { serverLog = (serverLog + chunk).slice(-2400); };

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
    if (server.exitCode !== null) throw new Error(`Le serveur de test a quitté (${server.exitCode}) :\n${serverLog}`);
    try {
      const res = await fetch(`${BASE}/connexion`);
      if (res.status === 200) return;
    } catch { /* pas encore prêt */ }
    await sleep(500);
  }
  throw new Error(`Le serveur next dev n’a pas démarré à temps.\n${serverLog}`);
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
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', log);
  server.stderr.on('data', log);
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
  for (const route of ['/tableau-de-bord', '/stocks', '/achats', '/production', '/transferts', '/planning', '/tracabilite', '/cake-design', '/qualite', '/cloture', '/caisse']) {
    const res = await get(route, cookie);
    assert.equal(res.status, 200, route);
  }
  const root = await get('/', cookie);
  assert.equal(root.status, 307);
  assert.equal(redirectPath(root), '/tableau-de-bord');
  const missing = await get('/module-inexistant', cookie);
  assert.equal(missing.status, 404);
});

test('les URL directes de coût renvoient le vendeur au tableau de bord, pas le propriétaire', async () => {
  const vendeur = `patisgest_pilot_session=${demoCookie('amine@patisserie.dz')}`;
  const proprietaire = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  for (const route of ['/recettes', '/simulation', '/recettes?guide=recettes']) {
    const refus = await get(route, vendeur);
    assert.equal(refus.status, 307, `vendeur : ${route}`);
    assert.equal(redirectPath(refus), '/tableau-de-bord', route);
    assert.equal((await get(route, proprietaire)).status, 200, `propriétaire : ${route}`);
  }
});

test('US-15.3 : une URL guidée en mode démo reste sans guide Supabase', async () => {
  const cookie = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  for (const route of ['/tableau-de-bord', '/stocks?guide=matieres']) {
    const res = await get(route, cookie);
    assert.equal(res.status, 200, route);
    assert.doesNotMatch(await res.text(), /Guide actif|Me guider|étapes terminées sur 6/);
  }
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

test('US-15.2 : la sauvegarde est refusée sans session (401) et aux non-propriétaires (403)', async () => {
  const anon = await get('/api/sauvegarde');
  assert.equal(anon.status, 401, 'sans session, la sauvegarde doit répondre 401');

  // Labo et vendeur n'ont pas à exfiltrer tout l'établissement.
  for (const [email, role] of [['amine@patisserie.dz', 'vendeur'], ['sara@patisserie.dz', 'labo']]) {
    const res = await get('/api/sauvegarde', `patisgest_pilot_session=${demoCookie(email)}`);
    assert.equal(res.status, 403, `${role} ne doit pas pouvoir télécharger la sauvegarde`);
  }

  // Propriétaire : autorisé (peut échouer en 500/503 sans Supabase, jamais 401/403).
  const proprio = await get('/api/sauvegarde', `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`);
  assert.ok(![401, 403].includes(proprio.status), `le propriétaire est bloqué : ${proprio.status}`);
});

test('US-15.1 : la page Paramètres s’ouvre pour le propriétaire et reste protégée', async () => {
  const anon = await get('/parametres');
  assert.equal(anon.status, 307);
  assert.equal(redirectPath(anon), '/connexion');

  const proprio = await get('/parametres', `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`);
  assert.equal(proprio.status, 200);
  const html = await proprio.text();
  assert.match(html, /<h1[^>]*>Paramètres<\/h1>/);
  assert.match(html, /<h2>Apparence<\/h2>/);
  assert.match(html, /href="\/mentions-legales"/);
  assert.ok(/Identité de l’établissement/.test(html), 'le formulaire d’identité doit être présent');
  assert.ok(/NIF/.test(html) && /NIS/.test(html) && /RC/.test(html), 'les 3 mentions légales doivent apparaître');
});

test('US-15.2 : la restauration n’est pas exposée par une route HTTP ouverte', async () => {
  // La restauration est une server action protégée, pas une route GET.
  const res = await get('/api/restauration');
  assert.equal(res.status, 404, 'aucune route de restauration ne doit exister hors server action');
});

test('Apparence : les cinq interfaces disposent d’un rendu clair et sombre avant JavaScript', async () => {
  const session = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  const designs = ['atelier','pilotage','fabrication','comptoir','essentiel'];
  for (const [i, design] of designs.entries()) {
    for (const mode of ['light','dark']) {
      const modes = designs.map((_,j) => i === j && mode === 'dark' ? 'd' : 'l').join('');
      const response = await get('/tableau-de-bord', `${session}; patisgest.apparence=${design}.${modes}`);
      assert.equal(response.status, 200);
      assert.match(await response.text(), new RegExp(`<html lang="fr" data-design="${design}" data-mode="${mode}"`));
    }
  }
});

/**
 * NF-02 (hors-ligne) : une PWA n'existe que si trois choses sont servies.
 * Sans ces tests, on peut « livrer le service worker » et découvrir sur la
 * tablette du pilote qu'il n'est jamais chargé (mauvais chemin, 404, mauvaise
 * portée, ou manifest absent du <head>).
 */
test('NF-02 : le service worker est servi à la racine, avec la bonne portée implicite', async () => {
  const res = await get('/sw.js');
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /javascript/);
  const src = await res.text();
  // Portée : servi depuis /sw.js = contrôle tout le site. Un SW sous /_next/
  // ne contrôlerait rien d'utile.
  assert.match(src, /addEventListener\("fetch"/);
  assert.match(src, /CACHE_SHELL/);
  // Les server actions et l'API ne doivent jamais être mises en cache :
  // une vente ne doit pas paraître réussie depuis un cache.
  assert.match(src, /url\.pathname\.startsWith\("\/api\/"\)/);
});

test('NF-02 : le manifeste PWA est servi et déclare le nom, les icônes et le mode standalone', async () => {
  const res = await get('/manifest.webmanifest');
  assert.equal(res.status, 200);
  const manifest = await res.json();
  assert.equal(manifest.short_name, 'PâtisGest');
  assert.equal(manifest.display, 'standalone');
  assert.equal(manifest.start_url, '/');
  const tailles = manifest.icons.map((i) => i.sizes);
  assert.ok(tailles.includes('192x192') && tailles.includes('512x512'), 'icônes 192 et 512 requises pour l’installation');
});

test('NF-02 : le manifeste et l’icône sont liés dans le HTML (sinon pas d’installation)', async () => {
  const html = await (await get('/connexion')).text();
  assert.match(html, /rel="manifest"/);
  assert.match(html, /icons\/icon-192\.png/);
});

test('NF-02 : les icônes PWA existent réellement (pas de 404 à l’installation)', async () => {
  for (const chemin of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/apple-touch-icon.png']) {
    const res = await get(chemin);
    assert.equal(res.status, 200, `${chemin} manquant`);
    assert.match(res.headers.get('content-type') ?? '', /image\/png/);
  }
});
