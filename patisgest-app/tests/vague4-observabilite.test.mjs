import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * H13-02 / H13-07 : les issues de secours renvoyaient un 503 sans aucune
 * trace serveur. On vérifie une trace minimale (origine, étape, type) et
 * l'absence du message brut, qui peut contenir des données de tenant.
 */

const etat = { lever: null, lecture: null };
const CTX = {
  clientId: 'c1',
  clientNom: 'Atelier',
  role: 'proprietaire',
  mode: 'supabase',
};

mock.module(new URL('../src/lib/auth.ts', import.meta.url).href, {
  namedExports: {
    getSessionContext: async () => CTX,
    canReadCosts: () => true,
  },
});
mock.module(new URL('../src/lib/permissions.ts', import.meta.url).href, {
  namedExports: { estProprietaireSeul: () => true },
});
mock.module(new URL('../src/lib/modules-access.ts', import.meta.url).href, {
  namedExports: { lireModulesDesactives: async () => new Set() },
});
mock.module(new URL('../src/lib/supabase/server.ts', import.meta.url).href, {
  namedExports: { createClient: async () => ({ from: () => ({}) }) },
});
mock.module(new URL('../src/lib/pagination.ts', import.meta.url).href, {
  namedExports: {
    lirePages: async () => {
      if (etat.lever) throw etat.lever;
      return etat.lecture ?? { ok: true, lignes: [], raison: null, error: null };
    },
  },
});

const { GET: exportGenerique } = await import('../src/app/api/export/route.ts');
const { GET: sauvegarde } = await import('../src/app/api/sauvegarde/route.ts');
const { journalErreurRoute } = await import('../src/lib/observabilite-route.ts');

function capturerLogs(fn) {
  const logs = [];
  const ancien = console.error;
  console.error = (...args) => logs.push(args);
  return Promise.resolve()
    .then(fn)
    .finally(() => { console.error = ancien; })
    .then((resultat) => ({ resultat, logs }));
}

function initialiser() {
  etat.lever = null;
  etat.lecture = null;
  process.env.PATISGEST_MODE_GRATUIT = '1';
}

test('H13-02 : un incident inattendu de /api/export est tracé sans PII', async () => {
  initialiser();
  etat.lever = new Error('PostgREST c1 secret=XYZ token=abc');
  const { resultat, logs } = await capturerLogs(() =>
    exportGenerique(new Request('https://app.test/api/export?table=ventes')));
  assert.equal(resultat.status, 503);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[api/export] incident inattendu');
  assert.deepEqual(logs[0][1], { etape: 'lecture:ventes', type: 'Error' });
  const texte = JSON.stringify(logs);
  assert.doesNotMatch(texte, /secret=XYZ|token=abc|PostgREST c1/);
});

test('H13-07 : un incident inattendu de /api/sauvegarde est tracé sans PII', async () => {
  initialiser();
  etat.lever = new TypeError('RLS client c1');
  const { resultat, logs } = await capturerLogs(() => sauvegarde());
  assert.equal(resultat.status, 503);
  assert.equal(logs.length, 1);
  assert.equal(logs[0][0], '[api/sauvegarde] incident inattendu');
  assert.deepEqual(logs[0][1], { etape: 'lecture:clients', type: 'TypeError' });
  assert.doesNotMatch(JSON.stringify(logs), /client c1/);
});

test('H13-02/H13-07 : une erreur de lecture attendue n’est pas un incident inattendu', async () => {
  initialiser();
  etat.lecture = { ok: false, raison: 'lecture', lignes: [], error: { message: 'RLS' } };
  const { resultat: r1, logs: l1 } = await capturerLogs(() =>
    exportGenerique(new Request('https://app.test/api/export?table=ventes')));
  const { resultat: r2, logs: l2 } = await capturerLogs(() => sauvegarde());
  assert.equal(r1.status, 500);
  assert.equal(l1.length, 0);
  assert.equal(r2.status, 500);
  assert.equal(l2.length, 0);
});

test('H13-02 : la trace accepte une erreur non-Error et ne divulgue pas sa valeur', () => {
  const { logs } = { logs: [] };
  const ancien = console.error;
  console.error = (...args) => logs.push(args);
  try {
    journalErreurRoute('api/export', 'csv', 'détail sensible');
    assert.deepEqual(logs[0][1], { etape: 'csv', type: 'string' });
    assert.doesNotMatch(JSON.stringify(logs), /détail sensible/);
  } finally {
    console.error = ancien;
  }
});
