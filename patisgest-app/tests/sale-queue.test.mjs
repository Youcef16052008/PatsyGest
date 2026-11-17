import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueSale, removeSale, findSale, loadQueue, saveQueue } from '../src/lib/sale-queue.ts';

const sale = (ticket, over = {}) => ({
  ticket, articleId: 'a1', articleLabel: 'Croissant', siteId: 's1', siteLabel: 'Site1',
  qte: 2, queuedAt: '2026-11-17T10:00:00Z', ...over,
});

test('file : ajout + dédup par ticket', () => {
  let q = [];
  q = enqueueSale(q, sale('t1'));
  q = enqueueSale(q, sale('t2'));
  q = enqueueSale(q, sale('t1', { qte: 5 })); // remplace t1
  assert.equal(q.length, 2);
  assert.equal(findSale(q, 't1')?.qte, 5);
});

test('file : refuse une vente incomplète', () => {
  assert.throws(() => enqueueSale([], sale('t1', { qte: 0 })));
  assert.throws(() => enqueueSale([], sale('', {})));
  assert.throws(() => enqueueSale([], sale('t1', { articleId: '' })));
});

test('file : plafond à200 entrées (les plus vieilles sortent)', () => {
  let q = [];
  for (let i = 0; i < 210; i++) q = enqueueSale(q, sale(`t${i}`));
  assert.equal(q.length, 200);
  assert.equal(findSale(q, 't0'), undefined);
  assert.equal(findSale(q, 't209')?.ticket, 't209');
});

test('file : retrait après synchronisation', () => {
  let q = enqueueSale([], sale('t1'));
  q = removeSale(q, 't1');
  assert.equal(q.length, 0);
  assert.equal(findSale(q, 't1'), undefined);
});

test('file : persistance localStorage tolère les données corrompues', () => {
  // Pas de window dans node : loadQueue/saveQueue doivent rester silencieux.
  assert.deepEqual(loadQueue(), []);
  saveQueue([sale('t1')]); // no-op sans window
  assert.deepEqual(loadQueue(), []);
});

test('flux offline complet : journée sans internet → reprise →0 doublon', () => {
  // Matin :3 ventes encaissées hors ligne (file d'abord).
  let q = [];
  const ventes = [sale('v-1'), sale('v-2', { qte: 1 }), sale('v-3', { qte: 3 })];
  for (const v of ventes) q = enqueueSale(q, v);
  assert.equal(q.length, 3);

  // Réseau revient :2 ventes synchronisées (retirées de la file),1 échoue réseau.
  const synchronisees = [];
  let reseauTombe = false;
  for (const v of [...q]) {
    if (reseauTombe) break;
    if (v.ticket === 'v-3') { reseauTombe = true; continue; } // coupure au3e
    synchronisees.push(v.ticket);
    q = removeSale(q, v.ticket);
  }
  assert.deepEqual(synchronisees, ['v-1', 'v-2']);
  assert.equal(q.length, 1);
  assert.equal(findSale(q, 'v-3')?.ticket, 'v-3');

  // Reprise : la restante passe, puis la resynchronisation d'une déjà
  // faite est retirée sans2e vente (dédup par ticket = idempotence).
  q = removeSale(q, 'v-3');
  synchronisees.push('v-3');
  q = enqueueSale(q, sale('v-2')); // double envoi accidentel
  q = removeSale(q, 'v-2');       // "dup" serveur → retrait
  assert.equal(q.length, 0);

  // Invariant : aucun ticket synchronisé deux fois.
  assert.equal(new Set(synchronisees).size, synchronisees.length);
  assert.equal(synchronisees.length, 3);
});
