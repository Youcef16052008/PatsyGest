import http from 'node:http';
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

test('Paramètres : cinq designs cliquables, thème par design et licence gratuite', async () => {
  const session = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  const res = await get('/parametres', session);
  assert.equal(res.status, 200);
  const html = await res.text();

  // Les cinq vignettes sont présentes, une seule active.
  const cards = [...html.matchAll(/class="pg-design-card"[^>]*data-design-preview="([a-z]+)"[^>]*data-active="(true|false)"/g)];
  assert.equal(cards.length, 5, 'cinq designs doivent être proposés');
  assert.deepEqual(cards.map((m) => m[1]), ['atelier', 'pilotage', 'fabrication', 'comptoir', 'essentiel']);
  assert.equal(cards.filter((m) => m[2] === 'true').length, 1, 'un seul design actif');

  // Le mode sombre de chaque design est conservé indépendamment du design choisi.
  const dark = await get('/parametres', `${session}; patisgest.apparence=comptoir.ldldl`);
  assert.equal(dark.status, 200);
  assert.match(await dark.text(), /<html lang="fr" dir="ltr" data-design="comptoir" data-mode="dark"/);

  // Mode « tout gratuit » (défaut) : aucun essai daté, aucune mention de paiement.
  assert.match(html, /Gratuit · illimité/);
  assert.doesNotMatch(html, /jours restants? sur/, 'aucun bandeau d’essai ne doit apparaître');
});

test('Recettes : les photos générées sont servies et affichées', async () => {
  const session = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  const res = await get('/recettes', session);
  assert.equal(res.status, 200);
  for (const photo of ['baklawa.webp', 'mille-feuille.webp', 'layer-cake.webp']) {
    const image = await get(`/recettes/${photo}`);
    assert.equal(image.status, 200, `${photo} doit être servi`);
    assert.equal(image.headers.get('content-type'), 'image/webp');
    const bytes = (await image.arrayBuffer()).byteLength;
    assert.ok(bytes > 1_000 && bytes < 110_000, `${photo} doit être compressé (${bytes} octets)`);
  }
});

test('Volet A : /estimation est accessible sans compte ni cookie et affiche le calculateur DA', async () => {
  const res = await get('/estimation');
  assert.equal(res.status, 200, '/estimation doit répondre 200 sans session');
  const html = await res.text();
  assert.match(html, /Estimateur parts, moule &amp; prix en dinars/);
  assert.match(html, /Outil libre · sans compte · DA/);
  assert.match(html, /href="\/connexion"/);

  // La page de connexion propose l'entrée directe vers /estimation
  const loginRes = await get('/connexion');
  assert.equal(loginRes.status, 200);
  assert.match(await loginRes.text(), /href="\/estimation"/);
});

test('Volet A & B : gardes de rôles maintenues sur /simulation, /planning et /caisse', async () => {
  const vendeur = `patisgest_pilot_session=${demoCookie('amine@patisserie.dz')}`;
  const proprio = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;

  // Vendeur bloqué sur /simulation (coûts & impact hausse matière)
  const vSim = await get('/simulation', vendeur);
  assert.ok(vSim.status >= 300 && vSim.status < 400);
  assert.equal(redirectPath(vSim), '/tableau-de-bord');

  // Vendeur autorisé sur /caisse et /planning (réassort boutique)
  assert.equal((await get('/caisse', vendeur)).status, 200);
  assert.equal((await get('/planning', vendeur)).status, 200);

  // Propriétaire autorisé sur /simulation, /planning, /caisse, /cloture, /cake-design
  for (const route of ['/simulation', '/planning', '/caisse', '/cloture', '/cake-design', '/transferts']) {
    assert.equal((await get(route, proprio)).status, 200, `${route} doit répondre 200 pour propriétaire`);
  }
});

test('accueils différenciés propriétaire et labo', async () => {
  const owner = await (await get('/tableau-de-bord', `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`)).text();
  const lab = await (await get('/tableau-de-bord', `patisgest_pilot_session=${demoCookie('sara@patisserie.dz')}`)).text();
  assert.match(owner, /Santé économique/);
  assert.match(owner, /Fermeture de la journée/);
  assert.match(lab, /Stocks à vérifier/);
  assert.doesNotMatch(lab, /Santé économique|Fermeture de la journée|Ventes aujourd’hui|Produits à renforcer/);
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
  assert.match(src, /request\.mode === "navigate"/);
  assert.doesNotMatch(src, /CACHE_SHELL/);
  assert.match(src, /_next\/static\//);
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

/**
 * Vitrine publique (migrations 25-28).
 *
 * Le serveur de test n'a PAS de base Supabase : ces tests vérifient donc
 * exactement ce qui compte pour un visiteur — la page répond, explique
 * pourquoi elle est vide, et ne fuit ni erreur 500 ni identifiant interne.
 */
test('vitrine : une adresse inconnue répond 200 avec un message honnête (pas de 500)', async () => {
  const res = await get('/vitrine/elyasmine');
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /Boutique indisponible/);
  // Aucune erreur technique ne doit apparaître dans la page publique.
  assert.equal(/SUPABASE|stack|at async/i.test(html), false, 'détail technique exposé au visiteur');
});

test('vitrine : le slug est validé avant tout accès base', async () => {
  // Un souligné n'est pas un nom DNS valide : le slug doit être refusé
  // AVANT tout accès base (sinon on interroge PostgREST pour rien).
  const res = await get('/vitrine/pas_valide');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /Adresse de boutique invalide/);
});

test('vitrine : /vitrine sans slug ne renvoie pas une 500', async () => {
  const res = await get('/vitrine');
  assert.ok([307, 308, 404].includes(res.status), `statut inattendu : ${res.status}`);
});

test('vitrine : l’application n’est pas réécrite pour un hôte d’application', async () => {
  // Sans routage, `/` redirige vers /connexion ou /tableau-de-bord (307).
  const res = await get('/');
  assert.equal(res.status, 307);
  assert.ok(['/connexion', '/tableau-de-bord'].includes(redirectPath(res)));
});

test('vitrine : un hôte boutique est réécrit vers son catalogue public', async () => {
  const {status, body, rewrite} = await new Promise((resolve,reject) => {
    const req = http.request(`${BASE}/`, {headers:{host:'elyasmine.patisgest.dz'},agent:false}, res => {
      let body=''; res.setEncoding('utf8'); res.on('data', chunk => body+=chunk);
      res.on('end',()=>resolve({status:res.statusCode, body, rewrite:res.headers['x-middleware-rewrite']}));
    });
    req.on('error',reject); req.end();
  });
  assert.equal(status,200);
  assert.equal(new URL(rewrite, BASE).pathname,'/vitrine/elyasmine');
  assert.match(body, /Boutique indisponible/);
});

test('caisse : un onglet lié à une autre session est refusé avant écriture', async () => {
  const cookie = `patisgest_pilot_session=${demoCookie('amina@patisserie.dz')}`;
  assert.equal((await get('/caisse',cookie)).status,200);
  const manifest=JSON.parse(await (await import('node:fs/promises')).readFile(path.join(APP_ROOT,'.next/dev/server/app/(app)/[module]/page/server-reference-manifest.json'),'utf8'));
  const action=Object.entries(manifest.node).find(([,v])=>v.filename==='src/lib/actions-caisse.ts' && v.exportedName==='sellCart')?.[0];
  assert.ok(action);
  async function envoyer(client,user) {
    const body=new FormData(); body.set('_1_expectedClientId',client); body.set('_1_expectedAuthUserId',user);
    body.set('_1_siteId','invalide'); body.set('0',JSON.stringify([{},'$K1']));
    const res=await fetch(`${BASE}/caisse`,{method:'POST',headers:{cookie,origin:BASE,'next-action':action},body});
    assert.equal(res.status,200); return res.text();
  }
  assert.match(await envoyer('autre','autre'),/La session a changé/);
  assert.match(await envoyer('11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-333333333301'),/Site : identifiant invalide/);
});
