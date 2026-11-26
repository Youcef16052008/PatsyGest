import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../src/app/api/health/route.ts';

/*
 * `/api/health` — sonde publique.
 *
 * Elle est appelée par la CI (attente de démarrage) et par la supervision.
 * Deux propriétés comptent :
 *   1. elle répond vite, sans réseau, même base en pause ;
 *   2. elle ne divulgue rien (pas de version de schéma, pas de tenant, pas
 *      d'e-mail, pas de message d'erreur).
 */

test('health : 200 JSON, sans accès réseau', async () => {
  const res = GET();
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(res.headers.get('cache-control'), 'no-store', 'une sonde ne doit pas être mise en cache');
  const corps = await res.json();
  assert.equal(corps.ok, true);
  assert.equal(corps.service, 'patisgest');
  assert.equal(typeof corps.ts, 'string');
  assert.equal(Number.isNaN(Date.parse(corps.ts)), false, 'horodatage invalide');
});

test('health : ne divulgue aucune donnée sensible', async () => {
  const texte = JSON.stringify(await GET().json()).toLowerCase();
  for (const interdit of [
    'supabase', 'postgres', 'password', 'secret', 'key', 'token',
    'client_id', 'clientid', 'tenant', '@', 'version', 'schema', 'migration',
    'stack', 'error', 'erreur',
  ]) {
    assert.equal(texte.includes(interdit), false, `la sonde divulgue « ${interdit} » : ${texte}`);
  }
});

test('health : la route n’importe aucun client base de données', async () => {
  // Un import de `createClient` ferait de la sonde une dépendance à la base :
  // en cas de pause Supabase, la supervision déclarerait l'application morte.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/app/api/health/route.ts', import.meta.url), 'utf8');
  assert.equal(/@\/lib\/supabase|createClient|from\s+["']@supabase/.test(src), false);
  assert.match(src, /export\s+const\s+dynamic\s*=\s*["']force-dynamic["']/);
});
