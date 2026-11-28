// VAGUE 2 — actions serveur mockées (H05-11, H07-04).
// Fichier séparé de `vague2-preuves.test.mjs` : le harnais `mock.module`
// intercepte la résolution des paquets CommonJS, dont PGlite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installer, session, fauxClient } from './harness-execution.mjs';

const { saveFreeRecipeCloud } = await import('../src/lib/actions-free-recipes.ts');
const { sellCart } = await import('../src/lib/actions-caisse.ts');

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';

function forme(entries) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, String(v));
  return fd;
}

test('H05-11 : un prix de recette négatif est refusé, 0 reste le sentinelle', async () => {
  const base = {
    id: 'r1', nom: 'Test', portions: 1, unitePortion: 'parts',
    emballageDa: 0, cuissonMoDa: 0, notes: '', ingredients: [], updatedAt: '2026-11-27',
  };
  const negatif = fauxClient({ data: null, error: null });
  installer({ session: session(), client: negatif });
  const r = await saveFreeRecipeCloud({ ...base, prixVenteDa: -500 });
  assert.equal(r.ok, false);
  assert.match(r.erreur, /Prix de vente invalide/);
  assert.equal(negatif.appels.filter((a) => a.op === 'from').length, 0, 'la base ne doit pas être appelée');

  const zero = fauxClient({ data: null, error: null });
  installer({ session: session(), client: zero });
  const z = await saveFreeRecipeCloud({ ...base, prixVenteDa: 0 });
  assert.equal(z.ok, true, '0 = prix non renseigné, toujours accepté');
  assert.ok(zero.appels.some((a) => a.op === 'insert'));
});

test('H07-04 : le repli vendre_article ne transforme pas un virement en espèces', async () => {
  const vente = { sale_id: 's1', duplicate: false, modePaiement: 'especes', totalHT: 0, totalTTC: 0, lots: [] };
  const absent = { code: 'PGRST202', message: 'fonction absente' };
  const client = fauxClient({
    rpc: (nom) => nom === 'vendre_panier'
      ? { data: null, error: absent, status: 404 }
      : { data: vente, error: null, status: 200 },
  });
  installer({ session: session(), client });
  const fd = forme({
    expectedClientId: '11111111-1111-4111-8111-111111111111',
    expectedAuthUserId: 'auth-1',
    siteId: UUID,
    ticket: UUID2,
    modePaiement: 'cheque_virement',
    lignesJson: JSON.stringify([{ articleId: UUID, qte: 1 }]),
  });
  const r = await sellCart({}, fd);
  assert.match(r.erreur, /Migration SQL 21 requise/);
  const rpcs = client.appels.filter((a) => a.op === 'rpc');
  assert.equal(rpcs.length, 1, 'aucun appel vendre_article ne doit être fait');
  assert.equal(rpcs[0].nom, 'vendre_panier');

  // Non-régression : le repli « especes » reste disponible sur une base pré-21.
  const clientEspeces = fauxClient({
    rpc: (nom) => nom === 'vendre_panier'
      ? { data: null, error: absent, status: 404 }
      : { data: vente, error: null, status: 200 },
  });
  installer({ session: session(), client: clientEspeces });
  const fdEspeces = forme({
    expectedClientId: '11111111-1111-4111-8111-111111111111',
    expectedAuthUserId: 'auth-1',
    siteId: UUID,
    ticket: UUID2,
    modePaiement: 'especes',
    lignesJson: JSON.stringify([{ articleId: UUID, qte: 1 }]),
  });
  const ok = await sellCart({}, fdEspeces);
  assert.equal(ok.erreur, undefined);
  assert.equal(clientEspeces.appels.filter((a) => a.op === 'rpc').length, 2);
});
