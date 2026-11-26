import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Remplace `actions-caisse-sellproduct.test.mjs`.
 *
 * `sellProduct` était une action serveur exportée (« use server »), sans
 * aucun appelant : sa branche de succès était de fait morte, et elle
 * élargissait inutilement la surface d'actions exposées au client. Elle a été
 * supprimée ; ce fichier verrouille l'absence de retour en arrière et
 * l'inventaire de surface.
 */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lire = (p) => readFileSync(path.join(ROOT, p), 'utf8');

test('actions-caisse.ts n’expose plus sellProduct', () => {
  const src = lire('src/lib/actions-caisse.ts');
  assert.equal(/export\s+async\s+function\s+sellProduct/.test(src), false, 'sellProduct est réapparue');
  assert.equal(src.includes('sellProduct'), false, 'référence résiduelle à sellProduct');
});

test('sellCart, createAvoir et importZReal restent exportées', () => {
  const src = lire('src/lib/actions-caisse.ts');
  for (const nom of ['sellCart', 'createAvoir', 'importZReal']) {
    assert.match(src, new RegExp(`export\\s+async\\s+function\\s+${nom}\\b`), `${nom} a disparu`);
  }
});

test('aucun fichier du code applicatif n’appelle sellProduct', () => {
  const src = lire('src/lib/actions-caisse.ts') + lire('tests/inventaire-surface.json');
  assert.equal(src.includes('sellProduct'), false);
});

test('l’inventaire de surface reflète exactement les actions de actions-caisse.ts', () => {
  const inventaire = JSON.parse(lire('tests/inventaire-surface.json'));
  const liste = inventaire.actions['src/lib/actions-caisse.ts'];
  assert.ok(Array.isArray(liste), 'entrée d’inventaire manquante');
  assert.deepEqual([...liste].sort(), ['createAvoir', 'importZReal', 'sellCart']);
  const src = lire('src/lib/actions-caisse.ts');
  const reels = [...src.matchAll(/export\s+async\s+function\s+(\w+)/g)].map((m) => m[1]).sort();
  assert.deepEqual(reels, [...liste].sort(), 'inventaire et exports divergent');
});
