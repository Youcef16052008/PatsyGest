import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMAILS, preambule, PEUT_LIRE_COUTS, PEUT_ECRIRE_IDENTITE, PEUT_ECRIRE_STOCK, ecartsPolitique,
} from '../src/lib/rls-probe.ts';

/**
 * Ces tests protègent le protocole de test RLS lui-même.
 * Un test RLS faux est pire qu'aucun test : il donne une fausse assurance.
 */

test('rls-probe : le préambule bascule RÉELLEMENT le rôle (piège n°1)', () => {
  // La session du connecteur SQL est postgres, superutilisateur : elle
  // contourne la RLS. Sans ce basculement, un test RLS ne teste rien.
  for (const p of ['vendeur', 'labo', 'proprietaire']) {
    const sql = preambule(p);
    assert.ok(/set_config\('role',\s*'authenticated'/.test(sql), `${p} : rôle non basculé`);
    assert.ok(/request\.jwt\.claims/.test(sql), `${p} : JWT non posé`);
    assert.ok(/auth\.uid\(\)|auth_user_id/.test(sql));
  }
});

test('rls-probe : jamais set_config(\'role\',\'none\') (piège n°2)', () => {
  // `none` signifie « garde ton rôle actuel » : les écritures passaient en
  // postgres et le test concluait à une fuite inexistante.
  for (const p of ['anon', 'vendeur', 'labo', 'proprietaire']) {
    assert.equal(/set_config\('role',\s*'none'/.test(preambule(p)), false, `${p} : rôle « none »`);
  }
});

test('rls-probe : anon n\'a aucun claim et tourne en rôle anon', () => {
  const sql = preambule('anon');
  assert.ok(/set_config\('role',\s*'anon'/.test(sql));
  assert.ok(/set_config\('request\.jwt\.claims',\s*'',\s*true\)/.test(sql), 'anon ne doit porter aucun JWT');
});

test('rls-probe : les emails des personas sont ceux de la base (pas l\'ancien mapping inversé)', () => {
  // Le mapping d'origine du projet était INVERSE (amina=vendeur, amine=proprio).
  // La vérité est en base : amina propriétaire, sara labo, amine vendeur.
  assert.equal(EMAILS.proprietaire, 'amina@patisserie.dz');
  assert.equal(EMAILS.labo, 'sara@patisserie.dz');
  assert.equal(EMAILS.vendeur, 'amine@patisserie.dz');
});

test('rls-probe : seule la propriétaire peut écrire l\'identité légale', () => {
  assert.equal(PEUT_ECRIRE_IDENTITE.proprietaire, true);
  assert.equal(PEUT_ECRIRE_IDENTITE.labo, false);
  assert.equal(PEUT_ECRIRE_IDENTITE.vendeur, false);
  assert.equal(PEUT_ECRIRE_IDENTITE.anon, false);
});

test('rls-probe : les coûts sont lisibles par propriétaire et labo seulement', () => {
  assert.equal(PEUT_LIRE_COUTS.proprietaire, true);
  assert.equal(PEUT_LIRE_COUTS.labo, true);
  assert.equal(PEUT_LIRE_COUTS.vendeur, false);
  assert.equal(PEUT_LIRE_COUTS.anon, false);
});

test('rls-probe : le vendeur encaisse mais ne réceptionne pas de stock', () => {
  assert.equal(PEUT_ECRIRE_STOCK.vendeur, false);
  assert.equal(PEUT_ECRIRE_STOCK.labo, true);
});

test('rls-probe : une fuite de coût est signalée', () => {
  const e = ecartsPolitique('vendeur', { couts: 2, identiteModifiee: 0, stockModifie: 0 });
  assert.equal(e.length, 1);
  assert.ok(/FUITE/.test(e[0]));
});

test('rls-probe : une modification d\'identité par le labo est signalée', () => {
  // C'est exactement ce que mon premier test a cru voir (à tort : la session
  // tournait en postgres et contournait la RLS).
  const e = ecartsPolitique('labo', { couts: 2, identiteModifiee: 1, stockModifie: 0 });
  assert.ok(e.some((x) => /identité légale/.test(x) && /FUITE/.test(x)));
});

test('rls-probe : une écriture de stock par le vendeur est signalée', () => {
  const e = ecartsPolitique('vendeur', { couts: 0, identiteModifiee: 0, stockModifie: 3 });
  assert.ok(e.some((x) => /stock/.test(x) && /FUITE/.test(x)));
});

test('rls-probe : les relevés conformes ne produisent aucun écart', () => {
  assert.deepEqual(ecartsPolitique('vendeur', { couts: 0, identiteModifiee: 0, stockModifie: 0 }), []);
  assert.deepEqual(ecartsPolitique('labo', { couts: 2, identiteModifiee: 0, stockModifie: 1 }), []);
  assert.deepEqual(ecartsPolitique('proprietaire', { couts: 2, identiteModifiee: 1, stockModifie: 1 }), []);
  assert.deepEqual(ecartsPolitique('anon', { couts: 0, identiteModifiee: 0, stockModifie: 0 }), []);
});

test('rls-probe : un propriétaire qui ne peut plus écrire est aussi un écart', () => {
  const e = ecartsPolitique('proprietaire', { couts: 0, identiteModifiee: 0, stockModifie: 0 });
  assert.equal(e.length, 3, 'lire 0 coût et écrire 0 ligne doit alerter');
});
