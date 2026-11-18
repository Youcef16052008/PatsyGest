import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { seed, createCake, payCake, advanceCake, addRecipeVersion, startProduction, completeProduction } from '../src/lib/patisgest-store.ts';
import { cakeConnectedTotals } from '../src/lib/cake-money.ts';

// Le devis mémorise la version choisie, même après publication d'une autre version.
test('dossier démo 20 parts : version figée, un seul OF, aucun stock consommé et lot traçable', () => {
  let state=structuredClone(seed);
  state=createCake(state,{client:'Client test',telephone:'',eventDate:'2028-03-04',portions:20,priceCents:10000,recipeId:'recette-eclair',productionQty:20,options:[],notes:''});
  const id=state.cakes[0].id, original=structuredClone(state.lots);
  const version=structuredClone(state.recipes[0].versions[0]);
  state=addRecipeVersion(state,'recette-eclair',{...version,ingredients:version.ingredients.map(i=>({...i,qty:i.qty*2}))});
  state=payCake(state,id,3000);
  assert.deepEqual(state.lots,original);
  state=advanceCake(state,id,'confirme');
  const ofId=state.cakes[0].ofId;
  assert.equal(state.productions.length,1);
  assert.equal(state.productions[0].snapshot.version,1);
  assert.deepEqual(state.productions[0].snapshot.ingredients,version.ingredients);
  assert.equal(state.productions[0].planned,20);
  assert.equal(state.productions[0].plannedDate,'2028-03-04');
  assert.deepEqual(state.lots,original);
  assert.strictEqual(advanceCake(state,id,'confirme'),state);
  state=startProduction(state,ofId);
  state=completeProduction(state,ofId,20,'GATEAU-20','2029-01-01');
  assert.equal(state.lots.find(l=>l.id===state.productions[0].producedLotIds[0]).numero,'GATEAU-20');
  assert.equal(state.cakes[0].ofId,ofId);
});

test('TVA non nulle : ticket et solde sont calculés en TTC', () => {
  assert.deepEqual(cakeConnectedTotals(100,19,30),{ttc:119,balance:89});
  assert.equal(cakeConnectedTotals(100,19,100).balance,19);
  assert.equal(cakeConnectedTotals(100,19,119).balance,0);
});

test('ficheCoutReal filtre effectivement les versions par produit demandé', async () => {
  const actions=await readFile(new URL('../src/lib/actions-couts.ts',import.meta.url),'utf8');
  assert.match(actions,/\.eq\(["']recette_familles\.produit_id["'],\s*produitId\)/);
  assert.match(actions,/selectProductVersion\(candidates,\s*produitId\)/);
});
