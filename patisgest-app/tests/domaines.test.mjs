import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normaliserHote, estHoteLocal, resoudreHote, cleCacheHote,
} from '../src/lib/domaines.ts';

/**
 * Résolution host → boutique. Les cas testés sont ceux qui produisent
 * réellement des fautes en production : port dans l'en-tête Host, point
 * final du FQDN, casse, sous-domaine imbriqué, domaine client qui contient
 * le nom du service, et hôtes de prévisualisation.
 */

test('hôte : normalisation (casse, port, point final)', () => {
  assert.equal(normaliserHote('Elyasmine.PatisGest.DZ:443'), 'elyasmine.patisgest.dz');
  assert.equal(normaliserHote('elyasmine.patisgest.dz.'), 'elyasmine.patisgest.dz');
  assert.equal(normaliserHote('  patisgest.dz  '), 'patisgest.dz');
  assert.equal(normaliserHote(null), '');
});

test('hôte : local et prévisualisation ne sont jamais des boutiques', () => {
  for (const h of ['localhost', '127.0.0.1', '10.0.0.4', 'x.localhost', 'patsy-gest.vercel.app', '3000-abc.e2b.app']) {
    assert.equal(estHoteLocal(h), true, `${h} devrait être local`);
    assert.equal(resoudreHote(h).type, 'application');
  }
});

test('hôte : le domaine de service et ses préfixes portent l’application', () => {
  assert.deepEqual(resoudreHote('patisgest.dz'), { type: 'application', sousDomaine: null });
  assert.deepEqual(resoudreHote('www.patisgest.dz'), { type: 'application', sousDomaine: null });
  assert.deepEqual(resoudreHote('app.patisgest.dz'), { type: 'application', sousDomaine: 'app' });
  assert.deepEqual(resoudreHote('admin.patisgest.dz'), { type: 'application', sousDomaine: 'admin' });
});

test('hôte : un sous-domaine devient une boutique', () => {
  assert.deepEqual(resoudreHote('elyasmine.patisgest.dz'), { type: 'boutique', sousDomaine: 'elyasmine' });
  assert.deepEqual(resoudreHote('ELYASMINE.PatisGest.dz:8443'), { type: 'boutique', sousDomaine: 'elyasmine' });
});

test('hôte : sous-domaine imbriqué et suffixe trompeur sont inconnus', () => {
  assert.equal(resoudreHote('a.b.patisgest.dz').type, 'inconnu');
  assert.equal(resoudreHote('patisgest.dz.evil.com').type, 'inconnu');
  assert.equal(resoudreHote('paspatisgest.dz').type, 'inconnu');
  assert.equal(resoudreHote('').type, 'inconnu');
});

test('hôte : un domaine client déclaré gagne sur tout le reste', () => {
  const hotes = ['patisserie-elyasmine.com', 'patisgest.dz'];
  assert.deepEqual(resoudreHote('patisserie-elyasmine.com', 'patisgest.dz', hotes), {
    type: 'domaine-client', hote: 'patisserie-elyasmine.com',
  });
  // Un client peut posséder un domaine qui contient « patisgest ».
  assert.equal(resoudreHote('patisgest.dz', 'patisgest.dz', ['mon-patisgest.dz']).type, 'application');
  assert.equal(resoudreHote('mon-patisgest.dz', 'patisgest.dz', ['mon-patisgest.dz']).type, 'domaine-client');
});

test('hôte : clé de cache nulle pour local (inutile) et non nulle sinon', () => {
  assert.equal(cleCacheHote('localhost'), null);
  assert.equal(cleCacheHote('elyasmine.patisgest.dz'), 'hote:elyasmine.patisgest.dz');
});

test('hôte : domaine de service configurable (recette, autre pays)', () => {
  assert.deepEqual(resoudreHote('elyasmine.patisgest.recette.dz', 'patisgest.recette.dz'), {
    type: 'boutique', sousDomaine: 'elyasmine',
  });
});
