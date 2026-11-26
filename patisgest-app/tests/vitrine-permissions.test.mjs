import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  peutVitrine,
  peutEditerCatalogue,
  peutTraiterDemande,
  LIBELLES_ACTION,
} from '../src/lib/vitrine-permissions.ts';

/*
 * `vitrine-permissions.ts` — doit ÉCHOUER FERMÉ.
 *
 * Défaut mesuré : `PERMISSIONS[action].includes(role)`. Une action inconnue
 * donne `PERMISSIONS[action] === undefined` et lève un `TypeError` ; pire,
 * les clés héritées de `Object.prototype` (`__proto__`, `toString`,
 * `constructor`) renvoient un objet hérité, donc `.includes` n'est même plus
 * une fonction. Selon l'appelant, c'est un plantage ou — si une couche
 * au-dessus attrape — un refus ambigu. Une garde de permission ne doit
 * jamais dépendre d'une exception pour refuser : elle doit refuser, point.
 */

const ROLES = ['proprietaire', 'labo', 'vendeur'];

test('rôles connus : règles métier inchangées', () => {
  // Photos : propriétaire + labo (jamais le vendeur).
  assert.equal(peutVitrine('proprietaire', 'modifier_photos'), true);
  assert.equal(peutVitrine('labo', 'modifier_photos'), true);
  assert.equal(peutVitrine('vendeur', 'modifier_photos'), false);

  // Recettes : propriétaire seul.
  assert.equal(peutVitrine('proprietaire', 'ajouter_recette'), true);
  assert.equal(peutVitrine('labo', 'ajouter_recette'), false);
  assert.equal(peutVitrine('vendeur', 'supprimer_recette'), false);

  // Vendeur : seulement accepter / confirmer les demandes.
  assert.equal(peutVitrine('vendeur', 'traiter_demande'), true);
  assert.equal(peutVitrine('vendeur', 'modifier_fiche'), false);
  assert.equal(peutVitrine('vendeur', 'publier_vitrine'), false);

  // Tout le personnel voit le catalogue.
  for (const role of ROLES) assert.equal(peutVitrine(role, 'voir_catalogue'), true);
});

test('action inconnue : refus, JAMAIS une exception', () => {
  for (const action of [
    'action_inexistante',
    '',
    'VOIR_CATALOGUE',
    'voir_catalogue ',
    'modifier_photos_2',
  ]) {
    for (const role of ROLES) {
      assert.doesNotThrow(
        () => peutVitrine(role, action),
        `peutVitrine(${role}, ${JSON.stringify(action)}) a levé au lieu de refuser`,
      );
      assert.equal(
        peutVitrine(role, action), false,
        `action inconnue ${JSON.stringify(action)} accordée au rôle ${role}`,
      );
    }
  }
});

test('clés héritées de Object.prototype : refus, jamais un objet hérité', () => {
  // Ces clés sont le vrai piège : `PERMISSIONS["__proto__"]` n'est pas
  // `undefined`, c'est le prototype lui-même.
  for (const action of ['__proto__', 'toString', 'constructor', 'valueOf', 'hasOwnProperty']) {
    for (const role of ROLES) {
      assert.equal(
        peutVitrine(role, action), false,
        `clé héritée ${JSON.stringify(action)} accordée à ${role}`,
      );
    }
  }
});

test('rôle inconnu : refus (une faute de frappe ne doit pas accorder un droit)', () => {
  for (const role of ['', 'admin', 'PROPRIETAIRE', 'proprietaire ', 'root']) {
    for (const action of Object.keys(LIBELLES_ACTION).concat(['action_inexistante'])) {
      assert.equal(
        peutVitrine(role, action), false,
        `rôle inconnu ${JSON.stringify(role)} a obtenu ${action}`,
      );
    }
  }
});

test('rôle ou action null/undefined : refus sans lever', () => {
  for (const role of [null, undefined, 0, 42, {}, []]) {
    for (const action of Object.keys(LIBELLES_ACTION)) {
      assert.doesNotThrow(() => peutVitrine(role, action));
      assert.equal(peutVitrine(role, action), false);
    }
  }
  for (const action of [null, undefined, 0, 42, {}, []]) {
    for (const role of ROLES) {
      assert.doesNotThrow(() => peutVitrine(role, action));
      assert.equal(peutVitrine(role, action), false);
    }
  }
});

test('les helpers dérivés héritent du refus', () => {
  // `peutEditerCatalogue`/`peutTraiterDemande` passent par peutVitrine :
  // ils ne doivent pas rouvrir la faille par un chemin détourné.
  assert.equal(peutEditerCatalogue('vendeur'), false);
  assert.equal(peutEditerCatalogue('labo'), true);
  assert.equal(peutTraiterDemande('vendeur'), true);
  assert.equal(peutTraiterDemande('inconnu'), false);
});

test('chaque action déclarée a un libellé (pas d’action orpheline)', () => {
  const actions = Object.keys(LIBELLES_ACTION).sort();
  assert.deepEqual(actions, [
    'ajouter_recette', 'modifier_fiche', 'modifier_photos', 'publier_vitrine',
    'supprimer_recette', 'traiter_demande', 'voir_catalogue',
  ]);
  // 7 actions, et chacune est reconnue par peutVitrine pour au moins un rôle.
  for (const action of actions) {
    assert.equal(
      ROLES.some((r) => peutVitrine(r, action)), true,
      `action ${action} n'est accordée à aucun rôle : entrée morte ou faute de frappe`,
    );
  }
});
