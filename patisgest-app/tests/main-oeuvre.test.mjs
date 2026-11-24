import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tauxHoraireDepuisJournee, salaireJournalierDepuisTaux } from '../src/lib/main-oeuvre.ts';
import { rc04MoChargee } from '../src/lib/cost-sheet.ts';
import { PAYMENT_MODES_SAISIE, isPaymentMode } from '../src/lib/pos-cart.ts';

test('journée de 8 h : taux horaire = salaire ÷ 8', () => {
  assert.equal(tauxHoraireDepuisJournee(3200), 400);
  assert.equal(tauxHoraireDepuisJournee(3200, 7), 457.14);
});

test('MO chargée au jour : 90 min à 3 200 DA/jour, charges 25 %', () => {
  const taux = tauxHoraireDepuisJournee(3200);
  assert.equal(rc04MoChargee(90, taux, 25), 750);
});

test('aller-retour salaire journalier / taux', () => {
  assert.equal(salaireJournalierDepuisTaux(400), 3200);
});

test('entrées invalides refusées', () => {
  assert.throws(() => tauxHoraireDepuisJournee(-1), RangeError);
  assert.throws(() => tauxHoraireDepuisJournee(3200, 0), RangeError);
});

test('saisie caisse : espèces et chèque/virement seulement, carte historique reconnue', () => {
  assert.deepEqual([...PAYMENT_MODES_SAISIE], ['especes', 'cheque_virement']);
  assert.equal(isPaymentMode('carte'), true);
});
