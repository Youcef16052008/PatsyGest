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
