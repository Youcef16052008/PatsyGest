import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeQualityAlerts } from '../src/lib/quality-alerts.ts';

const vide = { today: '2026-11-17', temperatures: [], nettoyages: [], nonConformites: [], lots: [], taches: [] };
const niveaux = (alerts) => alerts.map((a) => a.niveau);

test('qualité : aucun rappel sur input vide', () => {
  assert.deepEqual(computeQualityAlerts(vide), []);
});

test('qualité : température au-dessus du seuil = critique, sous le seuil = rien', () => {
  const out = computeQualityAlerts({
    ...vide,
    temperatures: [
      { frigoNom: 'Chambre froide', dateReleve: '2026-11-17T08:00:00', temperature: 9, seuilMax: 4 },
      { frigoNom: 'Vitrine', dateReleve: '2026-11-17T08:00:00', temperature: 3, seuilMax: 6 },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].niveau, 'critique');
  assert.match(out[0].titre, /Chambre froide/);
});

test('qualité : frigo sans relevé du jour = attention', () => {
  const out = computeQualityAlerts({
    ...vide,
    temperatures: [{ frigoNom: 'Chambre froide', dateReleve: '2026-11-15T08:00:00', temperature: 2, seuilMax: 4 }],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].niveau, 'attention');
  assert.match(out[0].titre, /Relevé manquant/);
});

test('qualité : nettoyage non fait avant aujourd’hui = alerte ; fait ou futur ignorés', () => {
  const out = computeQualityAlerts({
    ...vide,
    nettoyages: [
      { zone: 'Plan de travail', dateNettoyage: '2026-11-16', fait: false },
      { zone: 'Four', dateNettoyage: '2026-11-16', fait: true },
      { zone: 'Four', dateNettoyage: '2026-11-18', fait: false },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].niveau, 'alerte');
  assert.match(out[0].titre, /Plan de travail/);
});

test('qualité : NC ouverte alertée, clôturée ignorée (tous statuts)', () => {
  const out = computeQualityAlerts({
    ...vide,
    nonConformites: [
      { type: 'Température', lotNumero: 'LOT-9', statut: 'Ouverte', dateNc: '2026-11-16' },
      { type: 'Goût', lotNumero: 'LOT-8', statut: 'Clôturée', dateNc: '2026-11-10' },
      { type: 'Pesée', lotNumero: 'LOT-7', statut: 'cloturee', dateNc: '2026-11-11' },
    ],
  });
  assert.equal(out.length, 1);
  assert.match(out[0].titre, /Température/);
});

test('qualité : DLC expirée critique, dans7 jours attention, lot bloqué ignoré', () => {
  const out = computeQualityAlerts({
    ...vide,
    lots: [
      { numero: 'LOT-A', code: 'PF-X', nom: 'Gâteau', dlc: '2026-11-10', qteRest: 3, bloque: false },
      { numero: 'LOT-B', code: 'PF-Y', nom: 'Tarte', dlc: '2026-11-20', qteRest: 3, bloque: false },
      { numero: 'LOT-C', code: 'PF-Z', nom: 'Flan', dlc: '2026-11-12', qteRest: 3, bloque: true },
      { numero: 'LOT-D', code: 'PF-W', nom: 'Mille', dlc: null, qteRest: 3, bloque: false },
      { numero: 'LOT-E', code: 'PF-V', nom: 'Éclair', dlc: '2026-11-30', qteRest: 0, bloque: false },
    ],
  });
  assert.deepEqual(niveaux(out), ['critique', 'attention']);
  assert.match(out[0].titre, /LOT-A/);
  assert.match(out[1].titre, /LOT-B/);
});

test('qualité : tâche de planning non faite avant aujourd’hui = attention', () => {
  const out = computeQualityAlerts({
    ...vide,
    taches: [
      { tache: 'Relevé DLC', dateTache: '2026-11-16', fait: false },
      { tache: 'Appel fournisseur', dateTache: '2026-11-16', fait: true },
      { tache: 'Inventaire', dateTache: '2026-11-19', fait: false },
    ],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].niveau, 'attention');
  assert.match(out[0].titre, /Relevé DLC/);
});

test('qualité : tri critique → alerte → attention', () => {
  const out = computeQualityAlerts({
    today: '2026-11-17',
    temperatures: [{ frigoNom: 'F1', dateReleve: '2026-11-17T08:00:00', temperature: 10, seuilMax: 4 }],
    nettoyages: [{ zone: 'Z1', dateNettoyage: '2026-11-01', fait: false }],
    nonConformites: [],
    lots: [{ numero: 'L1', code: 'C', nom: 'N', dlc: '2026-11-18', qteRest: 1, bloque: false }],
    taches: [{ tache: 'T1', dateTache: '2026-11-16', fait: false }],
  });
  assert.deepEqual(niveaux(out), ['critique', 'alerte', 'attention', 'attention']);
});
