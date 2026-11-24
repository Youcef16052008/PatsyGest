import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enqueueSale, removeSale, findSale, readQueueStrict, withSaleQueue, scopedQueueKey, createSaleQueueStore } from '../src/lib/sale-queue.ts';

const sale = (ticket, over = {}) => ({
  ticket, articleId: 'a1', articleLabel: 'Croissant', siteId: 's1', siteLabel: 'Site1',
  qte: 2, queuedAt: '2026-11-17T10:00:00Z', ...over,
});

test('file : ajout + dédup par ticket', () => {
  let q = [];
  q = enqueueSale(q, sale('t1'));
  q = enqueueSale(q, sale('t2'));
  q = enqueueSale(q, sale('t1')); // reprise identique
  assert.throws(() => enqueueSale(q, sale('t1', { qte: 5 })), /autre vente/);
  assert.equal(q.length, 2);
  assert.equal(findSale(q, 't1')?.qte, 2);
});

test('file : refuse une vente incomplète', () => {
  assert.throws(() => enqueueSale([], sale('t1', { qte: 0 })));
  assert.throws(() => enqueueSale([], sale('', {})));
  assert.throws(() => enqueueSale([], sale('t1', { articleId: '' })));
});

test('file : le plafond refuse un nouveau ticket sans perdre les plus anciens', () => {
  let q = [];
  for (let i = 0; i < 200; i++) q = enqueueSale(q, sale(`t${i}`));
  assert.throws(() => enqueueSale(q, sale('t200')), /File pleine/);
  assert.equal(q.length, 200);
  assert.equal(findSale(q, 't0').ticket, 't0');
  assert.equal(findSale(q, 't199').ticket, 't199');
});

test('file : retrait après synchronisation', () => {
  let q = enqueueSale([], sale('t1'));
  q = removeSale(q, 't1');
  assert.equal(q.length, 0);
  assert.equal(findSale(q, 't1'), undefined);
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

function memoryStorage() {
  const data = new Map();
  return { data, getItem: key => data.get(key) ?? null, setItem: (key,value) => {data.set(key,value);} };
}
function serialLocks() {
  const held = new Map();
  return { async request(key, callback) {
    const prior=held.get(key) ?? Promise.resolve();
    let release; const current=new Promise(resolve=>{release=resolve;});
    held.set(key,current);
    await prior;
    try { return await callback(); } finally { release(); if (held.get(key)===current) held.delete(key); }
  }};
}
const alice={clientId:'atelier',authUserId:'alice'};
const bob={clientId:'atelier',authUserId:'bob'};
const another={clientId:'autre',authUserId:'alice'};

test('file v2 : compartiments par compte et établissement, ancienne file préservée', async () => {
  const storage=memoryStorage(), env={storage,locks:serialLocks()};
  storage.setItem('patisgest.saleQueue.v1',JSON.stringify([sale('ancien')]));
  await withSaleQueue(alice,env,async q=>q.write(enqueueSale(q.read(),sale('alice'))));
  await withSaleQueue(bob,env,async q=>q.write(enqueueSale(q.read(),sale('bob'))));
  assert.deepEqual(readQueueStrict(storage,scopedQueueKey(alice)).map(s=>s.ticket),['alice']);
  assert.deepEqual(readQueueStrict(storage,scopedQueueKey(bob)).map(s=>s.ticket),['bob']);
  assert.deepEqual(readQueueStrict(storage,scopedQueueKey(another)),[]);
  assert.match(storage.getItem('patisgest.saleQueue.v1'),/ancien/);
  assert.notEqual(scopedQueueKey({clientId:'a.b',authUserId:'c'}),scopedQueueKey({clientId:'a',authUserId:'b.c'}));
});

test('file v2 : lecture corrompue et quota échoué ne causent ni envoi ni écrasement', async () => {
  const storage=memoryStorage(), env={storage,locks:serialLocks()};
  const key=scopedQueueKey(alice); storage.setItem(key,'[{"ticket":"abîmé"}]');
  let sent=false;
  await assert.rejects(withSaleQueue(alice,env,async q=>{q.write([sale('nouveau')]); sent=true;}),/invalide/);
  assert.equal(sent,false); assert.equal(storage.getItem(key),'[{"ticket":"abîmé"}]');
  storage.setItem(key,'[]');
  const broken={...env,storage:{getItem:storage.getItem,setItem(){throw new Error('quota');}}};
  await assert.rejects(withSaleQueue(alice,broken,async q=>{q.write(enqueueSale(q.read(),sale('nouveau'))); sent=true;}),/quota/);
  assert.equal(sent,false); assert.equal(storage.getItem(key),'[]');
});

test('file v2 : deux onglets sérialisent les écritures sans perte', async () => {
  const storage=memoryStorage(), env={storage,locks:serialLocks()};
  const append=ticket=>withSaleQueue(alice,env,async q=>{
    const before=q.read();
    await new Promise(resolve=>setTimeout(resolve,5));
    q.write(enqueueSale(before,sale(ticket)));
  });
  await Promise.all([append('1'),append('2'),append('3')]);
  assert.deepEqual(readQueueStrict(storage,scopedQueueKey(alice)).map(s=>s.ticket),['1','2','3']);
});

test('file v2 : une confirmation serveur reste en file si son retrait ne peut être écrit', async () => {
  const storage=memoryStorage(), locks=serialLocks(), key=scopedQueueKey(alice);
  await withSaleQueue(alice,{storage,locks},async q=>q.write([sale('stable')]));
  const broken={getItem:storage.getItem,setItem(){throw new Error('quota');}};
  await assert.rejects(withSaleQueue(alice,{storage:broken,locks},async q=>q.write(removeSale(q.read(),'stable'))),/quota/);
  assert.deepEqual(readQueueStrict(storage,key).map(s=>s.ticket),['stable']);
});

test('file v2 : données incomplètes, date invalide et références en double restent intactes', () => {
 const storage=memoryStorage(), key=scopedQueueKey(alice);
 for (const data of [[sale('a',{siteLabel:undefined})],[sale('b',{queuedAt:'??'})],[sale('c'),sale('c')]]) {
  const raw=JSON.stringify(data); storage.setItem(key,raw);
  assert.throws(()=>readQueueStrict(storage,key));
  assert.equal(storage.getItem(key),raw);
 }
});

test('store caisse : observation stable, notification, fichier historique et absence de verrous', async () => {
 const priorWindow=globalThis.window, priorNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator');
 const storage=memoryStorage(), win=new EventTarget();
 win.localStorage=storage; globalThis.window=win;
 Object.defineProperty(globalThis,'navigator',{value:{},configurable:true});
 try {
  const store=createSaleQueueStore(alice), other=createSaleQueueStore(bob);
  const initial=store.getSnapshot(); assert.strictEqual(store.getSnapshot(),initial);
  let notices=0; const unsubscribe=store.subscribe(()=>notices++);
  await assert.rejects(store.transact(async()=>{}),/verrou|sécuriser la file/);
  Object.defineProperty(globalThis,'navigator',{value:{locks:serialLocks()},configurable:true});
  await store.transact(async q=>q.write([sale('a')]));
  assert.equal(notices,1); assert.equal(store.getSnapshot().sales[0].ticket,'a');
  assert.equal(other.getSnapshot().sales.length,0);
  storage.setItem('patisgest.saleQueue.v1','{"invalide":true}');
  assert.equal(store.getSnapshot().legacy,true);
  unsubscribe();
 } finally {
  if (priorWindow === undefined) delete globalThis.window; else globalThis.window=priorWindow;
  if (priorNavigator) Object.defineProperty(globalThis,'navigator',priorNavigator); else delete globalThis.navigator;
 }
});

test('file : une vente « carte » déjà en file ne rend pas la file illisible', () => {
  const storage = { getItem: () => JSON.stringify([sale('t-carte', { modePaiement: 'carte' }), sale('t-esp', { modePaiement: 'especes' })]), setItem() {}, removeItem() {} };
  const queue = readQueueStrict(storage, 'k');
  assert.equal(queue.length, 2);
  assert.equal(queue[0].modePaiement, 'carte');
});
