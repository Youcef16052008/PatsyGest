import { test } from 'node:test';
import assert from 'node:assert/strict';
import { seed, receive, sell, fefo, recipeCost } from '../src/lib/patisgest-store.ts';

test('FEFO consumes earliest eligible lots and records shortages without negative stock', () => {
  const state=structuredClone(seed);
  state.lots.push({ ...state.lots.find(l=>l.id==='l5'), id:'earlier', numero:'EARLY', qte:2, dlc:'2026-12-01' });
  state.lots.push({ ...state.lots.find(l=>l.id==='l5'), id:'blocked', numero:'BLOCK', qte:99, dlc:'2026-01-01', bloque:true });
  const next=sell(state,'eclair',25);
  assert.deepEqual(next.sales[0].lots,['EARLY','ECL-01']);
  assert.equal(next.sales[0].missing,3);
  assert.equal(next.lots.find(l=>l.id==='blocked').qte,99);
  assert.equal(next.lots.find(l=>l.id==='l5').qte,0);
  assert.equal(next.movements.at(-1).qte,-3);
  assert.equal(state.lots.find(l=>l.id==='l5').qte,20);
});
test('reception validates input and creates a stock movement', () => {
  assert.throws(()=>receive(seed,{articleId:'farine',site:'Labo',numero:'',qte:1,pu:1,dlc:''}));
  const next=receive(seed,{articleId:'farine',site:'Labo',numero:'TEST',qte:5,pu:22,dlc:''});
  assert.equal(next.lots.at(-1).qte,5);
  assert.equal(next.movements.at(-1).lotId,next.lots.at(-1).id);
});
test('frozen and undated lots sort after fresh dated lots; recipe accounts for loss and labour', () => {
  const state=structuredClone(seed);
  state.lots.push({...state.lots[0],id:'frozen',congele:true,dlc:'2026-01-01'});
  assert.equal(fefo(state.lots,'farine','Labo').at(-1).id,'frozen');
  const result=recipeCost(state);
  assert.equal(result.materials,975);
  assert.equal(result.labour,625);
  assert.equal(result.yieldNet,19);
  assert.equal(result.perUnit,2000/19);
});

import { upgradeState, createPurchase, receivePurchase, createProduction, startProduction, completeProduction, transferStock } from '../src/lib/patisgest-store.ts';
test('old saved state migrates without deleting stock', () => {
  const {purchases,productions,transfers,...old}=structuredClone(seed);
  const state=upgradeState(old);
  assert.equal(state.lots.length,seed.lots.length);
  assert.deepEqual(state.purchases,[]);
  assert.deepEqual(state.productions,[]);
  assert.deepEqual(state.transfers,[]);
});
test('purchase order tracks partial and final receipt and prevents over-reception', () => {
  let state=createPurchase(structuredClone(seed),seed.suppliers[0],'farine',10,110);
  const order=state.purchases[0];
  state=receivePurchase(state,order.id,4,'F-NEW','2027-05-01','Labo');
  assert.equal(state.purchases[0].status,'partiel');
  assert.equal(state.purchases[0].received,4);
  assert.throws(()=>receivePurchase(state,order.id,7,'F-2','','Labo'));
  state=receivePurchase(state,order.id,6,'F-2','','Labo');
  assert.equal(state.purchases[0].status,'recu');
  assert.equal(state.purchases[0].received,10);
  assert.throws(()=>receivePurchase(state,order.id,1,'F-3','','Labo'));
});
test('production consumes FEFO once, records missing ingredients and flags incomplete costs', () => {
  let state=structuredClone(seed);
  state.lots=state.lots.map(l=>l.articleId==='beurre'?{...l,qte:0.5}:l);
  state=createProduction(state,20); const order=state.productions[0];
  state=startProduction(state,order.id);
  assert.equal(state.productions[0].status,'encours');
  assert.equal(state.productions[0].shortages[0].qty,0.55);
  assert.equal(state.lots.find(l=>l.id==='l1').qte,23);
  assert.throws(()=>startProduction(state,order.id));
  assert.throws(()=>completeProduction(state,order.id,21,'O-1',''));
  state=completeProduction(state,order.id,5,'O-1','2027-01-01');
  assert.equal(state.productions[0].status,'partiel');
  assert.equal(state.lots.at(-1).costEstimated,true);
  state=completeProduction(state,order.id,15,'O-2','2027-01-02');
  assert.equal(state.productions[0].status,'termine');
  assert.equal(state.productions[0].producedLotIds.length,2);
  assert.throws(()=>completeProduction(state,order.id,1,'O-3',''));
});
test('transfer conserves quantities, lot metadata and costs, and rejects overdraw', () => {
  let state=structuredClone(seed);
  state.lots[0].costEstimated=true;
  assert.throws(()=>transferStock(state,'farine',100,'Labo','Boutique'));
  state=transferStock(state,'farine',30,'Labo','Boutique');
  const transferred=state.lots.filter(l=>l.articleId==='farine' && l.site==='Boutique');
  assert.deepEqual(transferred.map(l=>l.qte),[25,5]);
  assert.deepEqual(transferred.map(l=>l.numero),['FAR-01','FAR-02']);
  assert.equal(transferred[0].dlc,'2027-02-01');
  assert.equal(transferred[0].costEstimated,true);
  assert.equal(state.lots.filter(l=>l.articleId==='farine').reduce((n,l)=>n+l.qte,0),40);
  assert.equal(state.transfers.length,1);
});
test('quantities smaller than storage precision are rejected', () => {
  assert.throws(()=>createProduction(seed,0.00001));
  assert.throws(()=>transferStock(seed,'farine',0.00001,'Labo','Boutique'));
  assert.throws(()=>sell(seed,'eclair',0.00001));
});
test('production and purchase movements retain their order reference', () => {
  let state=createPurchase(structuredClone(seed),seed.suppliers[0],'farine',1,90);
  const purchase=state.purchases[0]; state=receivePurchase(state,purchase.id,1,'P-1','','Labo');
  assert.match(state.movements.at(-1).reference,new RegExp(purchase.numero));
  state=createProduction(state,20); const order=state.productions[0];
  state=startProduction(state,order.id);
  state=completeProduction(state,order.id,20,'P-OF','');
  assert.match(state.movements.at(-1).reference,new RegExp(order.numero));
});
test('incomplete ingredient lot cost propagates to produced lots', () => {
  let state=structuredClone(seed);
  state.lots=state.lots.map(l=>l.id==='l1'?{...l,costEstimated:true}:l);
  state=createProduction(state,20); const id=state.productions[0].id;
  state=startProduction(state,id);
  state=completeProduction(state,id,20,'X','');
  assert.equal(state.lots.at(-1).costEstimated,true);
});

import { createRecipe, addRecipeVersion } from '../src/lib/patisgest-store.ts';
const recipeInput = () => ({baseYield:10,lossPercent:10,labourMinutes:60,hourlyRate:100,chargesPercent:20,packaging:30,energy:20,overhead:10,ingredients:[{articleId:'farine',qty:2,parage:10},{articleId:'sucre',qty:1,parage:0}]});
test('creating recipes and appending versions preserves immutable version history', () => {
  let state=structuredClone(seed);
  const input=recipeInput();
  state=createRecipe(state,'Brioche','eclair',input);
  const recipe=state.recipes.at(-1);
  input.ingredients[0].qty=99;
  assert.equal(recipe.versions[0].ingredients[0].qty,2);
  state=addRecipeVersion(state,recipe.id,{...recipeInput(),ingredients:[{articleId:'farine',qty:3,parage:0}]});
  assert.deepEqual(state.recipes.at(-1).versions.map(v=>v.version),[1,2]);
  assert.equal(state.recipes.at(-1).versions[0].ingredients[0].qty,2);
  assert.equal(state.recipes.at(-1).versions[1].ingredients[0].qty,3);
  const oldCost=recipeCost(state,recipe.id,1);
  assert.equal(oldCost.materials,318);
  assert.equal(oldCost.labour,120);
  assert.equal(oldCost.yieldNet,9);
  assert.equal(oldCost.total,498);
  assert.equal(oldCost.perUnit,498/9);
});
test('orders snapshot the active version and do not change when a new version is added', () => {
  let state=createRecipe(structuredClone(seed),'Brioche','eclair',recipeInput());
  const recipe=state.recipes.at(-1);
  state=createProduction(state,10,recipe.id);
  const order=state.productions.at(-1);
  state=addRecipeVersion(state,recipe.id,{...recipeInput(),ingredients:[{articleId:'sucre',qty:5,parage:0}]});
  state=startProduction(state,order.id);
  assert.equal(state.productions.at(-1).snapshot.version,1);
  assert.equal(state.productions.at(-1).consumption.find(c=>c.articleId==='farine').qty,2.2);
  state=createProduction(state,10,recipe.id);
  assert.equal(state.productions.at(-1).snapshot.version,2);
  assert.equal(state.productions.at(-1).snapshot.ingredients[0].qty,5);
});
test('recipe validation rejects duplicates, unknown items, invalid yield and loss', () => {
  const state=structuredClone(seed);
  const input=recipeInput();
  assert.throws(()=>createRecipe(state,'Bad','farine',input));
  assert.throws(()=>createRecipe(state,'Bad','eclair',{...input,lossPercent:100}));
  assert.throws(()=>createRecipe(state,'Bad','eclair',{...input,baseYield:0}));
  assert.throws(()=>createRecipe(state,'Bad','eclair',{...input,ingredients:[input.ingredients[0],input.ingredients[0]]}));
  assert.throws(()=>createRecipe(state,'Bad','eclair',{...input,ingredients:[{articleId:'eclair',qty:1,parage:0}]}));
  assert.throws(()=>addRecipeVersion(state,'not-found',input));
});
test('upgrade installs initial recipe without overwriting existing saved recipes', () => {
  const {recipes,...old}=structuredClone(seed);
  const migrated=upgradeState(old);
  assert.equal(migrated.recipes[0].id,'recette-eclair');
  migrated.recipes[0].name='Custom';
  assert.equal(upgradeState(migrated).recipes[0].name,'Custom');
});
test('minimum quantity is consumed and shortage is recorded rather than ignored', () => {
  let state=structuredClone(seed);
  state.lots=state.lots.map(l=>l.id==='l5'?{...l,qte:0.0001}:l);
  state=sell(state,'eclair',0.0002);
  assert.equal(state.lots.find(l=>l.id==='l5').qte,0);
  assert.equal(state.sales[0].missing,0.0001);
  assert.equal(state.movements.at(-1).qte,-0.0001);
});
test('production propagates missing cost from an ingredient lot priced at zero', () => {
  let state=structuredClone(seed);
  state.lots=state.lots.map(l=>l.id==='l1'?{...l,pu:0}:l);
  state=createProduction(state,20); const id=state.productions[0].id;
  state=startProduction(state,id);
  state=completeProduction(state,id,20,'X','');
  assert.equal(state.lots.at(-1).costEstimated,true);
});
test('production consumes and transfers exact minimum quantities', () => {
  let state=structuredClone(seed);
  state=createRecipe(state,'Test min','eclair',{...recipeInput(),baseYield:1,ingredients:[{articleId:'farine',qty:0.0001,parage:0}]});
  state=createProduction(state,1,state.recipes.at(-1).id);
  const order=state.productions.at(-1);
  state=startProduction(state,order.id);
  assert.equal(state.productions.at(-1).consumption[0].qty,0.0001);
  state=transferStock(state,'farine',0.0001,'Labo','Boutique');
  assert.equal(state.transfers.at(-1).qty,0.0001);
  assert.equal(state.lots.at(-1).qte,0.0001);
});

import { addDailyClosing, closingStats } from '../src/lib/patisgest-store.ts';
const closingLine=()=>({articleId:'eclair',produit:20,vendu:12,reporte:3,jete:2,casse:1,offert:2});
test('six-flow closing records price snapshot without changing stock or sales', () => {
  const initial=structuredClone(seed);
  const state=addDailyClosing(initial,'2026-11-16','Boutique',[closingLine()]);
  assert.deepEqual(state.lots,initial.lots);
  assert.deepEqual(state.movements,initial.movements);
  assert.deepEqual(state.sales,initial.sales);
  const entry=state.closings[0], stats=closingStats(entry);
  assert.equal(stats.lossRate,15);
  assert.equal(stats.manque,750);
  assert.equal(stats.caHT,3000);
  assert.equal(stats.reporte,3);
  assert.equal(stats.offert,2);
  assert.equal(entry.lines[0].priceHT,250);
  state.articles.find(a=>a.id==='eclair').prix=1000;
  assert.equal(closingStats(entry).manque,750);
});
test('closing rejects duplicates unless a new revision is explicitly requested', () => {
  let state=addDailyClosing(structuredClone(seed),'2026-11-16','Labo',[closingLine()]);
  assert.throws(()=>addDailyClosing(state,'2026-11-16','Labo',[closingLine()]));
  state=addDailyClosing(state,'2026-11-16','Labo',[{...closingLine(),jete:7}],true);
  assert.deepEqual(state.closings.map(c=>c.revision),[1,2]);
  assert.equal(state.closings[0].lines[0].jete,2);
  assert.equal(state.closings[1].lines[0].jete,7);
  state=addDailyClosing(state,'2026-11-16','Boutique',[closingLine()]);
  assert.equal(state.closings[2].revision,1);
});
test('closing validates date, product, quantities, and mixed-unit loss totals', () => {
  const state=structuredClone(seed), line=closingLine();
  assert.throws(()=>addDailyClosing(state,'2026-02-30','Labo',[line]));
  assert.throws(()=>addDailyClosing(state,'2026-11-16','X',[line]));
  assert.throws(()=>addDailyClosing(state,'2026-11-16','Labo',[]));
  assert.throws(()=>addDailyClosing(state,'2026-11-16','Labo',[line,line]));
  assert.throws(()=>addDailyClosing(state,'2026-11-16','Labo',[{...line,articleId:'farine'}]));
  assert.throws(()=>addDailyClosing(state,'2026-11-16','Labo',[{...line,jete:-1}]));
  state.articles.push({...state.articles.find(a=>a.id==='eclair'),id:'p2',nom:'Gâteau',unite:'kg'});
  const mixed=addDailyClosing(state,'2026-11-16','Labo',[line,{...line,articleId:'p2'}]);
  assert.equal(closingStats(mixed.closings[0]).lossRate,null);
  const zero=addDailyClosing(state,'2026-11-17','Labo',[{...line,produit:0}]);
  assert.equal(closingStats(zero.closings[0]).lossRate,null);
  const {closings,...old}=state;
  assert.deepEqual(upgradeState(old).closings,[]);
});

import { addTemperature, addCleaning, addIncident, updateIncident } from '../src/lib/patisgest-store.ts';
test('quality readings retain their entered thresholds and validate fields', () => {
  let state=structuredClone(seed);
  state=addTemperature(state,{date:'2026-11-16',equipment:' Frigo A ',max:4,temperature:6,agent:' Sara '});
  assert.equal(state.temperatures[0].equipment,'Frigo A');
  assert.equal(state.temperatures[0].temperature>state.temperatures[0].max,true);
  state=addTemperature(state,{date:'2026-11-16',equipment:'Frigo A',max:6,temperature:6,agent:''});
  assert.equal(state.temperatures[1].temperature>state.temperatures[1].max,false);
  assert.throws(()=>addTemperature(state,{date:'2026-11-16',equipment:'',max:4,temperature:2,agent:''}));
  assert.throws(()=>addTemperature(state,{date:'2026-02-30',equipment:'Frigo',max:4,temperature:2,agent:''}));
  assert.throws(()=>addTemperature(state,{date:'2026-11-16',equipment:'Frigo',max:4,temperature:Infinity,agent:''}));
});
test('cleaning records distinguish outstanding and completed work', () => {
  let state=addCleaning(structuredClone(seed),{date:'2026-11-16',zone:' Labo ',done:false,agent:'Sara'});
  state=addCleaning(state,{date:'2026-11-16',zone:'Labo',done:true,agent:'Sara'});
  assert.deepEqual(state.cleanings.map(c=>c.done),[false,true]);
  assert.equal(state.cleanings[0].zone,'Labo');
  assert.throws(()=>addCleaning(state,{date:'2026-11-16',zone:' ',done:true,agent:''}));
});
test('incident lifecycle requires corrective action and preserves state history', () => {
  let state=structuredClone(seed);
  state=addIncident(state,{date:'2026-11-16',type:'Température',description:'Frigo trop chaud',lotId:'l1',action:''});
  const incident=state.incidents[0];
  assert.equal(incident.lotNumero,'FAR-01');
  assert.equal(state.lots.find(l=>l.id==='l1').bloque,false);
  assert.throws(()=>updateIncident(state,incident.id,'cloturee','  '));
  state=updateIncident(state,incident.id,'cloturee','Réglage et contrôle');
  assert.equal(state.incidents[0].status,'cloturee');
  state=updateIncident(state,incident.id,'ouverte',state.incidents[0].action);
  assert.deepEqual(state.incidents[0].history.map(h=>h.status),['ouverte','cloturee','ouverte']);
  assert.throws(()=>updateIncident(state,incident.id,'ouverte',''));
  assert.throws(()=>addIncident(state,{date:'2026-11-16',type:'Autre',description:'Test',lotId:'unknown',action:''}));
});
test('quality collections are added to old demo data without losing closures', () => {
  const state=addDailyClosing(structuredClone(seed),'2026-11-16','Labo',[closingLine()]);
  const {temperatures,cleanings,incidents,...old}=state;
  const upgraded=upgradeState(old);
  assert.equal(upgraded.closings.length,1);
  assert.deepEqual(upgraded.temperatures,[]);
  assert.deepEqual(upgraded.cleanings,[]);
  assert.deepEqual(upgraded.incidents,[]);
});

import { createCake, payCake, cakeTotals, advanceCake, setCakeTask, moneyToCents } from '../src/lib/patisgest-store.ts';
const cakeInput=()=>({client:'Client fictif',telephone:'',eventDate:'2028-03-01',portions:20,priceCents:10001,options:[{name:'Décor',costCents:500,minutes:30}],notes:''});
test('cake requires an exact 30% deposit and freezes input options', () => {
  let state=structuredClone(seed), input=cakeInput();
  state=createCake(state,input);
  const cake=state.cakes[0]; input.options[0].costCents=1;
  assert.equal(cake.options[0].costCents,500);
  assert.equal(cakeTotals(cake).required,3001);
  assert.deepEqual(cake.tasks.map(t=>t.dueDate),['2028-02-27','2028-02-29','2028-03-01']);
  assert.throws(()=>advanceCake(state,cake.id,'confirme'));
  state=payCake(state,cake.id,3000);
  assert.throws(()=>advanceCake(state,cake.id,'confirme'));
  state=payCake(state,cake.id,1);
  state=advanceCake(state,cake.id,'confirme');
  assert.equal(state.cakes[0].status,'confirme');
  assert.equal(cakeTotals(state.cakes[0]).deposit,3001);
  assert.deepEqual(state.cakes[0].history.map(h=>h.status),['devis','acompte','confirme']);
});
test('cake prevents overpayment, invalid transitions and unpaid delivery', () => {
  let state=createCake(structuredClone(seed),cakeInput()); const id=state.cakes[0].id;
  assert.throws(()=>payCake(state,id,10002));
  assert.throws(()=>payCake(state,id,0));
  state=payCake(state,id,3001);
  state=advanceCake(state,id,'confirme');
  assert.throws(()=>advanceCake(state,id,'livre'));
  state=advanceCake(state,id,'produit');
  assert.throws(()=>advanceCake(state,id,'livre'));
  state=payCake(state,id,7000);
  assert.equal(cakeTotals(state.cakes[0]).balance,0);
  assert.equal(state.cakes[0].payments[1].type,'solde');
  state=advanceCake(state,id,'livre');
  assert.throws(()=>payCake(state,id,1));
  assert.throws(()=>advanceCake(state,id,'annule'));
  assert.throws(()=>setCakeTask(state,id,0,true));
});
test('cake cancellation and task completion keep simulated payment history', () => {
  let state=createCake(structuredClone(seed),cakeInput()); const id=state.cakes[0].id;
  state=payCake(state,id,3001);
  state=setCakeTask(state,id,1,true);
  assert.equal(state.cakes[0].tasks[1].done,true);
  assert.throws(()=>setCakeTask(state,id,99,true));
  state=advanceCake(state,id,'annule');
  assert.equal(cakeTotals(state.cakes[0]).paid,3001);
  assert.equal(state.cakes[0].payments.length,1);
  assert.throws(()=>payCake(state,id,100));
});
test('cake monetary parser and input validation reject invalid values', () => {
  assert.equal(moneyToCents('10,05'),1005);
  assert.equal(moneyToCents('0.1'),10);
  assert.equal(moneyToCents('001'),100);
  for(const value of ['-1','1.001','NaN','1e2','','1000000001']) assert.throws(()=>moneyToCents(value));
  const initial=structuredClone(seed);
  assert.throws(()=>createCake(initial,{...cakeInput(),priceCents:0}));
  assert.throws(()=>createCake(initial,{...cakeInput(),eventDate:'2026-02-30'}));
  assert.throws(()=>createCake(initial,{...cakeInput(),eventDate:'0000-01-01'}));
  assert.throws(()=>createCake(initial,{...cakeInput(),portions:2.5}));
  assert.throws(()=>createCake(initial,{...cakeInput(),options:[{name:'',costCents:0,minutes:1}]}));
  const {cakes,...old}=initial;
  assert.deepEqual(upgradeState(old).cakes,[]);
});

import { traceLot, setLotBlocked } from '../src/lib/patisgest-store.ts';
test('trace follows purchase to production, transfer and sale by lot ID', () => {
  let state=structuredClone(seed);
  state.lots=state.lots.map(l=>l.articleId==='farine'?{...l,qte:0}:l);
  state=createPurchase(state,seed.suppliers[0],'farine',3,90);
  const purchase=state.purchases[0];
  state=receivePurchase(state,purchase.id,3,'F-TRACE','2026-12-01','Labo');
  const source=state.lots.at(-1);
  assert.equal(source.origin.type,'purchase');
  assert.equal(source.origin.supplier,seed.suppliers[0]);
  state=createProduction(state,20); const of=state.productions[0];
  state=startProduction(state,of.id);
  state=completeProduction(state,of.id,20,'PROD-TRACE','2026-12-01');
  const produced=state.lots.at(-1);
  assert.equal(produced.origin.productionId,of.id);
  state=transferStock(state,'eclair',20,'Labo','Boutique');
  const transferred=state.lots.at(-1);
  assert.equal(transferred.origin.fromLotId,produced.id);
  state=sell(state,'eclair',2);
  const trace=traceLot(state,source.id);
  assert.deepEqual(new Set(trace.lots.map(l=>l.id)),new Set([source.id,produced.id,transferred.id]));
  assert.equal(trace.orders[0].id,of.id);
  assert.equal(trace.transfers.length,1);
  assert.equal(trace.sales.length,1);
  assert.deepEqual(trace.sales[0].details,[{lotId:transferred.id,qty:2}]);
  assert.equal(trace.legacySales,0);
  assert.equal(trace.legacyTransferLots,0);
});
test('trace does not confuse lots with the same number and recovers legacy sales from exact movements', () => {
  let state=structuredClone(seed);
  state.lots.push({...state.lots.find(l=>l.id==='l5'),id:'other',qte:10,dlc:'2028-01-01'});
  state=sell(state,'eclair',1);
  assert.equal(traceLot(state,'other').sales.length,0);
  assert.equal(traceLot(state,'l5').sales.length,1);
  state.sales=state.sales.map(({lotDetails,...rest})=>rest);
  assert.equal(traceLot(state,'l5').sales.length,1);
  assert.equal(traceLot(state,'other').sales.length,0);
  state.movements=[];
  assert.equal(traceLot(state,'l5').sales.length,0);
  assert.equal(traceLot(state,'l5').legacySales,1);
});
test('legacy transfer provenance is disclosed and not inferred by duplicate lot numbers', () => {
  let state=transferStock(structuredClone(seed),'farine',1,'Labo','Boutique');
  state.lots=state.lots.map(l=>l.site==='Boutique'&&l.articleId==='farine'?{...l,origin:undefined}:l);
  const trace=traceLot(state,'l1');
  assert.equal(trace.lots.length,1);
  assert.equal(trace.legacyTransferLots,1);
});
test('blocking records reasons, excludes FEFO and never automatically unblocks descendants', () => {
  let state=transferStock(structuredClone(seed),'farine',5,'Labo','Boutique');
  const child=state.lots.at(-1).id;
  assert.throws(()=>setLotBlocked(state,['l1'],true,'  '));
  assert.throws(()=>setLotBlocked(state,['missing'],true,'Test'));
  state=setLotBlocked(state,traceLot(state,'l1').lots.map(l=>l.id),true,'Rappel test');
  assert.equal(state.lots.find(l=>l.id===child).bloque,true);
  assert.equal(fefo(state.lots,'farine','Labo').some(l=>l.id==='l1'),false);
  assert.equal(state.lotEvents.length,2);
  state=setLotBlocked(state,['l1'],false,'Contrôle effectué');
  assert.equal(state.lots.find(l=>l.id===child).bloque,true);
  assert.equal(state.lotEvents.at(-1).reason,'Contrôle effectué');
  assert.throws(()=>setLotBlocked(state,['l1'],false,'Encore'));
});
test('production completion automatically blocks new output when an input was blocked after launch', () => {
  let state=createProduction(structuredClone(seed),20);const id=state.productions[0].id;
  state=startProduction(state,id);
  state=setLotBlocked(state,['l1'],true,'Test rappel');
  assert.equal(traceLot(state,'l1').orders[0].id,id);
  state=completeProduction(state,id,20,'LOT-BLOQUE','');
  const lot=state.lots.at(-1);
  assert.equal(lot.bloque,true);
  assert.equal(state.lotEvents.at(-1).lotId,lot.id);
  assert.equal(traceLot(state,'l1').lots.some(l=>l.id===lot.id),true);
  assert.equal(fefo(state.lots,'eclair','Labo').length,0);
});
test('legacy data migrates block history and nonexistent lot is rejected', () => {
  const {lotEvents,...old}=structuredClone(seed);
  assert.deepEqual(upgradeState(old).lotEvents,[]);
  assert.throws(()=>traceLot(seed,'not-found'));
});

import { createPlanningTask, markPlanningTask, removePlanningTask, setDailyCapacity, rescheduleProduction, planningOverview } from '../src/lib/patisgest-store.ts';
test('planning tasks report total and outstanding load without affecting stock', () => {
  let state=structuredClone(seed);const original=structuredClone(state.lots);
  state=createProduction(state,20,'recette-eclair','2026-11-17');const order=state.productions[0];
  state=createPlanningTask(state,{date:'2026-11-17',name:' Pétrir ',orderId:order.id,duration:120,responsible:' Sara '});
  state=createPlanningTask(state,{date:'2026-11-17',name:'Cuire',orderId:'',duration:400,responsible:''});
  state=createPlanningTask(state,{date:'2026-11-18',name:'Demain',orderId:'',duration:100,responsible:''});
  let overview=planningOverview(state,'2026-11-17');
  assert.equal(overview.load,520);
  assert.equal(overview.outstanding,520);
  assert.equal(overview.overloaded,true);
  state=markPlanningTask(state,state.planningTasks[0].id,true);
  overview=planningOverview(state,'2026-11-17');
  assert.equal(overview.load,520);
  assert.equal(overview.outstanding,400);
  assert.equal(state.planningTasks[0].name,'Pétrir');
  state=setDailyCapacity(state,600);
  assert.equal(planningOverview(state,'2026-11-17').overloaded,false);
  state=removePlanningTask(state,state.planningTasks[1].id);
  assert.equal(planningOverview(state,'2026-11-17').load,120);
  assert.deepEqual(state.lots,original);
});
test('planning calculates cumulative unstarted needs and excludes blocked or other site stock', () => {
  let state=structuredClone(seed);
  state=createProduction(state,20,'recette-eclair','2026-11-17');
  state=createProduction(state,10,'recette-eclair','2026-11-18');
  state.lots=state.lots.map(l=>l.id==='l1'?{...l,qte:1}:l.id==='l2'?{...l,bloque:true}:l);
  state=receive(state,{articleId:'farine',site:'Boutique',numero:'AUTRE',qte:100,pu:10,dlc:''});
  let view=planningOverview(state,'2026-11-16'); assert.equal(view.needs.length,0);
  view=planningOverview(state,'2026-11-18');
  const flour=view.needs.find(n=>n.articleId==='farine');
  assert.deepEqual(flour,{articleId:'farine',required:3,available:1,missing:2});
  assert.equal(view.needs.find(n=>n.articleId==='beurre').required,1.575);
  assert.equal(view.orders.length,2);
  state=startProduction(state,state.productions[0].id);
  view=planningOverview(state,'2026-11-18');
  assert.equal(view.orders.length,1);
  assert.equal(view.needs.find(n=>n.articleId==='farine').required,1);
  assert.equal(view.needs.find(n=>n.articleId==='farine').available,0);
});
test('planning preserves old undated orders and schedules only unstarted orders', () => {
  let state=createProduction(structuredClone(seed),20,'recette-eclair','2026-11-17');
  const id=state.productions[0].id;
  state.productions=state.productions.map(({plannedDate,...o})=>o);
  let view=planningOverview(state,'2026-11-18');
  assert.equal(view.unscheduled.length,1);
  assert.equal(view.needs.length,0);
  state=rescheduleProduction(state,id,'2026-11-18');
  view=planningOverview(state,'2026-11-18');
  assert.equal(view.unscheduled.length,0);
  assert.equal(view.needs.find(n=>n.articleId==='farine').required,2);
  state=startProduction(state,id);
  assert.throws(()=>rescheduleProduction(state,id,'2026-11-20'));
  const {planningTasks,dailyCapacity,...old}=state;
  const upgraded=upgradeState(old);
  assert.equal(upgraded.dailyCapacity,480);
  assert.deepEqual(upgraded.planningTasks,[]);
});
test('planning rejects invalid dates, tasks, capacity, and linked orders', () => {
  const state=structuredClone(seed);
  const task={date:'2026-11-17',name:'Cuire',orderId:'',duration:60,responsible:''};
  assert.throws(()=>createPlanningTask(state,{...task,date:'2026-02-30'}));
  assert.throws(()=>createPlanningTask(state,{...task,name:'  '}));
  assert.throws(()=>createPlanningTask(state,{...task,orderId:'unknown'}));
  assert.throws(()=>createPlanningTask(state,{...task,duration:1.5}));
  assert.throws(()=>setDailyCapacity(state,0));
  assert.throws(()=>markPlanningTask(state,'bad',true));
  assert.throws(()=>removePlanningTask(state,'bad'));
  assert.throws(()=>planningOverview(state,'2026-02-30'));
  assert.throws(()=>createProduction(state,20,'recette-eclair','2026-02-30'));
});

import { simulatePrice } from '../src/lib/patisgest-store.ts';
test('simulation varies materials only, keeps overhead, and does not change state', () => {
  const state=structuredClone(seed), original=structuredClone(state);
  const base=recipeCost(state); const result=simulatePrice(state,'recette-eclair',250,20).result;
  assert.equal(result.simulatedMaterials,base.materials*1.2);
  assert.equal(result.simulatedTotal,base.materials*1.2+base.labour+base.packaging+base.energy+base.overhead);
  assert.equal(result.unitCost,result.simulatedTotal/base.yieldNet);
  assert.equal(result.margin,250-result.unitCost);
  assert.equal(result.marginRate,(250-result.unitCost)/250*100);
  assert.deepEqual(state,original);
});
test('simulation rejects incomplete prices and validates hypotheses', () => {
  const state=structuredClone(seed);
  state.lots=state.lots.map(l=>l.articleId==='beurre'?{...l,pu:0}:l);
  const incomplete=simulatePrice(state,'recette-eclair',250,0);
  assert.equal(incomplete.result,null);
  assert.deepEqual(incomplete.missingPrices,['Beurre']);
  assert.throws(()=>simulatePrice(state,'recette-eclair',-1,0));
  assert.throws(()=>simulatePrice(state,'recette-eclair',100,-101));
  assert.throws(()=>simulatePrice(state,'recette-eclair',Infinity,0));
  assert.throws(()=>simulatePrice(state,'unknown',100,0));
});
test('simulation handles zero sale price and zero cost without division by zero', () => {
  let state=createRecipe(structuredClone(seed),'Zero','eclair',{...recipeInput(),labourMinutes:0,packaging:0,energy:0,overhead:0});
  const recipe=state.recipes.at(-1);
  const result=simulatePrice(state,recipe.id,0,-100).result;
  assert.equal(result.unitCost,0);
  assert.equal(result.marginRate,null);
  assert.equal(result.coefficient,null);
  assert.equal(result.suggestions[0].price,0);
});

import { previewZ, importZ } from '../src/lib/patisgest-store.ts';
test('Z preview validates mappings and decimals without changing state', () => {
  const state=structuredClone(seed), original=structuredClone(state);
  const p=previewZ(state,'2026-11-17','Caisse 1','Z-1','PF-001;2,5;250,00\nPF-001;1;200');
  assert.equal(p.lines.length,2);
  assert.equal(p.totalHT,825);
  assert.equal(p.totalTTC,981.75);
  assert.equal(p.lines[0].articleId,'eclair');
  assert.deepEqual(state,original);
});
test('Z import consumes FEFO, records sales and traces, and refuses duplicate IDs', () => {
  let state=structuredClone(seed);
  state=importZ(state,'2026-11-17',' Caisse 1 ','Z-1','PF-001;2;123,45');
  assert.equal(state.zImports.length,1);
  assert.equal(state.lots.find(l=>l.id==='l5').qte,18);
  const sale=state.sales[0];
  assert.equal(sale.date,'2026-11-17'); assert.equal(sale.source,'z-import');
  assert.equal(sale.totalHT,246.9); assert.equal(sale.totalTTC,293.81);
  assert.equal(traceLot(state,'l5').sales[0].sale.id,sale.id);
  assert.throws(()=>importZ(state,'2026-11-17','caisse 1','z-1','PF-001;2;123,45'));
  assert.equal(state.lots.find(l=>l.id==='l5').qte,18);
});
test('similar Z totals require explicit confirmation but allow legitimate distinct references', () => {
  let state=importZ(structuredClone(seed),'2026-11-17','C1','001','PF-001;1;250');
  assert.equal(previewZ(state,'2026-11-17','C2','002','PF-001;1;250').similar.length,1);
  assert.throws(()=>importZ(state,'2026-11-17','C2','002','PF-001;1;250'));
  state=importZ(state,'2026-11-17','C2','002','PF-001;1;250',true);
  assert.equal(state.zImports.length,2);
  assert.equal(state.lots.find(l=>l.id==='l5').qte,18);
  assert.throws(()=>importZ(state,'2026-11-17','C2','002','PF-001;1;250',true));
});
test('Z import rejects malformed or unknown lines atomically and records shortages', () => {
  const initial=structuredClone(seed), original=structuredClone(initial);
  for(const csv of ['PF-001;1;250\nABSENT;1;10','PF-001;1;250;extra','code;quantité;prix','PF-001;0;200','PF-001;1.12345;250','PF-001;1;-1','MAT-001;1;2']) assert.throws(()=>importZ(initial,'2026-11-17','C1','001',csv));
  assert.deepEqual(initial,original);
  const next=importZ(initial,'2026-11-17','C1','001','PF-001;25;250');
  assert.equal(next.sales[0].missing,5);
  assert.equal(next.movements.at(-1).lotId,'');
  assert.equal(next.lots.find(l=>l.id==='l5').qte,0);
  const {zImports,...old}=initial;
  assert.deepEqual(upgradeState(old).zImports,[]);
});
test('Z totals are exact cents: preview, Z record and imported sales always agree', () => {
  const state=structuredClone(seed);
  // Quantités décimales : arrondir chaque ligne puis sommer ne doit jamais diverger du total du Z.
  const csv='PF-001;0,3333;10,00\nPF-001;0,3333;10,00\nPF-001;0,3334;10,00';
  const preview=previewZ(state,'2026-11-17','C1','Z-9',csv);
  const next=importZ(state,'2026-11-17','C1','Z-9',csv);
  const z=next.zImports[0];
  const sales=z.saleIds.map(sid=>next.sales.find(s=>s.id===sid));
  assert.equal(sales.length,3);
  const sumHT=sales.reduce((s,x)=>s+Math.round(x.totalHT*100),0)/100;
  const sumTTC=sales.reduce((s,x)=>s+Math.round(x.totalTTC*100),0)/100;
  assert.equal(preview.totalHT,z.totalHT);
  assert.equal(preview.totalTTC,z.totalTTC);
  assert.equal(sumHT,z.totalHT);
  assert.equal(sumTTC,z.totalTTC);
  // L'ancien calcul (somme puis arrondi) donnait 10,00 HT / 11,90 TTC pour un Z dont les ventes totalisent 9,99 / 11,91.
  assert.equal(z.totalHT,9.99);
  assert.equal(z.totalTTC,11.91);
  for(const sale of sales){
    assert.equal(sale.totalHT,Math.round(sale.totalHT*100)/100);
    assert.equal(sale.totalTTC,Math.round(sale.totalTTC*100)/100);
  }
});
test('POS sale rounds HT and TTC totals to the centime', () => {
  const next=sell(structuredClone(seed),'eclair',0.3333);
  const sale=next.sales[0];
  assert.equal(sale.totalHT,83.33);
  assert.equal(sale.totalTTC,99.16);
  assert.equal(sale.totalHT,Math.round(sale.totalHT*100)/100);
  assert.equal(sale.totalTTC,Math.round(sale.totalTTC*100)/100);
});
