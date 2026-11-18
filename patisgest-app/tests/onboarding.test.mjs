import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COMPTEURS_VIDES, etapesOnboarding, progressionOnboarding,
  lienGuide, etapePourModule, etapeApres, prerequisManquant,
} from '../src/lib/onboarding.ts';

const progression = (compteurs = {}) => progressionOnboarding({ ...COMPTEURS_VIDES, ...compteurs });
const etape = (p, cle) => p.etapes.find((e) => e.cle === cle);

/** MOD-15 — assistant US-15.3 : les coches viennent des enregistrements métier. */
test('onboarding : les six étapes suivent l’ordre du cahier', () => {
  assert.deepEqual(etapesOnboarding(COMPTEURS_VIDES).map((e) => e.cle), [
    'matieres', 'produits', 'fournisseurs', 'recettes', 'premier-of', 'premiere-vente',
  ]);
});

test('onboarding : installation neuve — 0/6, prochaine étape = ingrédients', () => {
  const p = progression();
  assert.equal(p.faites, 0);
  assert.equal(p.total, 6);
  assert.equal(p.prochaine.cle, 'matieres');
  assert.equal(lienGuide(p.prochaine), '/stocks?guide=matieres#formulaire-matieres');
});

test('onboarding : créer une matière ne coche pas aussi le produit', () => {
  const p = progression({ matieres: 8 });
  assert.equal(etape(p, 'matieres').fait, true);
  assert.equal(etape(p, 'produits').fait, false);
  assert.equal(p.faites, 1);
  assert.equal(p.prochaine.cle, 'produits');
  assert.equal(lienGuide(p.prochaine), '/stocks?guide=produits#formulaire-produits');
});

test('onboarding : aucun cycle obligataire de recette vers fournisseur ou fabrication', () => {
  const p = progression({ matieres: 8, produits: 5, versionsActives: 1 });
  assert.equal(p.prochaine.cle, 'fournisseurs');
  assert.equal(etape(p, 'premier-of').fait, false);
  assert.equal(prerequisManquant(p, etape(p, 'premiere-vente')), undefined);
  assert.equal(etapeApres(p, etape(p, 'premier-of'), false).cle, 'premiere-vente');
  assert.equal(p.faites, 3, 'passer une étape ne la coche pas');
});

test('onboarding : sans recette active, le guide ne propose pas d’encaisser', () => {
  const p = progression({ matieres: 8, produits: 5, fournisseurs: 1, ordresFabrication: 1 });
  assert.equal(prerequisManquant(p, etape(p, 'premiere-vente')).cle, 'recettes');
  assert.equal(p.prochaine.cle, 'recettes');
  assert.equal(p.faites, 4);
});

test('onboarding : on revient aux étapes facultatives encore ouvertes après la dernière vente', () => {
  const p = progression({ matieres: 8, produits: 5, versionsActives: 1, ventes: 1 });
  assert.equal(etapeApres(p, etape(p, 'premiere-vente')).cle, 'fournisseurs');
  assert.equal(etapeApres(p, etape(p, 'premiere-vente'), false), undefined);
});

test('onboarding : parcours complet — 6/6, plus d’étape ni de relance', () => {
  const p = progression({ matieres: 9, produits: 7, fournisseurs: 3, versionsActives: 2, ordresFabrication: 1, ventes: 5 });
  assert.equal(p.faites, 6);
  assert.equal(p.prochaine, null);
  assert.equal(p.etapes.every((e) => e.fait), true);
  assert.equal(etapeApres(p, etape(p, 'premiere-vente')), undefined);
});

test('onboarding : chaque repère a un visuel court, un module et une ancre distincte', () => {
  const ancres = new Set();
  for (const e of etapesOnboarding(COMPTEURS_VIDES)) {
    assert.equal(etapePourModule(e.module, e.cle), e.cle);
    assert.equal(e.visuel.length, 3);
    assert.ok(`${e.titre} ${e.consigne}`.split(/\s+/).length <= 15);
    assert.ok(!ancres.has(e.ancre));
    ancres.add(e.ancre);
  }
});

test('onboarding : les URL mal formées ou d’un autre module sont ignorées', () => {
  assert.equal(etapePourModule('stocks', 'recettes'), undefined);
  assert.equal(etapePourModule('stocks', ['matieres', 'produits']), undefined);
  assert.equal(etapePourModule('stocks', 'constructor'), undefined);
  assert.equal(etapePourModule('stocks', undefined), undefined);
});
