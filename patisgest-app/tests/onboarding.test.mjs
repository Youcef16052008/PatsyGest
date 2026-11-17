import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPTEURS_VIDES, etapesOnboarding, progressionOnboarding,
} from '../src/lib/onboarding.ts';

/**
 * MOD-15 — assistant d'onboarding (US-15.3, parcours articles → fournisseurs →
 * recettes → premier OF → première vente).
 */

test('onboarding : le parcours suit l’ordre du cahier (US-15.3)', () => {
  const cles = etapesOnboarding(COMPTEURS_VIDES).map((e) => e.cle);
  assert.deepEqual(cles, [
    'matieres', 'produits', 'fournisseurs', 'recettes', 'premier-of', 'premiere-vente',
  ]);
});

test('onboarding : installation neuve — 0 %, prochaine étape = matières', () => {
  const p = progressionOnboarding(COMPTEURS_VIDES);
  assert.equal(p.faites, 0);
  assert.equal(p.total, 6);
  assert.equal(p.pourcentage, 0);
  assert.equal(p.prochaine?.cle, 'matieres');
  assert.equal(p.termine, false);
  assert.equal(p.pretAVendre, false);
});

test('onboarding : une étape déjà satisfaite n’est jamais proposée', () => {
  const p = progressionOnboarding({ ...COMPTEURS_VIDES, matieres: 8 });
  assert.equal(p.etapes.find((e) => e.cle === 'matieres')?.fait, true);
  assert.equal(p.prochaine?.cle, 'produits');
  assert.equal(p.pourcentage, 17);
});

test('onboarding : produits finis comptés à part des matières', () => {
  // 8 matières + 0 produit fini => l'étape « produits » reste à faire.
  const p = progressionOnboarding({ ...COMPTEURS_VIDES, articles: 8, matieres: 8 });
  assert.equal(p.etapes.find((e) => e.cle === 'produits')?.fait, false);
  // 8 matières + 5 produits = 13 articles.
  const q = progressionOnboarding({ ...COMPTEURS_VIDES, articles: 13, matieres: 8 });
  assert.equal(q.etapes.find((e) => e.cle === 'produits')?.fait, true);
});

test('onboarding : « prêt à vendre » ignore les étapes non bloquantes', () => {
  // Recette + matières + produits + vente possible, mais AUCUN fournisseur ni OF.
  const p = progressionOnboarding({
    ...COMPTEURS_VIDES,
    articles: 13, matieres: 8, versionsActives: 1, ventes: 1,
  });
  assert.equal(p.etapes.find((e) => e.cle === 'fournisseurs')?.fait, false);
  assert.equal(p.etapes.find((e) => e.cle === 'premier-of')?.fait, false);
  assert.equal(p.pretAVendre, true, 'fournisseur et OF ne bloquent pas la 1re vente');
});

test('onboarding : sans recette active, pas prêt à vendre (le coût serait faux)', () => {
  const p = progressionOnboarding({
    ...COMPTEURS_VIDES, articles: 13, matieres: 8, ventes: 1,
  });
  assert.equal(p.pretAVendre, false);
  assert.equal(p.prochaine?.cle, 'fournisseurs');
});

test('onboarding : parcours complet — 100 % et assistant masquable', () => {
  const p = progressionOnboarding({
    articles: 16, matieres: 9, fournisseurs: 3, famillesRecette: 2,
    versionsActives: 2, ordresFabrication: 1, ventes: 5, lots: 12,
  });
  assert.equal(p.faites, 6);
  assert.equal(p.pourcentage, 100);
  assert.equal(p.termine, true);
  assert.equal(p.prochaine, null);
  assert.equal(p.pretAVendre, true);
  assert.equal(p.etapes.every((e) => e.fait), true);
});

test('onboarding : chaque étape pointe vers un module qui existe', () => {
  const modulesValides = new Set([
    'stocks', 'achats', 'recettes', 'production', 'caisse',
  ]);
  for (const e of etapesOnboarding(COMPTEURS_VIDES)) {
    assert.equal(modulesValides.has(e.module), true, `module inconnu : ${e.module}`);
    assert.ok(e.titre.length > 0 && e.consigne.length > 0);
  }
});
