// MOD-12 / US-12.1 — charge vs capacité (480 min).
//
// « je planifie la journée et je vois la charge vs capacité (ex. 480 min).
//   RG-12.1 : surcharge = alerte (répartition conseillée, jamais imposée). »
//
// Le piège de cette fonctionnalité, c'est de bloquer la saisie. Un laboratoire
// surchargé ne doit pas être empêché de planifier : il doit être averti. Ces
// tests verrouillent l'absence de blocage autant que le calcul.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chargeDuJour, repartitionConseillee, CAPACITE_DEFAUT } from '../src/lib/charge-capacite.ts';

const t = (duree, o = {}) => ({ id: `t-${Math.random()}`, dureeMin: duree, fait: false, responsable: null, ...o });

test('US-12.1 : la capacité par défaut est 480 minutes', () => {
  assert.equal(CAPACITE_DEFAUT, 480);
});

test('US-12.1 : la charge additionne les durées des tâches non terminées', () => {
  const c = chargeDuJour([t(120), t(180)], 480);
  assert.equal(c.charge, 300);
  assert.equal(c.restant, 180);
  assert.equal(c.niveau, 'ok');
});

test('US-12.1 : une tâche terminée ne consomme plus de capacité disponible', () => {
  // Le travail déjà fait ne peut pas être « replanifié » : le compter encore
  // ferait croire à une surcharge qui n'existe plus en fin de journée.
  const c = chargeDuJour([t(120, { fait: true }), t(180)], 480);
  assert.equal(c.charge, 180);
  assert.equal(c.tachesFaites, 1);
});

test('US-12.1 : dépasser la capacité est une alerte, jamais un refus', () => {
  const c = chargeDuJour([t(300), t(300)], 480);
  assert.equal(c.charge, 600);
  assert.equal(c.niveau, 'surcharge');
  assert.equal(c.depassement, 120);
  assert.equal(c.bloquant, false, 'RG-12.1 : la surcharge est une alerte');
});

test('US-12.1 : pile à capacité n’est pas une surcharge', () => {
  const c = chargeDuJour([t(240), t(240)], 480);
  assert.equal(c.charge, 480);
  assert.equal(c.niveau, 'plein');
  assert.equal(c.depassement, 0);
});

test('US-12.1 : une capacité nulle ou absurde n’entraîne pas de division par zéro', () => {
  for (const cap of [0, -10, Number.NaN]) {
    const c = chargeDuJour([t(60)], cap);
    assert.equal(c.capacite, CAPACITE_DEFAUT, `capacité ${cap} : repli sur 480`);
    assert.ok(Number.isFinite(c.taux));
  }
});

test('US-12.1 : une durée non finie n’empoisonne pas la journée', () => {
  const c = chargeDuJour([t(Number.NaN), t(60)], 480);
  assert.equal(c.charge, 60);
  assert.ok(Number.isFinite(c.taux));
});

test('US-12.1 : la répartition conseillée déplace du travail, elle ne supprime rien', () => {
  const taches = [t(300), t(300), t(120)];
  const r = repartitionConseillee(taches, 480);
  // Aucune tâche ne disparaît : on conseille seulement de décaler les plus
  // petites pour faire tenir la journée.
  assert.equal(r.avec.length + r.reportees.length, taches.length);
  assert.ok(r.reportees.length > 0, 'une surcharge doit produire une suggestion');
  const chargeAvec = r.avec.reduce((s, x) => s + x.dureeMin, 0);
  assert.ok(chargeAvec <= 480, `la journée conseillée tient : ${chargeAvec}`);
});

test('US-12.1 : une journée qui tient n’a rien à reporter', () => {
  const r = repartitionConseillee([t(120), t(120)], 480);
  assert.equal(r.reportees.length, 0);
  assert.match(r.message, /tient/i);
});

test('US-12.1 : la répartition par responsable signale le déséquilibre', () => {
  const c = chargeDuJour([
    t(300, { responsable: 'Amina' }),
    t(60, { responsable: 'Amina' }),
    t(60, { responsable: 'Youcef' }),
  ], 480);
  const amina = c.parResponsable.find((r) => r.responsable === 'Amina');
  const youcef = c.parResponsable.find((r) => r.responsable === 'Youcef');
  assert.equal(amina?.charge, 360);
  assert.equal(youcef?.charge, 60);
});

test('US-12.1 : les tâches sans responsable sont regroupées, pas éparpillées', () => {
  const c = chargeDuJour([t(60, { responsable: null }), t(30, { responsable: '  ' })], 480);
  const sans = c.parResponsable.filter((r) => !r.responsable);
  assert.equal(sans.length, 1);
  assert.equal(sans[0].charge, 90);
});
