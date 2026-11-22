// Tests d'exécution des gardes de rôle (actions et routes).
//
// Ils remplacent les vérifications textuelles de `securite.test.mjs` qui
// lisaient le code source : ici l'action est réellement exécutée avec une
// session et un client Supabase factices, et l'on vérifie que la base n'est
// PAS appelée quand le rôle est refusé (et qu'elle l'est, avec le bon
// paramétrage, quand il est accepté).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installer, session, fauxClient } from './harness-execution.mjs';

const PROPRIETAIRE = session({ role: 'proprietaire' });
const LABO = session({ role: 'labo' });
const VENDEUR = session({ role: 'vendeur' });

const ARTICLE = '33333333-3333-4333-8333-333333333333';
const SITE_A = '44444444-4444-4444-8444-444444444444';
const SITE_B = '55555555-5555-4555-8555-555555555555';

test('action achats : un vendeur ne crée pas de fournisseur (aucun appel base)', async () => {
  const client = fauxClient();
  installer({ session: VENDEUR, client });
  const { createFournisseur } = await import('../src/lib/actions-achats.ts');
  const fd = new FormData();
  fd.set('nom', 'Fournisseur X');
  const r = await createFournisseur({}, fd);
  assert.equal(r.erreur, 'Réservé aux rôles propriétaire et labo.');
  assert.deepEqual(client.appels, []);
});

test('action achats : le propriétaire écrit dans fournisseurs avec son client_id', async () => {
  const client = fauxClient();
  installer({ session: PROPRIETAIRE, client });
  const { createFournisseur } = await import('../src/lib/actions-achats.ts');
  const fd = new FormData();
  fd.set('nom', 'Fournisseur X');
  const r = await createFournisseur({}, fd);
  assert.equal(r.erreur, undefined);
  assert.equal(r.succes, 'Fournisseur « Fournisseur X » ajouté.');
  assert.deepEqual(client.appels, [
    { op: 'from', table: 'fournisseurs' },
    { op: 'insert', args: [{ client_id: PROPRIETAIRE.clientId, nom: 'Fournisseur X' }] },
  ]);
});

test('action achats : un vendeur ne crée pas de bon de commande (aucun appel base)', async () => {
  const client = fauxClient();
  installer({ session: VENDEUR, client });
  const { createCommandeReal } = await import('../src/lib/actions-achats.ts');
  const r = await createCommandeReal({}, new FormData());
  assert.equal(r.erreur, 'Réservé aux rôles propriétaire et labo.');
  assert.deepEqual(client.appels, []);
});

test('action coûts : le labo et le vendeur sont refusés sans appel base', async () => {
  const { ficheCoutReal } = await import('../src/lib/actions-couts.ts');
  for (const ctx of [LABO, VENDEUR]) {
    const client = fauxClient();
    installer({ session: ctx, client });
    const fd = new FormData();
    fd.set('produitId', ARTICLE);
    fd.set('qte', '1');
    const r = await ficheCoutReal({}, fd);
    assert.equal(r.erreur, 'Coûts de revient réservés aux rôles propriétaire et labo.');
    assert.deepEqual(client.appels, [], `aucun appel base pour le rôle ${ctx.role}`);
  }
});

test('action coûts : les paramètres RC-04 sont refusés au vendeur sans appel base', async () => {
  const client = fauxClient();
  installer({ session: VENDEUR, client });
  const { sauverParamsCoutsReal } = await import('../src/lib/actions-couts.ts');
  const r = await sauverParamsCoutsReal({}, new FormData());
  assert.equal(r.erreur, 'Réservé aux rôles propriétaire et labo.');
  assert.deepEqual(client.appels, []);
});

test('action coûts : l’analyse de hausse est refusée au labo sans appel base', async () => {
  const client = fauxClient();
  installer({ session: LABO, client });
  const { analyserHausseMatiereReal } = await import('../src/lib/actions-couts.ts');
  const r = await analyserHausseMatiereReal({}, new FormData());
  assert.equal(r.erreur, 'Analyse des coûts réservée aux rôles propriétaire et labo.');
  assert.deepEqual(client.appels, []);
});

test('action simulation : le labo est refusé sans appel base', async () => {
  const client = fauxClient();
  installer({ session: LABO, client });
  const { simulerReal } = await import('../src/lib/actions-simulation.ts');
  const fd = new FormData();
  fd.set('produitId', ARTICLE);
  fd.set('qte', '1');
  const r = await simulerReal({}, fd);
  assert.equal(r.erreur, 'Coûts de revient réservés aux rôles propriétaire et labo.');
  assert.deepEqual(client.appels, []);
});

test('action stock : un vendeur ne crée ni article ni lot (aucun appel base)', async () => {
  const { createArticle, receiveLot } = await import('../src/lib/actions-stock.ts');
  for (const action of [createArticle, receiveLot]) {
    const client = fauxClient();
    installer({ session: VENDEUR, client });
    const r = await action({}, new FormData());
    assert.equal(r.erreur, 'Accès refusé : rôle propriétaire ou laboratoire requis.');
    assert.deepEqual(client.appels, []);
  }
});

test('action transfert : un vendeur est refusé sans appel base', async () => {
  const client = fauxClient();
  installer({ session: VENDEUR, client });
  const { transferReal } = await import('../src/lib/actions-stock.ts');
  const r = await transferReal({}, new FormData());
  assert.equal(r.erreur, 'Réservé aux rôles propriétaire et labo.');
  assert.deepEqual(client.appels, []);
});

test('action transfert : le propriétaire avec clientRef appelle transferer_article_ref', async () => {
  const client = fauxClient({ data: { transfert_id: '22222222-2222-4222-8222-222222222222', ref: 'T-1', lots: 1 } });
  installer({ session: PROPRIETAIRE, client });
  const { transferReal } = await import('../src/lib/actions-stock.ts');
  const fd = new FormData();
  fd.set('articleId', ARTICLE);
  fd.set('fromSiteId', SITE_A);
  fd.set('toSiteId', SITE_B);
  fd.set('qte', '2');
  fd.set('motif', 'Réassort');
  fd.set('clientRef', 'ref-unique-1');
  const r = await transferReal({}, fd);
  assert.equal(r.erreur, undefined);
  const rpcs = client.appels.filter((a) => a.op === 'rpc');
  assert.equal(rpcs.length, 1);
  assert.equal(rpcs[0].nom, 'transferer_article_ref');
  assert.equal(rpcs[0].args.p_client_ref, 'ref-unique-1');
});

test('action transfert : sans clientRef, la RPC historique est appelée', async () => {
  const client = fauxClient({ data: { transfert_id: '22222222-2222-4222-8222-222222222222', ref: 'T-2', lots: 1 } });
  installer({ session: PROPRIETAIRE, client });
  const { transferReal } = await import('../src/lib/actions-stock.ts');
  const fd = new FormData();
  fd.set('articleId', ARTICLE);
  fd.set('fromSiteId', SITE_A);
  fd.set('toSiteId', SITE_B);
  fd.set('qte', '2');
  const r = await transferReal({}, fd);
  assert.equal(r.erreur, undefined);
  const rpcs = client.appels.filter((a) => a.op === 'rpc');
  assert.deepEqual(rpcs.map((x) => x.nom), ['transferer_article']);
});

test('action transfert : la RPC 37 absente replie sur transferer_article', async () => {
  const client = fauxClient({
    rpc: (nom) => (nom === 'transferer_article_ref'
      ? { data: null, error: { code: 'PGRST202', message: 'fonction absente' } }
      : { data: { transfert_id: '22222222-2222-4222-8222-222222222222', ref: 'T-3', lots: 1 }, error: null }),
  });
  installer({ session: PROPRIETAIRE, client });
  const { transferReal } = await import('../src/lib/actions-stock.ts');
  const fd = new FormData();
  fd.set('articleId', ARTICLE);
  fd.set('fromSiteId', SITE_A);
  fd.set('toSiteId', SITE_B);
  fd.set('qte', '2');
  fd.set('clientRef', 'ref-unique-2');
  const r = await transferReal({}, fd);
  assert.equal(r.erreur, undefined);
  const rpcs = client.appels.filter((a) => a.op === 'rpc');
  assert.deepEqual(rpcs.map((x) => x.nom), ['transferer_article_ref', 'transferer_article']);
});

test('action restauration : non-propriétaire refusé sans appel base', async () => {
  const { confirmerRestauration } = await import('../src/lib/actions-restauration.ts');
  for (const ctx of [LABO, VENDEUR]) {
    const client = fauxClient();
    installer({ session: ctx, client });
    const r = await confirmerRestauration({}, new FormData());
    assert.equal(r.erreur, 'Restauration réservée au propriétaire.');
    assert.deepEqual(client.appels, []);
  }
});

test('action restauration : sans confirmation, aucun appel base', async () => {
  const client = fauxClient();
  installer({ session: PROPRIETAIRE, client });
  const { confirmerRestauration } = await import('../src/lib/actions-restauration.ts');
  const r = await confirmerRestauration({}, new FormData());
  assert.equal(r.erreur, 'Tapez RESTAURER pour confirmer.');
  assert.deepEqual(client.appels, []);
});
