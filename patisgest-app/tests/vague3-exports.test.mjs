// VAGUE 3 — routes CSV : preuves exécutables des codes 200/409/413/500 et de
// l'absence de fichier partiel. Le client Supabase est un faux explicite :
// aucune base réelle, aucun serveur Next, aucun navigateur.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { CSV_BOM } from '../src/lib/csv.ts';

const CTX = {
  clientId: 'c1',
  clientNom: 'Atelier',
  role: 'proprietaire',
  mode: 'supabase',
};

const etat = {
  disabled: new Set(),
  sources: { ventes: [], avoirs: [] },
  erreurs: {},
  rangeOverride: null,
};

function rangeParDefaut(table, debut, fin) {
  if (etat.erreurs[table]) return { data: null, error: etat.erreurs[table] };
  return { data: (etat.sources[table] ?? []).slice(debut, fin + 1), error: null };
}

function requete(table) {
  const chaine = {
    select: () => chaine,
    eq: () => chaine,
    gte: () => chaine,
    lte: () => chaine,
    order: () => chaine,
    range: async (debut, fin) => {
      const special = etat.rangeOverride?.(table, debut, fin);
      return special === undefined ? rangeParDefaut(table, debut, fin) : special;
    },
    limit: async (n) => {
      if (etat.erreurs[table]) return { data: null, error: etat.erreurs[table] };
      return { data: (etat.sources[table] ?? []).slice(0, n), error: null };
    },
  };
  return chaine;
}

mock.module(new URL('../src/lib/auth.ts', import.meta.url).href, {
  namedExports: {
    getSessionContext: async () => CTX,
    canReadCosts: () => true,
  },
});
mock.module(new URL('../src/lib/supabase/server.ts', import.meta.url).href, {
  namedExports: { createClient: async () => ({ from: requete }) },
});
mock.module(new URL('../src/lib/modules-access.ts', import.meta.url).href, {
  namedExports: { lireModulesDesactives: async () => etat.disabled },
});
mock.module(new URL('../src/lib/permissions.ts', import.meta.url).href, {
  namedExports: { estProprietaireSeul: () => true },
});

const { GET: exportGenerique } = await import('../src/app/api/export/route.ts');
const { GET: exportComptable } = await import('../src/app/api/export/comptable/route.ts');

function initialiser() {
  etat.disabled = new Set();
  etat.sources = { ventes: [], avoirs: [] };
  etat.erreurs = {};
  etat.rangeOverride = null;
}

const url = (chemin) => new Request(`https://app.test${chemin}`);

// `Response.text()` applique le décodage UTF-8 de Fetch, qui CONSOMME le BOM.
// On vérifie donc les trois octets réels, puis on décode en conservant le BOM
// pour pouvoir aussi contrôler les en-têtes CSV dans la même chaîne.
async function corpsCsvAvecBom(reponse) {
  const octets = Buffer.from(await reponse.arrayBuffer());
  assert.deepEqual([...octets.subarray(0, 3)], [0xef, 0xbb, 0xbf]);
  return new TextDecoder('utf-8', { ignoreBOM: true }).decode(octets);
}

const ventesEquilibrees = () => [
  {
    id: 'v1', numero: 'V-1', date_vente: '2026-11-26', site_id: 's1',
    total_ht: 1000, total_ttc: 1190, lignes: [{ tva: 19 }],
  },
];
const avoirsEquilibres = () => [
  {
    id: 'a1', numero: 'AV-1', cree_le: '2026-11-26T10:00:00', site_id: 's1',
    total_ht: 100, total_ttc: 119, tva_pct: 19,
  },
];

test('H09-01/H12-03 : export générique exact, en-têtes CSV FR et BOM', async () => {
  initialiser();
  etat.sources.ventes = [{ id: 'v1', date_vente: '2026-11-26', total_ht: 1000, total_ttc: 1190 }];
  const reponse = await exportGenerique(url('/api/export?table=ventes'));
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('content-type') ?? '', /text\/csv; charset=utf-8/);
  assert.match(reponse.headers.get('content-disposition') ?? '', /attachment; filename=/);
  assert.equal(reponse.headers.get('cache-control'), 'no-store');
  const corps = await corpsCsvAvecBom(reponse);
  assert.equal(corps.startsWith(CSV_BOM), true);
  assert.match(corps, /date_vente;id;total_ht;total_ttc/);
  assert.match(corps, /1000;1190/);
});

test('H09-01 : 20 001 lignes donnent 413, jamais un fichier tronqué', async () => {
  initialiser();
  etat.sources.ventes = Array.from({ length: 20_001 }, (_, i) => ({ id: `v${i}` }));
  const reponse = await exportGenerique(url('/api/export?table=ventes'));
  assert.equal(reponse.status, 413);
  assert.match((await reponse.json()).erreur, /20 000/);
});

test('H09-01 : une réponse courte mais suivie de données donne 500, pas un CSV partiel', async () => {
  initialiser();
  const source = [{ id: 'v1' }, { id: 'v2' }, { id: 'v3' }];
  etat.sources.ventes = source;
  etat.rangeOverride = (table, debut) =>
    table === 'ventes' && debut === 0 ? { data: source.slice(0, 2), error: null } : undefined;
  const reponse = await exportGenerique(url('/api/export?table=ventes'));
  assert.equal(reponse.status, 500);
  assert.match((await reponse.json()).erreur, /Export impossible/);
});

test('H09-06 : une lecture des ventes en erreur ne livre aucun fichier', async () => {
  initialiser();
  etat.erreurs.ventes = { code: 'PGRST301', message: 'base indisponible' };
  const reponse = await exportComptable(url('/api/export/comptable'));
  assert.equal(reponse.status, 500);
  assert.match((await reponse.json()).erreur, /Export impossible|impossible de joindre la base/);
});

test('H12-11 : export comptable complet, BOM et en-têtes', async () => {
  initialiser();
  etat.sources.ventes = ventesEquilibrees();
  etat.sources.avoirs = avoirsEquilibres();
  const reponse = await exportComptable(url('/api/export/comptable'));
  assert.equal(reponse.status, 200);
  const corps = await corpsCsvAvecBom(reponse);
  assert.equal(corps.startsWith(CSV_BOM), true);
  assert.match(corps, /date;piece;compte_auxiliaire;ht;tva;ttc;sens;anomalie/);
  assert.match(corps, /V-1/);
  assert.match(corps, /AV-1/);
});

test('H12-11 : 20 001 avoirs donnent 413 au lieu d’un fichier partiel', async () => {
  initialiser();
  etat.sources.ventes = ventesEquilibrees();
  etat.sources.avoirs = Array.from({ length: 20_001 }, (_, i) => ({
    id: `a${i}`, numero: `AV-${i}`, cree_le: '2026-11-26T10:00:00', site_id: 's1',
    total_ht: 0, total_ttc: 0, tva_pct: 0,
  }));
  const reponse = await exportComptable(url('/api/export/comptable'));
  assert.equal(reponse.status, 413);
  assert.match((await reponse.json()).erreur, /20 000 avoirs/);
});

test('H12-11 : une page d’avoirs courte suivie de données donne 500, pas un CSV partiel', async () => {
  initialiser();
  etat.sources.ventes = ventesEquilibrees();
  const source = [
    { ...avoirsEquilibres()[0], id: 'a1' },
    { ...avoirsEquilibres()[0], id: 'a2', numero: 'AV-2' },
    { ...avoirsEquilibres()[0], id: 'a3', numero: 'AV-3' },
  ];
  etat.sources.avoirs = source;
  etat.rangeOverride = (table, debut) =>
    table === 'avoirs' && debut === 0 ? { data: source.slice(0, 2), error: null } : undefined;
  const reponse = await exportComptable(url('/api/export/comptable'));
  assert.equal(reponse.status, 500);
});

test('H12-11 : migration 41 absente garde le 409 explicite', async () => {
  initialiser();
  etat.sources.ventes = ventesEquilibrees();
  etat.erreurs.avoirs = { code: '42P01', message: 'relation public.avoirs does not exist' };
  const reponse = await exportComptable(url('/api/export/comptable'));
  assert.equal(reponse.status, 409);
  assert.match((await reponse.json()).erreur, /migration 41/);
});

test('H12-11 : erreur générique de lecture des avoirs donne 500, sans CSV', async () => {
  initialiser();
  etat.sources.ventes = ventesEquilibrees();
  etat.erreurs.avoirs = { code: 'XX999', message: 'internal boom' };
  const reponse = await exportComptable(url('/api/export/comptable'));
  assert.equal(reponse.status, 500);
  assert.match((await reponse.json()).erreur, /Export impossible|opération impossible/);
});

test('H16-06 : une ligne PostgREST incomplète refuse l’export comptable sans CSV', async () => {
  initialiser();
  etat.sources.ventes = [
    { id: 'v1', numero: 'V-1', date_vente: '2026-11-26', total_ht: 1000, total_ttc: 1190, lignes: [{ tva: 19 }] },
    { id: 'v2', numero: 'V-2', date_vente: '2026-11-26', total_ht: 'NaN', lignes: [] },
  ];
  const reponse = await exportComptable(url('/api/export/comptable?debut=2026-11-01&fin=2026-11-30'));
  assert.equal(reponse.status, 500);
  const corps = await reponse.json();
  assert.match(corps.erreur, /ligne de vente illisible|montant non numérique|identifiant, numéro ou date manquant/);
  assert.equal(reponse.headers.get('content-type')?.includes('text/csv'), false);
});
