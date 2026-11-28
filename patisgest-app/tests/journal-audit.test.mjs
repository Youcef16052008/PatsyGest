// NF-10 — présentation du journal d'audit (pur, sans base).
// Ces règles décident de ce qu'un propriétaire lit réellement ; une erreur ici
// rend le journal inutilisable même si la table est correcte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  presenterJournal, libelleAction, libelleTable, quandAudit, resumeJournal,
} from '../src/lib/journal-audit.ts';
import { canReadAudit } from '../src/lib/permissions.ts';

const ligne = (o = {}) => ({
  id: '11111111-1111-1111-1111-111111111111',
  cree_le: '2026-11-23T10:30:00.000Z',
  acteur_email: 'amina@patisserie.dz',
  acteur_id: '22222222-2222-2222-2222-222222222222',
  action: 'ventes.insert',
  table_cible: 'ventes',
  ligne_id: '33333333-3333-3333-3333-333333333333',
  details: {},
  ...o,
});

test('NF-10 : seules les tables auditées ont un libellé métier', () => {
  assert.equal(libelleTable('ventes'), 'Vente');
  assert.equal(libelleTable('mouvements'), 'Mouvement de stock');
  assert.equal(libelleTable('utilisateurs'), 'Compte / rôle');
  // Une table inconnue s'affiche brute : on masque jamais une ligne d'audit.
  assert.equal(libelleTable('table_inconnue'), 'table_inconnue');
});

test('NF-10 : les trois opérations ont un libellé français', () => {
  assert.equal(libelleAction('ventes.insert', 'ventes'), 'Vente créé');
  assert.equal(libelleAction('lots.update', 'lots'), 'Lot modifié');
  assert.equal(libelleAction('clotures.delete', 'clotures'), 'Clôture supprimé');
  // Action exotique : affichée telle quelle, pas remplacée par « inconnu ».
  assert.equal(libelleAction('recalcul.menage', 'lots'), 'recalcul.menage');
});

test('NF-10 : la date est rendue en fuseau Alger, pas en UTC (R5)', () => {
  // 23:30 UTC = 00:30 le lendemain à Alger (UTC+1) : la date affichée doit
  // être le 24, pas le 23. C'est exactement l'erreur que R5 a documentée.
  const rendu = quandAudit('2026-03-10T23:30:00.000Z');
  assert.match(rendu, /11\/03\/2026|11-03-2026|11\.03\.2026/, `attendu 11/03 à Alger, reçu ${rendu}`);
  assert.doesNotMatch(rendu, /10\/03\/2026|10-03-2026/, 'date UTC utilisée comme date métier');
});

test('NF-10 : une date illisible n’est pas transformée en NaN', () => {
  assert.equal(quandAudit('pas une date'), 'pas une date');
});

test('NF-10 : la présentation distingue un humain d’une action système', () => {
  const [humain] = presenterJournal([ligne()], 1);
  assert.equal(humain.acteur, 'amina@patisserie.dz');
  assert.equal(humain.systeme, false);
  assert.equal(humain.operation, 'INSERT');
  assert.match(humain.cible, /^Vente 33333333$/);

  const [systeme] = presenterJournal([ligne({ acteur_id: null, acteur_email: 'inconnu' })], 1);
  assert.equal(systeme.systeme, true);
});

test('NF-10 : la limite de rendu est respectée (pas de page de 50 000 lignes)', () => {
  const beaucoup = Array.from({ length: 500 }, (_, i) => ligne({ id: `id-${i}` }));
  assert.equal(presenterJournal(beaucoup, 200).length, 200);
  assert.equal(presenterJournal(beaucoup, 0).length, 0);
  assert.equal(presenterJournal(beaucoup).length, 200, 'défaut = 200');
});

test('NF-10 : le résumé compte les opérations de la page', () => {
  const r = resumeJournal(presenterJournal([
    ligne({ action: 'ventes.insert' }),
    ligne({ action: 'lots.update' }),
    ligne({ action: 'clotures.delete' }),
    ligne({ action: 'ventes.insert' }),
  ]));
  assert.deepEqual(r, { creations: 2, modifications: 1, suppressions: 1 });
});

test('NF-10 : la lecture du journal est réservée au propriétaire', () => {
  assert.equal(canReadAudit('proprietaire'), true);
  assert.equal(canReadAudit('labo'), false);
  assert.equal(canReadAudit('vendeur'), false);
});
