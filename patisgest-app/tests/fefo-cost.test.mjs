import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeFefoCost, sortFefo } from '../src/lib/fefo-cost.ts';

const lot = (id, over) => ({
  id, qte_rest: 10, pu: 100, dlc: null, date_reception: '2026-01-01', congele: false, ...over,
});

test('FEFO : DLC croissante d’abord', () => {
  const sorted = sortFefo([
    lot('b', { dlc: '2026-05-01' }),
    lot('a', { dlc: '2026-04-01' }),
    lot('c', { dlc: null }),
  ]);
  assert.deepEqual(sorted.map((l) => l.id), ['a', 'b', 'c']);
});

test('FEFO : non congelé avant congelé, même DLC (miroir du SQL order by congele asc)', () => {
  const sorted = sortFefo([
    lot('f', { dlc: '2026-04-01', congele: true }),
    lot('n', { dlc: '2026-04-01', congele: false }),
  ]);
  assert.deepEqual(sorted.map((l) => l.id), ['n', 'f']);
});

test('FEFO : un lot congelé n’est consommé qu’après les lots frais, même si sa DLC est plus proche', () => {
  const res = computeFefoCost([
    lot('congele', { qte_rest: 5, pu: 10, dlc: '2026-04-01', congele: true }),
    lot('frais', { qte_rest: 5, pu: 12, dlc: '2026-05-01', congele: false }),
  ], 5);
  assert.deepEqual(res.lignes.map((l) => l.lotId ?? l.id), ['frais']);
  assert.equal(res.cout, 5 * 12);
});

test('FEFO : coût couvert en plusieurs lots', () => {
  const res = computeFefoCost([
    lot('a', { qte_rest: 2, pu: 10, dlc: '2026-04-01' }),
    lot('b', { qte_rest: 5, pu: 12, dlc: '2026-05-01' }),
  ], 5);
  assert.equal(res.couvert, 5);
  assert.equal(res.cout, 2 * 10 + 3 * 12); // 56
  assert.equal(res.insuffisant, false);
  assert.equal(res.lignes.length, 2);
});

test('FEFO : stock insuffisant → couvert partiel signalé', () => {
  const res = computeFefoCost([lot('a', { qte_rest: 2, pu: 10 })], 5);
  assert.equal(res.couvert, 2);
  assert.equal(res.cout, 20);
  assert.equal(res.insuffisant, true);
});

test('FEFO : les lots sans coût (pu<=0) ou vides sont ignorés', () => {
  const res = computeFefoCost([
    lot('v', { qte_rest: 0, pu: 10 }),
    lot('z', { qte_rest: 3, pu: 0 }),
    lot('ok', { qte_rest: 4, pu: 7 }),
  ], 3);
  assert.equal(res.lignes.length, 1);
  assert.equal(res.cout, 21);
  assert.equal(res.insuffisant, false);
});

test('FEFO : refuse une quantité invalide', () => {
  assert.throws(() => computeFefoCost([], 0));
  assert.throws(() => computeFefoCost([], -1));
});

test('FEFO : le coût utilise le lot frais comme la production SQL', () => {
  const result = computeFefoCost([
    lot('frozen', { congele: true, dlc: '2028-04-01', pu: 4 }),
    lot('fresh', { congele: false, dlc: '2028-04-01', pu: 10 }),
  ], 5, '2028-01-01');
  assert.equal(result.cout, 50);
  assert.deepEqual(result.lignes, [{ lotId: 'fresh', qte: 5, pu: 10 }]);
});
