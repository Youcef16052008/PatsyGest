import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePriceAlerts } from '../src/lib/price-alerts.ts';

const pt = (articleId, fournisseurId, datePrix, pu) => ({ articleId, fournisseurId, datePrix, pu });

test('alerte : hausse de11 % déclenchée, ordre des points indifférent', () => {
  const alerts = computePriceAlerts([
    pt('A1', 'F1', '2026-11-01', 100),
    pt('A1', 'F1', '2026-11-15', 111),
  ]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].deltaPct, 11);
  assert.equal(alerts[0].latest, 111);
  assert.equal(alerts[0].previous, 100);
});

test('alerte : variation à10 % exacts = pas d’alerte (seuil strict)', () => {
  const alerts = computePriceAlerts([
    pt('A1', 'F1', '2026-11-01', 100),
    pt('A1', 'F1', '2026-11-15', 110),
  ]);
  assert.equal(alerts.length, 0);
});

test('alerte : baisse de15 % déclenchée aussi', () => {
  const alerts = computePriceAlerts([
    pt('A1', 'F1', '2026-11-15', 85),
    pt('A1', 'F1', '2026-11-01', 100),
  ]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].deltaPct, -15);
});

test('alerte : couples article/fournisseur séparés', () => {
  const alerts = computePriceAlerts([
    pt('A1', 'F1', '2026-11-01', 100),
    pt('A1', 'F1', '2026-11-15', 120),
    pt('A1', 'F2', '2026-11-01', 100),
    pt('A1', 'F2', '2026-11-15', 105),
  ]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].fournisseurId, 'F1');
});

test('alerte : un seul point connu = rien (pas de référence)', () => {
  assert.equal(computePriceAlerts([pt('A1', 'F1', '2026-11-01', 100)]).length, 0);
});

test('alerte : prix précédent nul ignoré, tri par ampleur', () => {
  const alerts = computePriceAlerts([
    pt('A1', 'F1', '2026-11-01', 0),
    pt('A1', 'F1', '2026-11-15', 50),
    pt('A2', 'F1', '2026-11-01', 100),
    pt('A2', 'F1', '2026-11-15', 200),
  ]);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].articleId, 'A2');
  assert.equal(alerts[0].deltaPct, 100);
});
