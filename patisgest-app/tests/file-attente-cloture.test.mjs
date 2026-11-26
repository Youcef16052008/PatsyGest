import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compterVentesEnAttente, messageAttenteCloture, PREFIXE_FILE } from '../src/lib/file-attente-cloture.ts';

/** Faux Storage minimal, comme un vrai : length / key(i) / getItem. */
function fauxStorage(entrees) {
  const cles = Object.keys(entrees);
  return {
    get length() { return cles.length; },
    key: (i) => cles[i] ?? null,
    getItem: (k) => (k in entrees ? entrees[k] : null),
  };
}

test('file vide ou absente : rien à signaler', () => {
  assert.deepEqual(compterVentesEnAttente(fauxStorage({})), { tickets: 0, illisible: false });
  assert.equal(messageAttenteCloture({ tickets: 0, illisible: false }), null);
});

test('tickets en attente : comptés, message explicite', () => {
  const s = fauxStorage({
    [`${PREFIXE_FILE}.c1.u1`]: JSON.stringify([{ ticket: 'a' }, { ticket: 'b' }]),
    [`${PREFIXE_FILE}.c1.u2`]: JSON.stringify([{ ticket: 'c' }]),
    'autre.cle': 'ignorée',
  });
  assert.deepEqual(compterVentesEnAttente(s), { tickets: 3, illisible: false });
  const msg = messageAttenteCloture({ tickets: 3, illisible: false });
  assert.match(msg, /3 ventes ne sont pas encore synchronisées/);
  // Une seule vente : accord au singulier.
  assert.match(messageAttenteCloture({ tickets: 1, illisible: false }), /^1 vente n’est pas encore synchronisée/);
});

test('JSON corrompu : signalé, jamais levé', () => {
  const s = fauxStorage({ [`${PREFIXE_FILE}.c1.u1`]: '{pas du json' });
  assert.deepEqual(compterVentesEnAttente(s), { tickets: 0, illisible: true });
  assert.match(messageAttenteCloture({ tickets: 0, illisible: true }), /illisible/);
});

test('contenu inattendu (objet au lieu de tableau) : signalé', () => {
  const s = fauxStorage({ [`${PREFIXE_FILE}.x`]: JSON.stringify({ ticket: 'a' }) });
  assert.deepEqual(compterVentesEnAttente(s), { tickets: 0, illisible: true });
});

test('storage inaccessible : pas de crash, signalement prudent', () => {
  const casse = {
    get length() { throw new Error('SecurityError'); },
    key: () => null,
    getItem: () => null,
  };
  assert.deepEqual(compterVentesEnAttente(casse), { tickets: 0, illisible: true });
});

test('les autres clés du site ne sont jamais comptées', () => {
  const s = fauxStorage({
    'patisgest-credits.v1': JSON.stringify([{ ticket: 'faux' }]),
    'patisgest.saleQueue.v2.old': JSON.stringify([{ ticket: 'faux2' }]),
    [`${PREFIXE_FILE}.c1.u1`]: JSON.stringify([{ ticket: 'vrai' }]),
  });
  assert.deepEqual(compterVentesEnAttente(s), { tickets: 1, illisible: false });
});
