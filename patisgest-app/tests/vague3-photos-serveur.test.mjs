// VAGUE 3 — chaîne photo : preuve exécutable que la frontière serveur refuse
// une charge utile qui n'est pas une image réelle, et que le stockage local
// n'est jamais rendu avec une valeur non vérifiée.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stubsUrl = new URL('./mocks/next-stubs.mjs', import.meta.url).href;
const authUrl = new URL('../src/lib/auth.ts', import.meta.url).href;
const serverUrl = new URL('../src/lib/supabase/server.ts', import.meta.url).href;

const CTX = {
  clientId: 'c1', clientNom: 'Atelier', role: 'proprietaire', mode: 'supabase',
};
const etat = { session: CTX, appels: [] };

mock.module(stubsUrl, {
  namedExports: { revalidatePath() {} },
});
mock.module(authUrl, {
  namedExports: {
    getSessionContext: async () => etat.session,
    canWrite: (role) => role === 'proprietaire' || role === 'labo',
  },
});
mock.module(serverUrl, {
  namedExports: {
    createClient: async () => ({
      rpc: async (nom, args) => {
        etat.appels.push({ nom, args });
        return { data: null, error: null };
      },
    }),
  },
});

const { sauverPhotoArticleCloud } = await import('../src/lib/actions-photos.ts');
const {
  sanitizeProductPhotosSnapshot,
  saveProductPhotoLocal,
  readProductPhotosMap,
  PRODUCT_PHOTOS_KEY_PREFIX,
} = await import('../src/lib/pastry-visuals.ts');
const { sanitizeImageDataUrl } = await import('../src/lib/recipe-photo.ts');

const JPEG = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
]).toString('base64')}`;
const FAUX_JPEG = `data:image/jpeg;base64,${'A'.repeat(64)}`;
const ENORME = `data:image/jpeg;base64,${Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(230_000),
]).toString('base64')}`;
const ARTICLE = '8c7a59fd-bbf2-49bc-a264-81eb85f8a31a';

function initialiser() {
  etat.session = CTX;
  etat.appels = [];
}

test('H12-04 : magic bytes, base64 canonique et borne de taille', () => {
  assert.equal(sanitizeImageDataUrl(JPEG), JPEG);
  assert.equal(sanitizeImageDataUrl(FAUX_JPEG), null);
  assert.equal(sanitizeImageDataUrl(ENORME), null);
  assert.equal(sanitizeImageDataUrl('data:image/jpeg;base64,AAAA==='), null);
  assert.equal(sanitizeImageDataUrl('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='), null);
  assert.equal(sanitizeImageDataUrl('https://exemple.test/photo.jpg'), null);
  assert.equal(sanitizeImageDataUrl('/appearance/croissant.webp'), null);
});

test('H12-05 : une fausse photo est refusée par le serveur avant tout RPC', async () => {
  initialiser();
  const resultat = await sauverPhotoArticleCloud(ARTICLE, FAUX_JPEG);
  assert.equal(resultat.ok, false);
  assert.match(resultat.erreur ?? '', /Photo invalide/);
  assert.deepEqual(etat.appels, []);
});

test('H12-05 : photo surdimensionnée, SVG ou URL externe : aucun RPC', async () => {
  initialiser();
  for (const charge of [ENORME, 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', 'https://exemple.test/x.png']) {
    const resultat = await sauverPhotoArticleCloud(ARTICLE, charge);
    assert.equal(resultat.ok, false);
  }
  assert.deepEqual(etat.appels, []);
});

test('H12-05 : identifiant article invalide ou session absente : aucun RPC', async () => {
  initialiser();
  assert.equal((await sauverPhotoArticleCloud('pas-un-uuid', JPEG)).ok, false);
  etat.session = null;
  assert.equal((await sauverPhotoArticleCloud(ARTICLE, JPEG)).ok, false);
  assert.deepEqual(etat.appels, []);
});

test('H12-05/H12-06 : JPEG réel transmis au RPC, et suppression à null acceptée', async () => {
  initialiser();
  const ajout = await sauverPhotoArticleCloud(ARTICLE, JPEG);
  assert.equal(ajout.ok, true);
  assert.deepEqual(etat.appels[0], {
    nom: 'sauver_photo_article',
    args: { p_article_id: ARTICLE, p_photo_url: JPEG },
  });

  etat.appels = [];
  const suppression = await sauverPhotoArticleCloud(ARTICLE, null);
  assert.equal(suppression.ok, true);
  assert.deepEqual(etat.appels[0], {
    nom: 'sauver_photo_article',
    args: { p_article_id: ARTICLE, p_photo_url: null },
  });
});

test('H12-06 : le snapshot localStorage écarte toute valeur non image', () => {
  const brut = JSON.stringify({
    a: JPEG,
    b: FAUX_JPEG,
    c: 'javascript:alert(1)',
    d: 'https://exemple.test/x.png',
    e: 42,
    f: null,
  });
  assert.deepEqual(sanitizeProductPhotosSnapshot(brut), { a: JPEG });
  assert.deepEqual(sanitizeProductPhotosSnapshot('{pas du json'), {});
  assert.deepEqual(sanitizeProductPhotosSnapshot('null'), {});
  assert.deepEqual(sanitizeProductPhotosSnapshot('[]'), {});
});

test('H12-06 : sauvegarde locale refuse une charge invalide et relit un snapshot sûr', () => {
  const ancien = Object.prototype.hasOwnProperty.call(globalThis, 'window')
    ? globalThis.window
    : undefined;
  const memoire = new Map();
  let evenements = 0;
  globalThis.window = {
    localStorage: {
      getItem: (k) => (memoire.has(k) ? memoire.get(k) : null),
      setItem: (k, v) => memoire.set(k, v),
    },
    dispatchEvent: () => { evenements += 1; },
  };
  try {
    assert.throws(
      () => saveProductPhotoLocal('c1', ARTICLE, FAUX_JPEG),
      /Photo invalide/,
    );
    assert.equal(memoire.size, 0);

    saveProductPhotoLocal('c1', ARTICLE, JPEG);
    assert.equal(
      memoire.get(`${PRODUCT_PHOTOS_KEY_PREFIX}c1`),
      JSON.stringify({ [ARTICLE]: JPEG }),
    );
    assert.equal(evenements, 1);
    assert.deepEqual(readProductPhotosMap('c1'), { [ARTICLE]: JPEG });

    memoire.set(`${PRODUCT_PHOTOS_KEY_PREFIX}c1`, JSON.stringify({ [ARTICLE]: FAUX_JPEG }));
    assert.deepEqual(readProductPhotosMap('c1'), {});
  } finally {
    if (ancien === undefined) delete globalThis.window;
    else globalThis.window = ancien;
  }
});

test('H12-06 : [STATIQUE UNIQUEMENT] la chaîne composant → local → serveur est explicite', () => {
  const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const picker = lire('src/components/product-photo-picker.tsx');
  const composer = lire('src/components/sale-composer.tsx');
  const actions = lire('src/lib/actions-photos.ts');
  assert.match(picker, /sanitizeImageDataUrl\(compressed\)/);
  assert.match(picker, /sanitizeProductPhotosSnapshot\(photosSnapshot\)/);
  assert.match(picker, /sauverPhotoArticleCloud\(active\.id, image\)/);
  assert.match(composer, /sanitizeProductPhotosSnapshot\(photosSnapshot\)/);
  assert.match(composer, /sanitizePhotoSource\(a\.photo\)/);
  assert.match(actions, /sanitizeImageDataUrl\(photoUrl\)/);
});
