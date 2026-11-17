import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canWrite, canReadCosts } from '../src/lib/permissions.ts';

/**
 * Politique de rôles (cahier RG-15.2) — le trou corrigé ici : la lecture des
 * coûts était ouverte au vendeur (RLS + actions serveur + navigation).
 */

test('permissions : écriture réservée au propriétaire et au labo', () => {
  assert.equal(canWrite('proprietaire'), true);
  assert.equal(canWrite('labo'), true);
  assert.equal(canWrite('vendeur'), false);
});

test('permissions : les coûts ne sont jamais lisibles par le vendeur', () => {
  // C'est l'invariant de confidentialité : le vendeur voit le PV, jamais le coût.
  assert.equal(canReadCosts('proprietaire'), true);
  assert.equal(canReadCosts('labo'), true);
  assert.equal(canReadCosts('vendeur'), false);
});

test('permissions : aucun rôle ne lit les coûts sans pouvoir écrire', () => {
  // Garantit que les deux règles ne peuvent pas diverger silencieusement.
  const roles = ['proprietaire', 'labo', 'vendeur'];
  for (const r of roles) {
    assert.equal(canReadCosts(r), canWrite(r), `divergence pour ${r}`);
  }
});
