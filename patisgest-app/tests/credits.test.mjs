import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creditBalanceDa, sumOpenCreditsDa, applyCreditPayment } from '../src/lib/credits.ts';

/**
 * Slice 11 — suite unitaire du carnet de crédits (0 test avant cette vague).
 * Matrice 10 cas issue du rapport 11 : statuts, montants dégradés (undefined,
 * Infinity, chaîne JSON), frontière de tolérance, accumulation et somme.
 */

const base = (o = {}) => ({
  id: 'c1', nomDebiteur: 'Café', telephone: '', typeCompte: 'cafe_entreprise',
  montantTotalDa: 10000, montantRegleDa: 2500, dateEcheance: null,
  note: '', statut: 'ouvert', reglements: [], createdAt: '2026-11-24T08:00:00Z',
  ...o,
});

test('credits : solde selon le statut (1/10)', () => {
  assert.equal(creditBalanceDa(base()), 7500);
  assert.equal(creditBalanceDa(base({ statut: 'solde' })), 0);
  assert.equal(creditBalanceDa(base({ statut: 'annule' })), 0);
});

test('credits : un montant réglé supérieur au total ne rend pas un négatif (2/10)', () => {
  const v = creditBalanceDa(base({ montantRegleDa: 25000 }));
  assert.equal(Number.isFinite(v), true);
  assert.equal(v >= 0, true);
});

test('credits : montants dégradés → 0, jamais NaN (3/10, BUG-005)', () => {
  // Ces valeurs arrivent d'un blob localStorage ancien ou d'un import JSON.
  for (const bad of [undefined, null, Infinity, -Infinity, NaN, 'abc', {}]) {
    const v = creditBalanceDa(base({ montantTotalDa: bad }));
    assert.equal(Number.isFinite(v), true, `montantTotalDa=${String(bad)} ⇒ ${v}`);
  }
  for (const bad of [undefined, null, Infinity, NaN]) {
    const v = creditBalanceDa(base({ montantRegleDa: bad }));
    assert.equal(Number.isFinite(v), true, `montantRegleDa=${String(bad)} ⇒ ${v}`);
  }
});

test('credits : une chaîne JSON numérique reste exploitable (4/10)', () => {
  assert.equal(creditBalanceDa(base({ montantTotalDa: '10000', montantRegleDa: '2500' })), 7500);
});

test('credits : la somme ignore les entrées illisibles au lieu de propager NaN (5/10, BUG-005)', () => {
  const s = sumOpenCreditsDa([
    base({ montantTotalDa: 10000, montantRegleDa: 2500 }),
    base({ id: 'c2', montantTotalDa: 3200, montantRegleDa: 0 }),
  ]);
  assert.equal(s, 10700);

  const pourri = sumOpenCreditsDa([
    base({ montantTotalDa: 10000, montantRegleDa: 2500 }),
    base({ id: 'c3', montantTotalDa: undefined }),
  ]);
  assert.equal(Number.isFinite(pourri), true, `somme = ${pourri}`);
  assert.equal(pourri, 7500, 'la ligne illisible vaut 0, elle ne contamine pas le total');
});

test('credits : versement exact solde le crédit (6/10)', () => {
  const r = applyCreditPayment(base(), 7500);
  assert.equal(r.statut, 'solde');
  assert.equal(r.montantRegleDa, 10000);
  assert.equal(creditBalanceDa(r), 0);
});

test('credits : la tolérance de trop-perçu est d’un centime, pas au-delà (7/10, BUG-003)', () => {
  assert.equal(applyCreditPayment(base(), 7500.005).statut, 'solde');
  assert.equal(applyCreditPayment(base(), 7500.01).statut, 'solde');
  assert.throws(() => applyCreditPayment(base(), 7500.02), /dépasse le reste/);
  assert.throws(() => applyCreditPayment(base(), 7501), /dépasse le reste/);
});

test('credits : montants refusés (0, négatif, NaN, Infinity, non numérique) (8/10)', () => {
  for (const bad of [0, -1, -0.01, NaN, Infinity, -Infinity, 'abc', null, {}]) {
    assert.throws(() => applyCreditPayment(base(), bad), /invalide/i, `montant ${String(bad)}`);
  }
  assert.equal(applyCreditPayment(base(), '3000').montantRegleDa, 5500, 'chaîne numérique acceptée');
});

test('credits : crédit déjà soldé ou annulé refuse tout versement (9/10)', () => {
  assert.throws(() => applyCreditPayment(base({ statut: 'solde' }), 100), /déjà soldé ou annulé/);
  assert.throws(() => applyCreditPayment(base({ statut: 'annule' }), 100), /déjà soldé ou annulé/);
});

test('credits : accumulation sans dérive au centime (10/10)', () => {
  let c = base({ montantTotalDa: 100, montantRegleDa: 0 });
  for (let i = 0; i < 10; i++) c = applyCreditPayment(c, 10);
  assert.equal(c.montantRegleDa, 100);
  assert.equal(c.statut, 'solde');

  let c2 = base({ montantTotalDa: 0.3, montantRegleDa: 0 });
  c2 = applyCreditPayment(c2, 0.1);
  c2 = applyCreditPayment(c2, 0.2);
  assert.equal(c2.statut, 'solde', '0.1 + 0.2 doit solder un total de 0.3');
  assert.equal(c2.montantRegleDa, 0.3);
});

test('credits : le trop-perçu toléré ne crée pas d’incohérence comptable', () => {
  // Crédit SANS avance préexistante (l'avance est couverte par un test dédié) :
  // 7500.01 versés sur un reste de 7500.00 doivent enregistrer 7500.00 et
  // laisser montantRegleDa <= total.
  const sansAvance = base({ montantTotalDa: 7500, montantRegleDa: 0 });
  const r = applyCreditPayment(sansAvance, 7500.01);
  const sommeReglements = r.reglements.reduce((s, x) => s + x.montantDa, 0);
  assert.ok(r.montantRegleDa <= r.montantTotalDa, 'réglé > total');
  assert.equal(Math.round(sommeReglements * 100) / 100, Math.round(r.montantRegleDa * 100) / 100,
    `règlements (${sommeReglements}) ≠ réglé (${r.montantRegleDa})`);
});


test('credits : une avance antérieure non tracée ne crée pas de faux trou de caisse', () => {
  // Cas réel : crédit créé avec 2500 DA déjà réglés, puis solde versé.
  // Somme des lignes ≠ montant réglé ⇒ le rapprochement de tiroir ne tombe
  // jamais juste. Comportement attendu à documenter explicitement.
  const avecAvance = base({ montantTotalDa: 10000, montantRegleDa: 2500 });
  const r = applyCreditPayment(avecAvance, 7500);
  const somme = r.reglements.reduce((s, x) => s + x.montantDa, 0);
  assert.equal(r.statut, 'solde');
  assert.equal(
    Math.round(somme * 100) / 100,
    Math.round(r.montantRegleDa * 100) / 100,
    `lignes (${somme}) ≠ réglé (${r.montantRegleDa}) : avance initiale absente des règlements`,
  );
});

// ---------------------------------------------------------------------------
// Verrou structurel — réfutation de 11-BUG-001.
// Le rapport de la tranche 11 affirmait que la branche « demo » de
// `handleCreate` affichait un succès sans persister. Vérification : elle
// appelle bien `persistDemo([entry, ...credits])` (l. 116). Ce test empêche
// la régression inverse (quelqu'un retirant l'appel).
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WS = readFileSync(path.join(ROOT, 'src/components/credits-workspace.tsx'), 'utf8');

test('credits demo : créer un crédit le persiste (réfutation 11-BUG-001)', () => {
  const bloc = WS.slice(WS.indexOf('function handleCreate'), WS.indexOf('function handlePay'));
  assert.match(bloc, /if \(mode === "demo"\)/, 'branche démo introuvable');
  assert.match(bloc, /persistDemo\(\[entry, \.\.\.credits\]\)/, 'la création démo ne persiste plus');
  assert.match(WS, /localStorage\.setItem\(storageKey/, 'persistDemo n’écrit plus dans localStorage');
});
