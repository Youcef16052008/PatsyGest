import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeReconciliation } from '../src/lib/reconciliation.ts';

const cloture = (id, date, siteId, revision, lignes) => ({ id, date, siteId, revision, lignes });
const vente = (siteId, date, lignes) => ({ siteId, date, lignes });

test('rapprochement : écart = caisse − déclaré', () => {
  const out = computeReconciliation(
    [cloture('c1', '2026-11-16', 'S1', 1, [
      { articleId: 'A1', code: 'PF-ECL', vendu: 8 },
      { articleId: 'A2', code: 'PF-MIL', vendu: 3 },
    ])],
    [vente('S1', '2026-11-16', [
      { articleId: 'A1', qty: 7 },
      { articleId: 'A2', qty: 3 },
    ])],
  );
  assert.equal(out.length, 1);
  const l1 = out[0].lignes.find((l) => l.articleId === 'A1');
  const l2 = out[0].lignes.find((l) => l.articleId === 'A2');
  assert.equal(l1.ecart, -1); // caisse7 vs déclaré8
  assert.equal(l2.ecart, 0);
});

test('rapprochement : seule la dernière révision est conservée', () => {
  const out = computeReconciliation(
    [
      cloture('c1', '2026-11-16', 'S1', 1, [{ articleId: 'A1', vendu: 8 }]),
      cloture('c2', '2026-11-16', 'S1', 2, [{ articleId: 'A1', vendu: 7 }]),
    ],
    [vente('S1', '2026-11-16', [{ articleId: 'A1', qty: 7 }])],
  );
  assert.equal(out.length, 1);
  assert.equal(out[0].revision, 2);
  assert.equal(out[0].lignes[0].ecart, 0);
});

test('rapprochement : vente non déclarée apparaît en écart', () => {
  const out = computeReconciliation(
    [cloture('c1', '2026-11-16', 'S1', 1, [{ articleId: 'A1', code: 'PF-ECL', vendu: 2 }])],
    [vente('S1', '2026-11-16', [
      { articleId: 'A1', qty: 2 },
      { articleId: 'A9', qty: 5 }, // pas dans la clôture
    ])],
  );
  const undeclared = out[0].lignes.find((l) => l.articleId === 'A9');
  assert.ok(undeclared, 'ligne non déclarée attendue');
  assert.equal(undeclared.declare, 0);
  assert.equal(undeclared.ecart, 5);
});

test('rapprochement : sites et dates séparés', () => {
  const out = computeReconciliation(
    [cloture('c1', '2026-11-16', 'S1', 1, [{ articleId: 'A1', vendu: 4 }])],
    [
      vente('S2', '2026-11-16', [{ articleId: 'A1', qty: 99 }]), // autre site
      vente('S1', '2026-11-15', [{ articleId: 'A1', qty: 50 }]), // autre jour
    ],
  );
  assert.equal(out[0].lignes[0].caisse, 0);
  assert.equal(out[0].lignes[0].ecart, -4);
});

test('rapprochement : plusieurs ventes du même jour sont sommées', () => {
  const out = computeReconciliation(
    [cloture('c1', '2026-11-16', 'S1', 1, [{ articleId: 'A1', vendu: 10 }])],
    [
      vente('S1', '2026-11-16', [{ articleId: 'A1', qty: 4 }]),
      vente('S1', '2026-11-16', [{ articleId: 'A1', qty: 5.5 }]),
    ],
  );
  assert.equal(out[0].lignes[0].caisse, 9.5);
  assert.equal(out[0].lignes[0].ecart, -0.5);
});
