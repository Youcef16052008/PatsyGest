import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, statSync } from 'node:fs';
import { cakeDayLabel, ownerDayPlan, productionDayLabel } from '../src/lib/owner-day.ts';

const today = '2026-12-31';
const base = { today, articles: [], lots: [], cakes: [], orders: [], creditsDa: 0, creditsAvailable: true, salesAvailable: true };
const article = { id: 'a', nom: 'Farine', code: 'F', niveau: 'matiere', unite: 'kg', seuil: 3 };
const lot = { id: 'l', articleId: 'a', siteId: 's', numero: 'L', qte: 1, dlc: '2026-12-30', bloque: false, congele: false, recu: '2026-12-01' };
const cake = (id, eventDate, statut = 'confirme') => ({ id, client: id, eventDate, statut });
const order = (id, date, statut) => ({ id, numero: id, title: id, date, statut, planned: 1, done: 0, site: 'Labo' });

test('Priorités : dates dépassées et commandes du jour avant stock et crédits', () => {
  const plan = ownerDayPlan({ ...base, articles: [article], lots: [lot], cakes: [cake('A', today), cake('B', '2026-12-30')], creditsDa: 1200 });
  assert.deepEqual(plan.actions.map(a => a.id), ['expired', 'cakes', 'stock', 'credits']);
  assert.equal(plan.actions[0].href, '/stocks?filtre=alerte');
  assert.equal(plan.actions[3].href, '/caisse#carnet-credits');
  assert.match(plan.actions[1].explanation, /B, A/);
});

test('Demain : dates exactes et seulement les commandes et fournées actives', () => {
  const plan = ownerDayPlan({ ...base, cakes: [cake('demain', '2027-01-01'), cake('livrée', '2027-01-01', 'livre'), cake('autre', '2027-01-02')], orders: [order('à lancer', '2027-01-01', 'planifie'), order('terminée', '2027-01-01', 'termine'), order('plus tard', '2027-01-02', 'planifie')] });
  assert.deepEqual(plan.tomorrowCakes.map(c => c.id), ['demain']);
  assert.deepEqual(plan.tomorrowOrders.map(o => o.id), ['à lancer']);
});

test('Données indisponibles et lots bloqués : pas d’alerte inventée', () => {
  const plan = ownerDayPlan({ ...base, articles: null, lots: [lot], cakes: null, orders: null, creditsDa: 1000, creditsAvailable: false });
  assert.deepEqual(plan.actions, []);
  const blocked = ownerDayPlan({ ...base, articles: [article], lots: [{ ...lot, bloque: true }] });
  assert.ok(!blocked.actions.some(a => a.id === 'expired'));
  assert.ok(blocked.actions.some(a => a.id === 'stock'));
});

test('Détails financiers : pas de seuil calculé sans charges enregistrées ou ventes disponibles', () => {
  const component = readFileSync('src/components/shop-advisor-panel.tsx', 'utf8');
  assert.match(component, /configured && series &&/);
  assert.match(component, /pas un bénéfice réel/);
  assert.doesNotMatch(component, /report\.recommendations\.slice/);
});


test('Accueil : illustration locale légère et animations respectant la réduction des mouvements', () => {
  const css = readFileSync('src/app/workspace.css', 'utf8');
  const page = readFileSync('src/components/owner-day-overview.tsx', 'utf8');
  assert.ok(statSync('public/appearance/owner-patisserie.webp').size < 150_000);
  assert.match(css, /owner-patisserie\.webp/);
  assert.match(css, /prefers-reduced-motion: no-preference/);
  assert.match(css, /pg-owner-zoom 14s/);
  assert.match(css, /pg-owner-sparkle 4s/);
  assert.match(css, /pg-owner-actions li:nth-child\(3\)/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(page, /pg-owner-hero-art" aria-hidden="true"/);
  assert.match(page, /id="owner-today"/);
  assert.match(page, /id="owner-tomorrow"/);
});


test('DLC proches : seulement les lots actifs entre aujourd’hui et J+2', () => {
  const lots = [
    { ...lot, id: 'today', dlc: today },
    { ...lot, id: 'soon', dlc: '2027-01-02' },
    { ...lot, id: 'later', dlc: '2027-01-03' },
    { ...lot, id: 'blocked', dlc: today, bloque: true },
    { ...lot, id: 'empty', dlc: today, qte: 0 },
  ];
  const plan = ownerDayPlan({ ...base, articles: [article], lots, creditsDa: 1000 });
  const alert = plan.actions.find(a => a.id === 'expiring');
  assert.match(alert.title, /^2 lots/);
  assert.match(alert.explanation, /propres à la consommation/);
  assert.equal(alert.href, '/stocks?filtre=alerte');
  assert.ok(plan.actions.some(a => a.id === 'credits'));
});

test('Préparation : statuts réels et quantités prévues sans inventer de données', () => {
  assert.equal(cakeDayLabel(cake('A', today, 'devis')), 'A (devis)');
  assert.equal(cakeDayLabel(cake('B', today, 'produit')), 'B (prête)');
  assert.equal(cakeDayLabel(cake('C', today, 'inconnu')), 'C (statut à vérifier)');
  assert.equal(productionDayLabel(order('Croissants', today, 'planifie')), 'Croissants · 1 prévu');
  assert.equal(productionDayLabel({ ...order('Croissants', today, 'planifie'), planned: NaN }), 'Croissants');
});

test('Animation décorative : bouton de pause et cibles adaptées au tactile', () => {
  const css = readFileSync('src/app/workspace.css', 'utf8');
  const control = readFileSync('src/components/owner-motion-control.tsx', 'utf8');
  assert.match(control, /aria-pressed=\{paused\}/);
  assert.match(control, /data-motion-paused/);
  assert.match(css, /animation-play-state: paused/);
  assert.match(css, /pg-owner-actions \.pg-text-link, \.pg-owner-tomorrow-row \.pg-text-link \{ min-height: 44px/);
});
