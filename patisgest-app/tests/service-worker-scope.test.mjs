// NF-02 / D5 — périmètre du service worker.
//
// Le service worker est le seul endroit du produit où une erreur de portée
// met des données d'un compte sur le disque d'un appareil partagé. Ces tests
// lisent sa source et vérifient les propriétés qui l'empêchent, plutôt que de
// faire confiance à un commentaire.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');

/** Extrait le corps de l'écouteur `fetch`. */
function corpsFetch() {
  const debut = source.indexOf('addEventListener("fetch"');
  assert.ok(debut > 0, 'écouteur fetch introuvable');
  return source.slice(debut);
}

test('D5 : une page authentifiée n’est jamais servie depuis un cache', () => {
  const corps = corpsFetch();
  // Le bloc navigation se termine là où commence la liste blanche des assets.
  const finNavigation = corps.indexOf('if (!url.pathname.startsWith("/_next/static/")');
  assert.ok(finNavigation > 0, 'bloc assets introuvable : la découpe du test est cassée');
  const blocNavigation = corps.slice(0, finNavigation);
  assert.match(blocNavigation, /request\.mode === "navigate"\)/, 'la navigation doit être traitée explicitement');

  // Hors coquille, la réponse vient TOUJOURS du réseau. Il peut exister un
  // repli (servir la coquille) mais jamais un `cache.match(request)` : c'est
  // cette distinction qui empêche de servir /caisse depuis le disque.
  assert.doesNotMatch(
    blocNavigation,
    /cache\.match\(request\)/,
    'aucune navigation ne doit être servie depuis le cache de la requête',
  );
  assert.match(blocNavigation, /try \{\s*return await fetch\(request\);/);

  // Et le seul repli autorisé est la coquille, explicitement.
  assert.match(blocNavigation, /cache\.match\(COQUILLE\)/);
});

test('D5 : les chemins mis en cache sont une liste blanche explicite', () => {
  // Aucun motif générique du type startsWith("/") ou pathname.includes("")
  // qui mettrait les pages authentifiées en cache par accident.
  const interdits = [
    /pathname\.startsWith\("\/"\)/,
    /startsWith\("\/app"\)/,
    /startsWith\("\/caisse"\)/,
    /startsWith\("\/parametres"\)/,
  ];
  for (const motif of interdits) {
    assert.doesNotMatch(source, motif, `motif de cache trop large : ${motif}`);
  }
  // Et les préfixes autorisés restent ceux des assets + la coquille.
  assert.match(source, /"\/_next\/static\/"/);
  assert.match(source, /"\/appearance\/"/);
  assert.match(source, /"\/icons\/"/);
  assert.match(source, /const COQUILLE = "\/hors-ligne"/);
});

test('D5 : le HTML non coquille n’est jamais mis en cache', () => {
  // La validation de contenu doit refuser tout ce qui n'est pas un asset typé.
  assert.match(source, /function contenuAssetValide/);
  assert.doesNotMatch(
    source,
    /"text\/html"/,
    'text/html ne doit apparaître nulle part : aucun HTML générique en cache',
  );
});

test('D5 : la coquille est précachée à l’installation, sans bloquer', () => {
  const install = source.slice(source.indexOf('addEventListener("install"'), source.indexOf('addEventListener("activate"'));
  assert.match(install, /cache\.add\(new Request\(COQUILLE/);
  // Un échec réseau à l'installation ne doit pas empêcher l'installation.
  assert.match(install, /catch\s*\{/, 'un échec de précache doit être rattrapé');
  assert.match(install, /skipWaiting\(\)/);
});

test('D5 : la version du cache a été incrémentée (pas de cache fantôme)', () => {
  assert.match(source, /const VERSION = "v4/);
  // Une nouvelle version de coquille doit changer le nom de cache, sinon les
  // anciens appareils garderaient l'ancienne page indéfiniment.
  assert.match(source, /patisgest-coquille-\$\{VERSION\}/);
});

test('D5 : l’activation ne supprime pas le cache de la coquille', () => {
  const act = source.slice(source.indexOf('addEventListener("activate"'), source.indexOf('addEventListener("message"'));
  assert.match(act, /name !== CACHE_COQUILLE/);
});

test('D5 : hors ligne, sans cache, on répond une page honnête (pas un écran blanc)', () => {
  assert.match(source, /status: 503/);
  assert.match(source, /Pas de réseau/);
});

test('D5 : le service worker n’est jamais un cache de données métier', () => {
  // Aucune référence aux tables ou au stockage applicatif : le SW ne doit pas
  // se transformer en base de données parallèle.
  for (const terme of ['localStorage', 'supabase', 'articles', 'ventes']) {
    assert.doesNotMatch(source, new RegExp(terme, 'i'), `le SW ne doit pas toucher "${terme}"`);
  }
});
