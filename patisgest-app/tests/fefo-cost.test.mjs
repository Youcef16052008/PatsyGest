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

test('FEFO : une DLC illisible va en dernier, comme « nulls last » en SQL (W2-D3)', () => {
  // Parité avec `order by l.dlc asc nulls last` (06-ventes-caisse-fefo.sql:138).
  // Avant correctif : Date.parse('pas une date') = NaN, le comparateur rendait
  // NaN et V8 plaçait le lot n'importe où — mesuré : a,b,c au lieu de c,a,b.
  const lot = (id, dlc) => ({ id, qte_rest: 1, pu: 10, dlc, date_reception: '2026-01-01', congele: false });
  const ordre = sortFefo([
    lot('proche', '2026-06-01'),
    lot('illisible', 'pas une date'),
    lot('lointain', '2026-12-01'),
  ]).map((l) => l.id);
  assert.deepEqual(ordre, ['proche', 'lointain', 'illisible']);

  // Une DLC vide ou nulle reste aussi en dernier.
  assert.deepEqual(
    sortFefo([lot('vide', ''), lot('proche', '2026-06-01')]).map((l) => l.id),
    ['proche', 'vide'],
  );
  assert.deepEqual(
    sortFefo([lot('nulle', null), lot('proche', '2026-06-01')]).map((l) => l.id),
    ['proche', 'nulle'],
  );

  // Conséquence métier : le coût doit venir du lot à DLC proche, pas de l'illisible.
  // asOf antérieur aux deux DLC : aucune péremption ne doit interférer.
  const r = computeFefoCost(
    [{ ...lot('illisible', 'pas une date'), pu: 99 }, { ...lot('proche', '2026-06-01'), pu: 10 }],
    1,
    '2026-01-15',
  );
  assert.deepEqual(r.lignes.map((l) => l.lotId), ['proche']);
  assert.equal(r.cout, 10);
});

test('FEFO : les lots bloqués ne sont jamais consommés (RC-09)', () => {
  // DLC postérieure à asOf, sinon les deux lots seraient (correctement) périmés
  // et le test ne prouverait rien sur `bloque`.
  const lot = (id, extra) => ({ id, qte_rest: 5, pu: 10, dlc: '2026-12-01', date_reception: '2026-01-01', congele: false, ...extra });
  const r = computeFefoCost([lot('rappele', { bloque: true }), lot('sain', {})], 2, '2026-11-01');
  assert.deepEqual(r.lignes.map((l) => l.lotId), ['sain'], 'lot rappelé consommé !');
  assert.equal(r.couvert, 2);
  // Stock entièrement bloqué => insuffisant, jamais un coût inventé.
  const seul = computeFefoCost([lot('rappele', { bloque: true })], 2, '2026-11-01');
  assert.equal(seul.lignes.length, 0);
  assert.equal(seul.cout, 0);
  assert.equal(seul.insuffisantStock, true);
});
