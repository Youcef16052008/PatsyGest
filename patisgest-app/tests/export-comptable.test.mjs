// MOD-15 / §8.3 — export comptable.
//
// Le CDC demande un export « date, pièce, compte auxiliaire, HT, TVA, TTC ».
// L'audit a relevé que l'export CSV de ventes brutes ne suffit pas : un
// comptable ne peut pas passer une écriture depuis un dump de tickets.
//
// Deux risques sont verrouillés ici :
//   1. les montants doivent se réconcilier au centime (Σ HT + Σ TVA = Σ TTC) ;
//   2. les avoirs sont des montants **négatifs**. Les oublier gonflerait le
//      chiffre d'affaires déclaré, ce qui n'est pas une erreur d'arrondi mais
//      une erreur fiscale.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ecrituresComptables, controleEquilibre, entetesComptables } from '../src/lib/export-comptable.ts';

const vente = (o = {}) => ({
  id: 'v1', numero: 'V-001', date: '2026-11-20', site: 'Boutique',
  totalHT: 1000, totalTTC: 1190, tva: 19, ...o,
});
const avoir = (o = {}) => ({
  id: 'a1', numero: 'AV-001', date: '2026-11-21', site: 'Boutique',
  totalHT: 200, totalTTC: 238, tva: 19, ...o,
});

test('§8.3 : chaque vente produit une écriture au débit client', () => {
  const e = ecrituresComptables({ ventes: [vente()], avoirs: [] });
  assert.equal(e.length, 1);
  assert.equal(e[0].piece, 'V-001');
  assert.equal(e[0].date, '2026-11-20');
  assert.equal(e[0].debit, 1190);
  assert.equal(e[0].credit, 0);
});

test('§8.3 : l’écriture porte les trois colonnes exigées par le CDC', () => {
  const [l] = ecrituresComptables({ ventes: [vente()], avoirs: [] });
  assert.equal(l.ht, 1000);
  assert.equal(l.tva, 190);
  assert.equal(l.ttc, 1190);
  assert.equal(l.compteAuxiliaire.length > 0, true, 'compte auxiliaire obligatoire');
});

test('§8.3 : un avoir est un montant négatif, jamais une vente', () => {
  const e = ecrituresComptables({ ventes: [vente()], avoirs: [avoir()] });
  const lAvoir = e.find((l) => l.piece === 'AV-001');
  assert.equal(lAvoir.ht, -200);
  assert.equal(lAvoir.tva, -38);
  assert.equal(lAvoir.ttc, -238);
  assert.equal(lAvoir.sens, 'avoir');
});

test('§8.3 : la somme se réconcilie au centime près', () => {
  const r = ecrituresComptables({
    ventes: [vente(), vente({ id: 'v2', numero: 'V-002', totalHT: 333.33, totalTTC: 396.66 })],
    avoirs: [avoir()],
  });
  const c = controleEquilibre(r);
  assert.equal(c.ok, true, `écart : ${c.ecart}`);
  assert.equal(c.verse, true, 'une écriture équilibrée est versable');
});

test('§8.3 : un écart de TVA est détecté, pas arrondi sous le tapis', () => {
  // 19 % de 1000 = 190, mais la vente annonce 150 : incohérence.
  const r = ecrituresComptables({ ventes: [vente({ totalTTC: 1150 })], avoirs: [] });
  const c = controleEquilibre(r);
  // La somme tient par construction (TVA déduite du TTC), mais la ligne est
  // incohérente avec le taux déclaré : c'est l'anomalie qui interdit le versement.
  assert.equal(c.ok, true);
  assert.equal(c.verse, false, 'on ne verse pas un export qui ne tombe pas juste');
  assert.equal(c.ecart, 0, 'la TVA est déduite du TTC, donc Σ tient : c’est l’anomalie qui bloque');
  assert.equal(c.anomalies, 1, 'la ligne incohérente est comptée');
});

test('§8.3 : l’export est trié par date puis par pièce', () => {
  const r = ecrituresComptables({
    ventes: [vente({ id: 'v2', numero: 'V-002', date: '2026-11-22' }), vente({ date: '2026-11-20' })],
    avoirs: [avoir({ date: '2026-11-21' })],
  });
  assert.deepEqual(r.map((l) => l.piece), ['V-001', 'AV-001', 'V-002']);
});

test('§8.3 : une période vide produit un export vide, pas une erreur', () => {
  const r = ecrituresComptables({ ventes: [], avoirs: [] });
  assert.deepEqual(r, []);
  assert.equal(controleEquilibre(r).ok, true);
});

test('§8.3 : les montants non finis sont neutralisés et signalés', () => {
  const r = ecrituresComptables({
    ventes: [vente({ totalHT: Number.NaN })],
    avoirs: [],
  });
  assert.equal(r[0].ht, 0);
  assert.equal(r[0].anomalie, true, 'une ligne anormale doit être visible, pas silencieuse');
});

test('§8.3 : le compte auxiliaire est stable et propre (pas de doublon de casse)', () => {
  const a = ecrituresComptables({ ventes: [vente({ site: 'Boutique' })], avoirs: [] });
  const b = ecrituresComptables({ ventes: [vente({ site: ' boutique ' })], avoirs: [] });
  assert.equal(a[0].compteAuxiliaire, b[0].compteAuxiliaire);
});

test('§8.3 : les en-têtes suivent exactement le format du CDC', () => {
  assert.deepEqual(entetesComptables, ['date', 'piece', 'compte_auxiliaire', 'ht', 'tva', 'ttc', 'sens', 'anomalie']);
});
