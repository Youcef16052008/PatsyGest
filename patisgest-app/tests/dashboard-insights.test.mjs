import {test} from 'node:test';
import assert from 'node:assert/strict';
import { dashboardInsights } from '../src/lib/dashboard-insights.ts';
import { serieVentes } from '../src/lib/workspace-data.ts';

test('ventes comparées sur deux périodes de sept jours, jamais présentées comme bénéfice',()=>{
 const today='2026-11-18';
 const series=serieVentes([{date:today,totalTTC:150},{date:'2026-11-07',totalTTC:100}],today);
 const r=dashboardInsights(series,[],[],today);
 assert.equal(r.thisWeek,150); assert.equal(r.lastWeek,100); assert.equal(r.variation,50);
 assert.equal(dashboardInsights(serieVentes([],today),[],[],today).variation,null);
 assert.equal(dashboardInsights(null,null,null,today).thisWeek,null);
});

test('seuil de stock fini sans lots bloqués ou périmés ; données absentes distinctes de zéro',()=>{
 const article={id:'a',nom:'Éclair',niveau:'produit',unite:'pièce',code:'A',seuil:10};
 const lot=(qte,dlc,bloque)=>({id:String(qte),articleId:'a',siteId:'labo',numero:'L',qte,dlc,bloque,congele:false,recu:'2026-01-01'});
 const r=dashboardInsights(null,[article],[lot(3,null,false),lot(5,'2026-11-17',false),lot(2,null,true)],'2026-11-18');
 assert.equal(r.shortages[0].qty,3);assert.equal(r.shortages[0].manque,7);
 assert.equal(dashboardInsights(null,[article],null,'2026-11-18').shortages,null);
});

test('vitesse et couverture boutique excluent le labo et les stocks non éligibles', async()=>{
 const {productVelocity}=await import('../src/lib/dashboard-insights.ts');
 const a={id:'a',nom:'Tarte',code:'A',niveau:'produit',unite:'pièce',seuil:3};
 const lot=(site,qte,dlc=null,bloque=false)=>({id:site+qte,articleId:'a',siteId:site,numero:'1',qte,dlc,bloque,congele:false,recu:'2026-11-01'});
 const r=productVelocity([{date:'2026-11-18',lignes:[{articleId:'a',qty:14}]},{date:'2026-11-01',lignes:[{articleId:'a',qty:99}]}],[a],[lot('boutique',4),lot('labo',30),lot('boutique',20,'2026-11-17')],'2026-11-18',['boutique']);
 assert.equal(r[0].sold,14);assert.equal(r[0].stock,4);assert.equal(r[0].days,2);
 assert.equal(productVelocity(null,[a],[],'2026-11-18',['boutique']),null);
});

test('classement des alertes par couverture, sans comparer directement des unités différentes', async()=>{
 const {productVelocity}=await import('../src/lib/dashboard-insights.ts');
 const articles=[{id:'a',nom:'A',code:'A',niveau:'produit',unite:'kg',seuil:0},{id:'b',nom:'B',code:'B',niveau:'produit',unite:'pièce',seuil:0}];
 const l=(id,qte)=>({id,articleId:id,siteId:'boutique',numero:id,qte,dlc:null,bloque:false,congele:false,recu:'2026-01-01'});
 const result=productVelocity([{date:'2026-11-18',lignes:[{articleId:'a',qty:1},{articleId:'b',qty:100}]}],articles,[l('a',0.1),l('b',1000)],'2026-11-18',['boutique']);
 assert.equal(result[0].id,'a'); assert.equal(result[1].id,'b');
});
