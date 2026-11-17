import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  rc01Consommation, rc02RendementNet, rc03CoutTotal, rc04MoChargee,
  rc05CoutParPortion, rc06Marge, rc07TauxPerte, rc08ManqueAJagner,
  rc10GardeFous, computeFicheCout,
} from '../src/lib/cost-sheet.ts';

test('RC-01 parage : quantité × (1 + %)', () => {
  assert.equal(rc01Consommation(10, 0), 10);
  assert.equal(rc01Consommation(10, 5), 10.5);
  assert.equal(rc01Consommation(0.9, 12.5), 1.0125);
  assert.throws(() => rc01Consommation(-1, 0));
});

test('RC-02 cuisson : net = brut × (1 − %)', () => {
  assert.equal(rc02RendementNet(100, 0), 100);
  assert.equal(rc02RendementNet(100, 12), 88);
  assert.equal(rc02RendementNet(40, 5), 38);
  assert.throws(() => rc02RendementNet(100, 101));
});

test('RC-04 MO : (min ÷ 60) × taux × (1 + charges %)', () => {
  assert.equal(rc04MoChargee(60, 400, 0), 400);
  assert.equal(rc04MoChargee(90, 400, 25), 750); // 1.5 × 400 × 1.25 = 750
  assert.equal(rc04MoChargee(0, 400, 25), 0);
});

test('RC-03 total : somme des5 composantes, arrondi centime', () => {
  assert.equal(rc03CoutTotal(1000.55, 100.01, 625, 50.51, 200.49), 1976.56);
});

test('RC-05 portion : total ÷ net (pas de TVA)', () => {
  assert.equal(rc05CoutParPortion(1976.56, 88), 22.4609);
  assert.throws(() => rc05CoutParPortion(100, 0));
});

test('RC-06 marge : PV HT − coût, taux sur HT', () => {
  assert.deepEqual(rc06Marge(100, 60), { marge: 40, taux: 0.4 });
  assert.deepEqual(rc06Marge(50, 70), { marge: -20, taux: -0.4 });
  assert.deepEqual(rc06Marge(0, 10), { marge: -10, taux: 0 });
});

test('RC-07 perte et RC-08 manque à gagner', () => {
  assert.equal(rc07TauxPerte(2, 3, 100), 0.05);
  assert.equal(rc08ManqueAJagner(2, 3, 250), 1250);
});

test('RC-10 garde-fous : ×10, ÷10, prix >2× — non bloquants', () => {
  assert.equal(rc10GardeFous(100, 100).length, 0);
  assert.equal(rc10GardeFous(900, 100).length, 0);           // ×9 < ×10 → rien
  assert.equal(rc10GardeFous(1000, 100)[0]?.code, 'RC-10-x10');
  assert.equal(rc10GardeFous(10, 100)[0]?.code, 'RC-10-div10');
  assert.equal(rc10GardeFous(5, 100)[0]?.code, 'RC-10-div10'); // ×0,05 ≤ ÷10
  assert.equal(rc10GardeFous(100, null).length, 0);          // pas de référence
  assert.equal(rc10GardeFous(100, 100, 300, 100)[0]?.code, 'RC-10-prix2x');
  assert.equal(rc10GardeFous(100, 100, 199, 100).length, 0); //199 <200
});

test('Fiche complète : RC-02..06 cohérents', () => {
  const f = computeFicheCout({
    matiereFefo: 1200, emballage: 100, moMin: 90, tauxHoraire: 400, chargesPct: 25,
    energie: 50, fraisGeneraux: 200, rendementBrut: 40, cuissonPct: 0, pvHt: 500,
  });
  assert.equal(f.rc04Mo, 750);                       //1.5 ×400 ×1.25
  assert.equal(f.rc03Total, 2300);                   //1200+100+750+50+200
  assert.equal(f.rc02RendementNet, 40);
  assert.equal(f.rc05ParPortion, 57.5);              //2300 ÷40
  assert.deepEqual(f.rc06, { marge: 442.5, taux: 0.885 }); //500−57.5=442.5
});
