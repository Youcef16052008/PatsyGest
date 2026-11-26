import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DESIGNS } from '../src/lib/appearance.ts';

const refinement = readFileSync(new URL('../src/app/refinement.css', import.meta.url), 'utf8');
const appearance = readFileSync(new URL('../src/app/appearance.css', import.meta.url), 'utf8');
const globals = readFileSync(new URL('../src/app/globals.css', import.meta.url), 'utf8');
const ratioWithWhite = (hex) => {
  const rgb = hex.match(/[0-9a-f]{2}/gi).map(n => parseInt(n, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return 1.05 / (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] + .05);
};

test('Chaque apparence personnalise les boutons et garde un contraste lisible en clair et sombre', () => {
  for (const { id } of DESIGNS) {
    assert.match(refinement, new RegExp(`:root\\[data-design='${id}'\\] \\{[^}]*--pg-action-radius:`));
    const theme = appearance.match(new RegExp(`:root\\[data-design='${id}'\\] \\{([^}]+)\\}`))[1];
    for (const name of ['--pg-accent', '--pg-dark-accent']) {
      const hex = theme.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, 'i'))[1];
      assert.ok(ratioWithWhite(hex) >= 4.5, `${id} ${name} : contraste insuffisant`);
    }
  }
});

test('Boutons et surfaces : styles chargés après la feuille de travail et états accessibles', () => {
  assert.ok(globals.indexOf('./refinement.css') > globals.indexOf('./workspace.css'));
  assert.match(refinement, /button\.bg-violet-700/);
  assert.match(refinement, /\.pg-button-secondary, \.pg-btn-sec/);
  assert.match(refinement, /\.bg-red-700, \.bg-emerald-700/);
  assert.match(refinement, /:focus-visible/);
  assert.match(refinement, /:disabled/);
  assert.match(refinement, /prefers-reduced-motion: reduce/);
  assert.match(refinement, /\.pg-card \{ box-shadow: var\(--pg-surface-shadow\)/);
});
