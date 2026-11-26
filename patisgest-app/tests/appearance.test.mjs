import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DESIGNS, modeActif, readAdvancedMode, readAppearance, writeAppearance } from '../src/lib/appearance.ts';
import { colonneProduction, correspond, dateLisible, indexLots, ordreLots, serieVentes, siteCaisse, stockArticle, stockParSite } from '../src/lib/workspace-data.ts';

const today = '2026-11-17';
const flour = { id: 'a', nom: 'Farine', code: 'MAT-001', niveau: 'matiere', unite: 'kg', seuil: 5 };
const lot = (id, changes = {}) => ({ id, articleId: 'a', siteId: 'b', numero: `L-${id}`, qte: 2.635, recu: today, dlc: '2026-11-19', congele: false, bloque: false, ...changes });

test('Apparence : cinq designs, chacun avec son propre thème clair/sombre', () => {
  assert.equal(DESIGNS.length, 5);
  assert.deepEqual(DESIGNS.map((d) => d.id), ['atelier', 'pilotage', 'fabrication', 'comptoir', 'essentiel']);

  const base = readAppearance();
  assert.equal(base.design, 'atelier');
  assert.deepEqual(Object.values(base.modes), ['light', 'light', 'light', 'light', 'light']);

  const custom = { design: 'comptoir', modes: { atelier: 'light', pilotage: 'dark', fabrication: 'light', comptoir: 'dark', essentiel: 'light' } };
  const roundTrip = readAppearance(writeAppearance(custom));
  assert.deepEqual(roundTrip, custom);
  assert.equal(modeActif(roundTrip), 'dark');

  const switched = { design: 'pilotage', modes: roundTrip.modes };
  assert.equal(modeActif(readAppearance(writeAppearance(switched))), 'dark');
  assert.equal(modeActif({ design: 'atelier', modes: roundTrip.modes }), 'light');
});

test('Apparence : anciens cookies et valeurs invalides restent sûrs', () => {
  // Design inconnu ou mode illisible : on retombe sur le design par défaut, en clair.
  for (const raw of ['\"><script>','unknown.dddddd','atelier.ddddd.x','atelier.%3cdark','']) {
    const result = readAppearance(raw);
    assert.equal(result.design, 'atelier');
    assert.deepEqual(Object.values(result.modes), ['light', 'light', 'light', 'light', 'light']);
  }
  // Design connu mais mode illisible : le design est conservé, en clair.
  assert.equal(readAppearance('fabrication.invalid').design, 'fabrication');
  assert.equal(modeActif(readAppearance('fabrication.invalid')), 'light');
  // Ancien format « design.mode » : le mode s'applique au design choisi.
  assert.equal(modeActif(readAppearance('comptoir.d')), 'dark');
  assert.equal(modeActif(readAppearance('atelier.l')), 'light');
  assert.equal(readAppearance('inconnu.d').design, 'atelier');
  // Nouveau format : une lettre par design.
  assert.deepEqual(readAppearance('essentiel.ldldl').modes, { atelier: 'light', pilotage: 'dark', fabrication: 'light', comptoir: 'dark', essentiel: 'light' });
  assert.equal(readAdvancedMode('1'), true);
  assert.equal(readAdvancedMode('0'), false);
  assert.equal(readAdvancedMode(undefined), false);
});

test('Stocks : la quantité non bloquée reste exacte et la DLC reste visible', () => {
  const rows = [lot('1'), lot('2', { qte: 7, bloque: true, dlc: '2026-11-10' }), lot('3', { siteId: 'c', dlc: '2026-11-16' }), lot('4',{qte:0})];
  const b = indexLots(rows, 'b').get(flour.id);
  assert.equal(b.length, 2);
  assert.deepEqual(stockArticle(flour, b, today), { quantity: 2.635, nextDlc: '2026-11-19', signals: [
    { label: 'DLC proche', tone: 'warning' }, { label: 'Stock bas', tone: 'warning' }, { label: 'Lot bloqué', tone: 'warning' },
  ]});
  assert.equal(stockArticle(flour, indexLots(rows).get('a'), today).signals[0].label, 'DLC dépassée');
  assert.deepEqual(stockParSite(rows), { b: { a: 2.635 }, c: { a: 2.635 } });
});

test('Stocks : les lots utilisables sont présentés dans l’ordre FEFO et les bloqués à part', () => {
  const rows = [lot('1',{congele:true,dlc:'2026-11-18'}), lot('2',{dlc:null}), lot('3',{bloque:true}), lot('4')];
  assert.deepEqual(rows.sort(ordreLots).map(l => l.id), ['4','2','1','3']);
});

test('Caisse : une boutique effectivement configurée est préférée au premier site', () => {
  assert.equal(siteCaisse([{id:'l',type:'laboratoire'}, {id:'b',type:'boutique'}]), 'b');
  assert.equal(siteCaisse([{id:'l',type:'laboratoire'}]), 'l');
  assert.equal(siteCaisse([]), '');
});

test('Recherche par nom et code, avec ou sans accents', () => {
  assert.ok(correspond('Éclair au chocolat PF-002', ' ECLAIR  Pf-002 '));
  assert.ok(!correspond('Crème entière', 'creme allégée'));
  assert.equal(dateLisible(undefined), '—');
});

test('Production : une fournée partielle est en cours, jamais terminée', () => {
  assert.equal(colonneProduction('planifie'), 'planifie');
  assert.equal(colonneProduction('partiel'), 'encours');
  assert.equal(colonneProduction('termine'), 'termine');
  assert.equal(colonneProduction('annule'), 'autre');
});

test('Pilotage : la série couvre 14 jours, compte les tickets et conserve les centimes', () => {
  const ventes = [{ date:today, totalTTC:10.01 }, { date:today, totalTTC:10.17 }, { date:'2026-11-06',totalTTC:90 }, { date:'2026-11-02',totalTTC:200 }];
  const series = serieVentes(ventes, today);
  assert.equal(series.length, 14);
  assert.equal(series[0].day, '2026-11-04');
  assert.deepEqual(series.at(-1), { day:today, ttc:20.18, tickets:2 });
  assert.equal(series.slice(-7).reduce((s,v) => s+v.tickets,0), 2);
  assert.equal(series.reduce((s,v) => s+v.tickets,0), 3);
  assert.equal(serieVentes(ventes, today, 30).length, 30);
});
