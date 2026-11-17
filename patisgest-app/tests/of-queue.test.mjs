import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueOf, removeOf, findOf, loadOfQueue, saveOfQueue } from '../src/lib/of-queue.ts';

const op = (opId, over = {}) => ({
  opId, versionId: 'v1', versionLabel: 'Croissant v1', siteId: 's1', siteLabel: 'Site1',
  qte: 40, datePrevue: '2026-11-20', queuedAt: '2026-11-17T10:00:00Z', ...over,
});

test('file OF : ajout + dédup par opId', () => {
  let q = [];
  q = enqueueOf(q, op('o1'));
  q = enqueueOf(q, op('o2'));
  q = enqueueOf(q, op('o1', { qte: 80 }));
  assert.equal(q.length, 2);
  assert.equal(findOf(q, 'o1')?.qte, 80);
});

test('file OF : refuse un OF incomplet', () => {
  assert.throws(() => enqueueOf([], op('o1', { qte: 0 })));
  assert.throws(() => enqueueOf([], op('', {})));
  assert.throws(() => enqueueOf([], op('o1', { datePrevue: '' })));
});

test('file OF : plafond100 + retrait après synchronisation', () => {
  let q = [];
  for (let i = 0; i < 120; i++) q = enqueueOf(q, op(`o${i}`));
  assert.equal(q.length, 100);
  q = removeOf(q, 'o119');
  assert.equal(findOf(q, 'o119'), undefined);
});

test('file OF : persistance silencieuse sans window', () => {
  assert.deepEqual(loadOfQueue(), []);
  saveOfQueue([op('o1')]);
  assert.deepEqual(loadOfQueue(), []);
});

test('file OF : flux journée sans internet →0 doublon (idempotence clientRef)', () => {
  //3 OF créés hors ligne.
  let q = [];
  const ofs = [op('f-1'), op('f-2'), op('f-3')];
  for (const o of ofs) q = enqueueOf(q, o);
  // Sync :2 passent, coupure réseau avant le3e.
  const sync = [];
  for (const o of [...q]) {
    if (o.opId === 'f-3') break;
    sync.push(o.opId);
    q = removeOf(q, o.opId);
  }
  assert.equal(q.length, 1);
  // Reprise + double envoi accidentel du2e : le serveur répond duplicate,
  // le client retire — jamais2e création.
  q = removeOf(q, 'f-3');
  sync.push('f-3');
  q = enqueueOf(q, op('f-2'));
  q = removeOf(q, 'f-2');
  assert.equal(q.length, 0);
  assert.equal(new Set(sync).size, sync.length);
  assert.equal(sync.length, 3);
});
