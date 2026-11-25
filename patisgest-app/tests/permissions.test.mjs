import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ROLES_LABO_VENDEUR_ACTIFS,
  canAccessModule,
  canCreateOrEditCakeQuotes,
  canDeleteRecipes,
  canManageCreditsAdmin,
  canManagePrices,
  canReadAudit,
  canReadCosts,
  canSellAtPos,
  canUseCredits,
  canWrite,
  roleDisponible,
} from '../src/lib/permissions.ts';

test('permissions : activation des trois rôles (propriétaire, labo, vendeur)', () => {
  assert.equal(ROLES_LABO_VENDEUR_ACTIFS, true);
  assert.equal(roleDisponible('proprietaire'), true);
  assert.equal(roleDisponible('labo'), true);
  assert.equal(roleDisponible('vendeur'), true);
});

test('permissions : écriture stock/production réservée au propriétaire et au labo', () => {
  assert.equal(canWrite('proprietaire'), true);
  assert.equal(canWrite('labo'), true);
  assert.equal(canWrite('vendeur'), false);
});

test('permissions : coûts, prix, devis chiffrés, suppression recettes et audit réservés au propriétaire', () => {
  assert.equal(canReadCosts('proprietaire'), true);
  assert.equal(canReadCosts('labo'), false);
  assert.equal(canReadCosts('vendeur'), false);

  assert.equal(canManagePrices('proprietaire'), true);
  assert.equal(canManagePrices('labo'), false);
  assert.equal(canManagePrices('vendeur'), false);

  assert.equal(canCreateOrEditCakeQuotes('proprietaire'), true);
  assert.equal(canCreateOrEditCakeQuotes('labo'), false);
  assert.equal(canCreateOrEditCakeQuotes('vendeur'), false);

  assert.equal(canManageCreditsAdmin('proprietaire'), true);
  assert.equal(canManageCreditsAdmin('labo'), false);
  assert.equal(canManageCreditsAdmin('vendeur'), false);

  assert.equal(canDeleteRecipes('proprietaire'), true);
  assert.equal(canDeleteRecipes('labo'), false);
  assert.equal(canDeleteRecipes('vendeur'), false);

  assert.equal(canReadAudit('proprietaire'), true);
  assert.equal(canReadAudit('labo'), false);
  assert.equal(canReadAudit('vendeur'), false);
});

test('permissions : caisse et crédits ouverts au comptoir (propriétaire + vendeur), fermés au labo', () => {
  assert.equal(canSellAtPos('proprietaire'), true);
  assert.equal(canSellAtPos('vendeur'), true);
  assert.equal(canSellAtPos('labo'), false);

  assert.equal(canUseCredits('proprietaire'), true);
  assert.equal(canUseCredits('vendeur'), true);
  assert.equal(canUseCredits('labo'), false);
});

test('permissions : matrice d’accès aux modules par rôle', () => {
  // Vendeur : caisse, cake-design, cloture, stocks uniquement
  for (const mod of ['caisse', 'cake-design', 'cloture', 'stocks']) {
    assert.equal(canAccessModule('vendeur', mod), true, `vendeur devrait accéder à ${mod}`);
  }
  for (const mod of ['production', 'recettes', 'achats', 'transferts', 'planning', 'tracabilite', 'qualite', 'simulation']) {
    assert.equal(canAccessModule('vendeur', mod), false, `vendeur ne doit pas accéder à ${mod}`);
  }

  // Labo : atelier & recettes sans coûts ; bloqué de caisse, cloture, simulation
  for (const mod of ['stocks', 'achats', 'recettes', 'production', 'transferts', 'planning', 'tracabilite', 'cake-design', 'qualite']) {
    assert.equal(canAccessModule('labo', mod), true, `labo devrait accéder à ${mod}`);
  }
  for (const mod of ['caisse', 'cloture', 'simulation']) {
    assert.equal(canAccessModule('labo', mod), false, `labo ne doit pas accéder à ${mod}`);
  }
});
