import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { jourLocal, plusJours } from '../src/lib/workspace-data.ts';

/*
 * H04-01 / H04-03 — la commande publique ne doit jamais contourner le plafond
 * par source : ni quand la migration 38 est absente, ni quand le secret de
 * production n'est pas configuré. Le mock n'enregistre QUE les RPC : si la
 * commande principale est appelée, le test échoue.
 */

const SECRET = 'un-secret-de-test-de-plus-de-trente-deux-caracteres';
const stubsUrl = new URL('../tests/mocks/next-stubs.mjs', import.meta.url).href;
const serverUrl = new URL('../src/lib/supabase/server.ts', import.meta.url).href;

let entetes = new Headers({ 'x-forwarded-for': '198.51.100.7', host: 'elyasmine.patisgest.dz' });
let etat = {
  verif: { data: null, error: null },
  commande: { data: { numero: 'CMD-1', deja_enregistree: false }, error: null },
  appels: [],
};

mock.module(stubsUrl, {
  namedExports: {
    revalidatePath() {},
    async cookies() { return { get: () => undefined, getAll: () => [], set: () => {} }; },
    redirect() { throw new Error('redirect'); },
    NextResponse: { json: (corps, init = {}) => ({ status: init.status ?? 200, headers: new Headers(), json: async () => corps }) },
    async headers() { return entetes; },
  },
});

mock.module(serverUrl, {
  namedExports: {
    createClient: async () => ({
      rpc: async (nom, args) => {
        etat.appels.push({ nom, args });
        return nom === 'patisgest_verifier_source_vitrine' ? etat.verif : etat.commande;
      },
    }),
  },
});

const { demanderCommande } = await import('../src/app/(vitrine)/vitrine/[slug]/commander/actions.ts');

function formulaire() {
  const fd = new FormData();
  fd.set('sousDomaine', 'elyasmine');
  fd.set('cleRecette', 'baklawa');
  fd.set('nom', 'Client Test');
  fd.set('telephone', '0555123456');
  fd.set('dateEvent', plusJours(jourLocal(), 1));
  fd.set('nbParts', '8');
  fd.set('note', '');
  fd.set('cleNavigateur', 'cle-navigateur-stable-1234567890');
  return fd;
}

function environnementInitial() {
  const cles = ['NODE_ENV', 'VERCEL_ENV', 'VITRINE_SECRET_ANTI_ABUS'];
  const avant = Object.fromEntries(cles.map(k => [k, process.env[k]]));
  process.env.VITRINE_SECRET_ANTI_ABUS = SECRET;
  delete process.env.VERCEL_ENV;
  if (process.env.NODE_ENV === 'production') delete process.env.NODE_ENV;
  etat = {
    verif: { data: null, error: null },
    commande: { data: { numero: 'CMD-1', deja_enregistree: false }, error: null },
    appels: [],
  };
  entetes = new Headers({ 'x-forwarded-for': '198.51.100.7', host: 'elyasmine.patisgest.dz' });
  return () => {
    for (const k of cles) {
      if (avant[k] === undefined) delete process.env[k];
      else process.env[k] = avant[k];
    }
  };
}

test('H04-03 : migration 38 absente ⇒ commande refusée, aucune RPC métier', async () => {
  const restaurer = environnementInitial();
  try {
    etat.verif = { data: null, error: { code: 'PGRST202', message: 'function not found' } };
    const resultat = await demanderCommande({}, formulaire());
    assert.ok(resultat.erreur, 'la commande doit être refusée');
    assert.deepEqual(etat.appels.map(a => a.nom), ['patisgest_verifier_source_vitrine']);
  } finally { restaurer(); }
});

test('H04-01 : production sans secret anti-abus ⇒ refus avant tout appel base', async () => {
  const restaurer = environnementInitial();
  try {
    delete process.env.VITRINE_SECRET_ANTI_ABUS;
    process.env.NODE_ENV = 'production';
    const resultat = await demanderCommande({}, formulaire());
    assert.ok(resultat.erreur, 'la commande doit être refusée');
    assert.deepEqual(etat.appels, []);
  } finally { restaurer(); }
});

test('H04-01/H04-03 : vérification réussie ⇒ la commande principale reste appelée', async () => {
  const restaurer = environnementInitial();
  try {
    const resultat = await demanderCommande({}, formulaire());
    assert.match(resultat.succes ?? '', /CMD-1/);
    assert.deepEqual(etat.appels.map(a => a.nom), [
      'patisgest_verifier_source_vitrine',
      'patisgest_demander_commande',
    ]);
    const verif = etat.appels[0].args;
    assert.equal(verif.p_sous_domaine, 'elyasmine');
    assert.match(verif.p_source, /^[0-9a-f]{64}$/);
  } finally { restaurer(); }
});

test('H09-09 : date impossible, passée ou au-delà d’un an ⇒ refus avant tout RPC', async () => {
  const restaurer = environnementInitial();
  try {
    for (const date of ['2026-02-30', '2020-01-01', plusJours(jourLocal(), 366)]) {
      const fd = formulaire();
      fd.set('dateEvent', date);
      const resultat = await demanderCommande({}, fd);
      assert.match(resultat.erreur ?? '', /date valide/i);
    }
    assert.deepEqual(etat.appels, [], 'une date invalide ne doit pas joindre la base');
  } finally { restaurer(); }
});
