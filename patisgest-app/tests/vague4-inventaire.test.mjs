import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
// Import namespace : la sonde « avant » peut charger l'inventaire HEAD sans
// casser sur `nomsActions`, qui n'existait pas encore.
import * as inventaire from './inventaire-surface.mjs';
import { chaineDeploiement } from './migrations-historique.mjs';
const { nomsActions, surface } = inventaire;

/*
 * H20-07 / H20-08 / H20-10 / H20-11 / H18-01 / H20-02 : l'inventaire des
 * points d'entrée, le manifeste de migrations et les documents qui décrivent
 * leur nombre ou leur état.
 */

const lire = (chemin) => readFile(new URL(chemin, import.meta.url), 'utf8');

test('H20-08 : le parseur couvre const/arrow et fonction non async, sans compter les types', () => {
  const noms = nomsActions(`
"use server";
export async function une() {}
export const deux = async (x) => x;
export const trois = y => y;
export function quatre() {}
export default async function cinq() {}
export type TypeSeul = { x: number };
export interface InterfaceSeule { x: number }
export const constante = 42;
`);
  assert.deepEqual(noms, ['cinq', 'deux', 'quatre', 'trois', 'une']);
});

test('H20-07 : surface() reste comparée au JSON, mais le parseur est plus complet', async () => {
  const attendu = JSON.parse(await lire('./inventaire-surface.json'));
  const reel = await surface();
  assert.deepEqual(reel, attendu);
  assert.equal(Object.keys(reel.actions).length, 30);
  const total = Object.values(reel.actions).reduce((n, a) => n + a.length, 0);
  assert.equal(total, 90, 'le nombre d’actions doit être mesuré, pas écrit en dur dans un commentaire');
});

test('H20-11 : les commentaires exécutables ne figent plus « 87 actions »', async () => {
  const env = await lire('../.env.example');
  const trial = await lire('./trial-lock.test.mjs');
  assert.doesNotMatch(env, /87 actions/);
  assert.doesNotMatch(trial, /87 actions/);
  assert.match(env, /mesuré par/);
});

test('H20-10 : CHAINE-NON-REJOUABLE.md est explicitement archivé', async () => {
  const doc = await lire('../migrations/CHAINE-NON-REJOUABLE.md');
  assert.match(doc, /ARCHIVÉ/);
  assert.match(doc, /Ne pas utiliser comme état courant/);
  assert.match(doc, /01→57/);
});

test('H18-01/H20-02 : le manifeste 01→57 a un test actif, sans todo 01→43', async () => {
  const source = await lire('./chaine-rejouable.test.mjs');
  const chaine = chaineDeploiement();
  assert.doesNotMatch(source, /^\s*test\.todo\(/m);
  assert.match(source, /appliquerChaineActive/);
  assert.equal(chaine.length, 56);
  assert.equal(chaine[0], '01-socle.sql');
  assert.equal(chaine.at(-1), '57-onboarding-pack-dz-rpc.sql');
});
