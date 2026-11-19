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

test('permissions : les coûts sont réservés au propriétaire', () => {
  assert.equal(canReadCosts('proprietaire'), true);
  assert.equal(canReadCosts('labo'), false);
  assert.equal(canReadCosts('vendeur'), false);
});

test('permissions : les opérations du labo restent autorisées sans lecture financière', () => {
  assert.equal(canWrite('labo'), true);
  assert.equal(canReadCosts('labo'), false);
});
