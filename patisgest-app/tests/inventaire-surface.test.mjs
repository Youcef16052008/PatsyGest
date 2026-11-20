import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { surface } from './inventaire-surface.mjs';

test('les routes et actions Next restent inventoriées', async () => {
 const expected=JSON.parse(await readFile(new URL('./inventaire-surface.json',import.meta.url),'utf8'));
 assert.deepEqual(await surface(),expected,'Mettre à jour l’inventaire et examiner les nouveaux points d’entrée');
});
