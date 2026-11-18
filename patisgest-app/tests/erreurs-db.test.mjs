import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageUtilisateur, estErreurMetier, detailTechnique, echecHttpReessayable } from '../src/lib/erreurs-db.ts';

/**
 * Sprint 6 — durcissement : ne jamais exposer le schéma Postgres à l'écran.
 */

test('erreurs : un message métier (P0001) est affiché tel quel', () => {
  const e = { code: 'P0001', message: 'Conversion d unite manquante : g -> kg (MP-FAR).' };
  assert.equal(estErreurMetier(e), true);
  assert.equal(
    messageUtilisateur(e, 'Recette refusée'),
    'Recette refusée : Conversion d unite manquante : g -> kg (MP-FAR).',
  );
});

test('erreurs : la violation de contrainte n’expose pas le nom de l’index', () => {
  const e = {
    code: '23505',
    message: 'duplicate key value violates unique constraint "ofs_client_ref_uniq"',
  };
  const msg = messageUtilisateur(e, 'Création refusée');
  assert.equal(msg.includes('ofs_client_ref_uniq'), false, 'le nom de l’index ne doit pas fuiter');
  assert.equal(msg.includes('23505'), false);
  assert.ok(msg.startsWith('Création refusée :'));
});

test('erreurs : permission refusée ne révèle pas le nom de table', () => {
  const e = { code: '42501', message: 'permission denied for table parametres_couts' };
  const msg = messageUtilisateur(e, 'Export refusé');
  assert.equal(msg.includes('parametres_couts'), false);
  assert.ok(/administrateur/i.test(msg));
});

test('erreurs : table inexistante (déploiement incomplet) ne fuit pas le schéma', () => {
  const e = { code: '42P01', message: 'relation "public.recette_versions" does not exist' };
  const msg = messageUtilisateur(e, 'Chargement impossible');
  assert.equal(msg.includes('recette_versions'), false);
  assert.equal(msg.includes('relation'), false);
});

test('erreurs : panne réseau / réponse vide → message actionnable', () => {
  assert.ok(/connexion/i.test(messageUtilisateur(null, 'Vente refusée')));
  assert.ok(/connexion/i.test(messageUtilisateur({ code: 'PGRST301' }, 'Vente refusée')));
});

test('erreurs : code inconnu → message générique avec demande de support', () => {
  const msg = messageUtilisateur({ code: 'XX999', message: 'internal boom' }, 'Opération');
  assert.equal(msg.includes('internal boom'), false);
  assert.ok(/support/i.test(msg));
});

test('erreurs : P0001 sans message n’est pas considéré comme métier', () => {
  assert.equal(estErreurMetier({ code: 'P0001', message: '' }), false);
  assert.equal(estErreurMetier({ code: 'P0001' }), false);
  assert.equal(estErreurMetier(null), false);
});

test('erreurs : le détail technique reste disponible pour les logs', () => {
  assert.equal(detailTechnique({ code: '23505', message: 'duplicate key' }), '23505 duplicate key');
  assert.equal(detailTechnique(null), 'sans-code sans message');
});

test('erreurs-db : un NOT NULL (23502) parle de fichier incomplet, sans jargon Postgres', () => {
  const m = messageUtilisateur({ code: '23502', message: 'null value in column "pu" violates not-null constraint' }, 'Restauration refusée');
  assert.ok(/incomplet|modifié/.test(m), 'le message doit orienter vers la cause réelle');
  assert.equal(/column|constraint|pu\b/.test(m), false, 'aucun jargon Postgres à l’écran');
});

test('erreurs : un retour réseau incertain n’efface pas une opération en attente', () => {
  for (const statut of [0, 401, 429, 500, 502, 503, 504]) assert.equal(echecHttpReessayable(statut), true);
  for (const statut of [200, 400, 403, 409, 422]) assert.equal(echecHttpReessayable(statut), false);
});
