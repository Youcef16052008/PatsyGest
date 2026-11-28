import { test } from 'node:test';
import assert from 'node:assert/strict';
import { choisirVersionsActives } from '../src/lib/tomorrow-lab-private-server.ts';

/* H16-09 : la sélection de version active n'est plus une ligne dense non testée. */

const version = (id, produitId, numero, active = true) => ({
  id,
  familleId: `f-${produitId}`,
  familleCode: 'F',
  familleNom: 'Famille',
  produitId,
  pvHt: 0,
  version: numero,
  active,
  rendementQte: 1,
  rendementUnite: 'kg',
  cuissonPct: 0,
  moMin: 0,
  tauxHoraire: 0,
  chargesPct: 0,
  emballage: 0,
  energie: 0,
  fraisGeneraux: 0,
  ingredients: [],
});

test('H16-09 : la version active de numéro maximal gagne par produit', () => {
  const actives = choisirVersionsActives([
    version('v1', 'p1', 1),
    version('v3', 'p1', 3),
    version('v2', 'p1', 2),
    version('inactive', 'p1', 9, false),
    version('sans-produit', null, 9),
    version('autre', 'p2', 1),
  ]);
  assert.equal(actives.get('p1')?.id, 'v3');
  assert.equal(actives.get('p2')?.id, 'autre');
  assert.equal(actives.size, 2);
});

test('H16-09 : aucune version active utilisable donne une carte vide', () => {
  const actives = choisirVersionsActives([
    version('inactive', 'p1', 9, false),
    version('sans-produit', null, 9),
  ]);
  assert.equal(actives.size, 0);
});
