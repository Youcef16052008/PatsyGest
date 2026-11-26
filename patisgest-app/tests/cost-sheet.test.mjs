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

test('RC-07 réel : agrégation des clôtures par produit', async () => {
  const { aggregatePertes, rc08ManqueAJagner } = await import('../src/lib/cost-sheet.ts');
  const clotures = [
    { produitId: 'PF-CRO', produit: 78, jete: 4, casse: 2 },
    { produitId: 'PF-CRO', produit: 10, jete: 1, casse: 0 },
    { produitId: 'PF-MIL', produit: 24, jete: 1, casse: 1 },
    { produitId: 'PF-CRO', produit: 0, jete: 0, casse: 0 },
  ];
  const r = aggregatePertes(clotures, 'PF-CRO');
  assert.equal(r.produit, 88);
  assert.equal(r.jete, 5);
  assert.equal(r.casse, 2);
  assert.equal(r.taux, 0.0795); //7 ÷88 =0,079545…→0,0795
  assert.equal(rc08ManqueAJagner(r.jete, r.casse, 250), 1750);
  // produit absent → tout à0, pas de division par0
  assert.deepEqual(aggregatePertes(clotures, 'PF-XXX'), { produit: 0, jete: 0, casse: 0, taux: 0 });
});

test('RC : bornes hostiles refusées, jamais un coût faux (W2-D2)', () => {
  // 1. ÷0 : un rendement net nul ne doit jamais produire Infinity/NaN.
  assert.throws(() => rc05CoutParPortion(1000, 0), /rendement net/);
  assert.throws(() => rc05CoutParPortion(1000, -1), /rendement net/);
  // 2. parage à 100 % est LÉGAL (perte totale) mais jamais au-delà de 1000 %.
  assert.equal(rc01Consommation(10, 100), 20);
  assert.throws(() => rc01Consommation(10, 1000.1), /parage/);
  assert.throws(() => rc01Consommation(10, -0.1), /parage/);
  // 3. cuisson 100 % => rendement net nul, pas négatif.
  assert.equal(rc02RendementNet(10, 100), 0);
  assert.throws(() => rc02RendementNet(10, 100.1), /cuisson/);
  // 4. PV HT nul : marge négative assumée, taux 0 (pas de ÷0).
  const m = rc06Marge(0, 500);
  assert.equal(m.marge, -500);
  assert.equal(m.taux, 0);
  // 5. NaN / Infinity / texte refusés partout.
  for (const mauvais of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => rc03CoutTotal(mauvais, 0, 0, 0, 0), /RC-03/);
    assert.throws(() => rc07TauxPerte(mauvais, 0, 10), /RC-07/);
    assert.throws(() => rc08ManqueAJagner(0, mauvais, 10), /RC-08/);
  }
  // 6. Fabriqué nul : ÷0 refusé.
  assert.throws(() => rc07TauxPerte(1, 1, 0), /fabriqué/);
  // 7. RC-10 : référence nulle/absente => aucune alerte (pas de faux positif).
  assert.deepEqual(rc10GardeFous(1000, null), []);
  assert.deepEqual(rc10GardeFous(1000, 0), []);
  // 8. RC-10 : bornes exactes ×10 et ÷10 déclenchent, 9,9× non.
  assert.equal(rc10GardeFous(1000, 100).some((g) => g.code === 'RC-10-x10'), true);
  assert.equal(rc10GardeFous(990, 100).some((g) => g.code === 'RC-10-x10'), false);
  assert.equal(rc10GardeFous(10, 100).some((g) => g.code === 'RC-10-div10'), true);
  assert.equal(rc10GardeFous(11, 100).some((g) => g.code === 'RC-10-div10'), false);
  // 9. prix exactement 2× ne déclenche pas (strictement supérieur).
  assert.deepEqual(rc10GardeFous(100, 100, 200, 100), []);
  assert.equal(rc10GardeFous(100, 100, 200.01, 100).some((g) => g.code === 'RC-10-prix2x'), true);
});
