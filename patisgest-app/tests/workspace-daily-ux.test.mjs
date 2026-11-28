import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { stockOverview, stockAlertRank } from '../src/lib/stock-overview.ts';
import { compareCakePriority } from '../src/lib/cake-priority.ts';

test('Synthèse stocks : articles comptés une fois par catégorie, alertes cumulables', () => {
  const summary = stockOverview([
    { signals: [{ label: 'Rupture', tone: 'danger' }, { label: 'DLC dépassée', tone: 'danger' }] },
    { signals: [{ label: 'Stock bas', tone: 'warning' }, { label: 'Lot bloqué', tone: 'warning' }] },
    { signals: [{ label: 'DLC proche', tone: 'warning' }] },
    { signals: [] },
  ]);
  assert.deepEqual(summary, { alertes: 3, quantites: 2, dates: 2, bloques: 1 });
  assert.ok(stockAlertRank([{ label: 'Rupture', tone: 'danger' }]) < stockAlertRank([{ label: 'Stock bas', tone: 'warning' }]));
  assert.ok(stockAlertRank([{ label: 'Stock bas', tone: 'warning' }]) < stockAlertRank([]));
});

test('Commandes : actives par date, puis terminées, sans modifier les données', () => {
  const rows = [
    { numero: '4', date: '2026-01-01', status: 'livre' },
    { numero: '3', date: '2026-12-02', status: 'devis' },
    { numero: '2', date: '2026-11-25', status: 'confirme' },
    { numero: '1', date: '2026-11-20', status: 'annule' },
    { numero: '5', date: '', status: 'devis' },
  ];
  assert.deepEqual([...rows].sort(compareCakePriority).map(r => r.numero), ['2', '3', '5', '1', '4']);
  assert.deepEqual(rows.map(r => r.numero), ['4', '3', '2', '1', '5']);
});

test('Atelier : les données indisponibles et les repères locaux sont annoncés', () => {
  const kitchen = readFileSync('src/components/kitchen-lab-screen.tsx', 'utf8');
  const workspace = readFileSync('src/components/production-workspace.tsx', 'utf8');
  assert.match(kitchen, /enregistrés uniquement sur cet appareil/);
  assert.match(kitchen, /ne modifient pas le statut officiel/);
  assert.match(kitchen, /cakes === null/);
  assert.match(kitchen, /orders === null/);
  assert.match(kitchen, /aria-pressed=\{st === target\}/);
  assert.match(kitchen, /Afficher plus de fournées/);
  assert.match(workspace, /orders=\{orders\}/);
});
