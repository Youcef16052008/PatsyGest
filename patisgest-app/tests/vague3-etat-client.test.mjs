// VAGUE 3 — état client : preuves ciblées sur les hypothèses H10-01…H10-11.
// Lectures de source = [STATIQUE UNIQUEMENT] ; le test du cache partagé est
// exécutable sur un faux Storage, sans navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cataloguePourIdentite, enregistrerIdentite } from '../src/lib/catalogue-cache.ts';
import manifest from '../src/app/manifest.ts';

const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

function stockage(donnees = {}) {
  const map = new Map(Object.entries(donnees));
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
    key: (i) => [...map.keys()][i] ?? null,
    get length() { return map.size; },
  };
}

test('H10-01/H10-02 : bundle public inventorié et verrou serveur, pas seulement UI', () => {
  const layout = lire('src/app/(app)/layout.tsx');
  const bundle = lire('src/lib/trial-lock-client.ts');
  const auth = lire('src/lib/auth.ts');
  assert.match(layout, /initialBundle=\{\(trialStatus\?\.signedBundle/);
  assert.match(layout, /serverLocked \? null/);
  assert.match(bundle, /interface ServerLicenseBundle[\s\S]*token: string[\s\S]*publicJwk: JsonWebKey[\s\S]*payload: TrialLicensePayloadClient/);
  assert.doesNotMatch(bundle, /privateJwk|privateKey/);
  assert.match(auth, /essai\?\.verrouille === true\) return \{ ctx: null/);
});

test('H10-03/H10-04 : JSON d’onglet protégé, coquille vérifie l’identité avant DOM', () => {
  const demo = lire('src/components/demo-workspace.tsx');
  const coquille = lire('src/components/coquille-hors-ligne.tsx');
  const cache = lire('src/lib/catalogue-cache.ts');
  assert.match(demo, /try \{ setData\(upgradeState\(JSON\.parse\(event\.newValue\) as State\)\); \} catch/);
  assert.match(coquille, /cataloguePourIdentite\(window\.localStorage, v\.clientId\)/);
  assert.match(cache, /identite\.clientId !== clientId\) return \{ ok: false, raison: "autre-compte" \}/);
});

test('H10-05 : échec d’enregistrement d’identité ne sert pas l’ancien catalogue au nouveau compte', () => {
  const s = stockage({
    'patisgest.catalogue.v1': JSON.stringify({
      version: 1,
      enregistreLe: '2026-11-26T08:00:00.000Z',
      clientId: 'c1',
      clientNom: 'Atelier A',
      articles: [{ id: 'a1', label: 'Éclair' }],
      sites: [],
      identite: { nom: 'Atelier A', adresse: null, telephone: null, nif: null, nis: null, rc: null },
    }),
    'patisgest.session.v1': JSON.stringify({ clientId: 'c1', authUserId: 'u1' }),
  });
  s.setItem = () => { throw new Error('QuotaError'); };
  enregistrerIdentite({ clientId: 'c2', authUserId: 'u2' }, s);
  const r = cataloguePourIdentite(s, 'c2', Date.parse('2026-11-26T09:00:00.000Z'));
  assert.equal(r.ok, false);
  assert.equal(r.raison, 'autre-compte');
});

test('H10-06/H10-11 : snapshot serveur booléen et pastille sans parse JSON maison', () => {
  const coquille = lire('src/components/coquille-hors-ligne.tsx');
  const pastille = lire('src/components/network-status-pill.tsx');
  assert.doesNotMatch(coquille, /null as unknown as boolean/);
  assert.match(coquille, /\(\) => false,/);
  assert.match(pastille, /snapshotAttenteClotureNavigateur/);
  assert.doesNotMatch(pastille, /JSON\.parse\(raw\)/);
});

test('H10-07/H10-08/H10-09 : garde de rechargement, heartbeat no-store, cloud non optimiste', () => {
  const sw = lire('src/components/service-worker.tsx');
  const garde = lire('src/components/trial-guard-client.tsx');
  const credits = lire('src/components/credits-workspace.tsx');
  assert.match(sw, /if \(!majPrete\) return null/);
  assert.match(sw, /controller\?\.postMessage\("SKIP_WAITING"\)/);
  assert.match(garde, /cache: "no-store"/);
  assert.match(garde, /!navigator\.onLine\) return/);
  assert.match(credits, /if \(!res\.ok \|\| !res\.entry\)[\s\S]*setFeedback\(\{ kind: "error"/);
  assert.match(credits, /setCloudCredits\(\[res\.entry, \.\.\.cloudCredits\]\)/);
});

test('H10-10 : RPC cake sans coûts et panneau de courses masqué sans droit', () => {
  const sql = lire('supabase/22-cake-production.sql');
  const page = lire('src/app/(app)/[module]/page.tsx');
  const courses = lire('src/components/liste-courses-panel.tsx');
  const options = sql.slice(sql.indexOf('create or replace function public.cake_options_production'), sql.indexOf('create or replace function public.affecter_production_cake'));
  assert.doesNotMatch(options, /cout|cost|marge/i);
  assert.match(page, /peutVoir=\{canReadCosts\(ctx\.role\)\}/);
  assert.match(courses, /if \(!peutVoir\) return null/);
});

test('H11-11 : manifeste PWA sans donnée de tenant', () => {
  const m = manifest();
  assert.equal(m.start_url, '/');
  assert.equal(m.scope, '/');
  assert.equal(m.display, 'standalone');
  assert.deepEqual(
    m.shortcuts?.map((s) => s.url),
    ['/caisse', '/tableau-de-bord'],
  );
  const json = JSON.stringify(m);
  assert.doesNotMatch(json, /clientId|authUserId|sousDomaine|tenant/i);
});
