import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

/*
 * `modules-access.ts` — modules désactivés pour le tenant.
 *
 * Le contrat est court mais vital : `null` signifie « lecture impossible »,
 * jamais « rien de désactivé ». Confondre les deux réactiverait en silence
 * tous les modules coupés par le patron.
 *
 * `modules-access-db.test.mjs` couvre la RPC SQL ; ce fichier couvre le
 * module TypeScript : mode pilote, réponses dégradées, exception de transport.
 */

const serverUrl = new URL('../src/lib/supabase/server.ts', import.meta.url).href;
let rpcResult = { data: [], error: null };
let rpcLeve = false;

mock.module(serverUrl, {
  namedExports: {
    createClient: async () => ({
      rpc: async () => {
        if (rpcLeve) throw new Error('transport cassé');
        return rpcResult;
      },
    }),
  },
});

const { lireModulesDesactives } = await import('../src/lib/modules-access.ts');

const ctx = (surcharge = {}) => ({
  authUserId: 'a', email: 'e@e.test', nom: 'N', utilisateurId: 'u',
  clientId: 'c', clientNom: 'C', role: 'proprietaire', mode: 'supabase',
  ...surcharge,
});

test('modules : mode pilote-local => ensemble vide, sans appeler la base', async () => {
  rpcLeve = false;
  rpcResult = { data: ['caisse'], error: null };
  const r = await lireModulesDesactives(ctx({ mode: 'pilote-local' }));
  assert.deepEqual([...r], []);
  // Et surtout : la RPC n'a pas été consultée (le pilote local n'a pas de base).
  assert.equal(rpcResult.data.length, 1, 'le résultat ne doit pas venir de la RPC');
});

test('modules : liste normale => Set des clés désactivées', async () => {
  rpcLeve = false;
  rpcResult = { data: ['couts', 'credits'], error: null };
  const r = await lireModulesDesactives(ctx());
  assert.equal(r instanceof Set, true);
  assert.deepEqual([...r].sort(), ['couts', 'credits']);
  assert.equal(r.has('caisse'), false);
});

test('modules : liste vide => Set vide (tout est actif)', async () => {
  rpcLeve = false;
  rpcResult = { data: [], error: null };
  const r = await lireModulesDesactives(ctx());
  assert.equal(r instanceof Set, true);
  assert.equal(r.size, 0);
});

test('modules : erreur RPC => null (lecture impossible), jamais un Set vide', async () => {
  rpcLeve = false;
  rpcResult = { data: null, error: { message: 'boom', code: '42P01' } };
  assert.equal(await lireModulesDesactives(ctx()), null, 'une erreur ne doit pas passer pour « rien de désactivé »');
});

test('modules : réponse de forme inattendue => null', async () => {
  rpcLeve = false;
  for (const data of [
    null,
    'caisse',
    { 0: 'caisse' },
    [1, 2, 3],
    ['ok', null],
    [{}],
    [['caisse']],
  ]) {
    rpcResult = { data, error: null };
    assert.equal(
      await lireModulesDesactives(ctx()), null,
      `forme acceptée à tort : ${JSON.stringify(data)}`,
    );
  }
});

test('modules : exception de transport => null, jamais une exception', async () => {
  rpcLeve = true;
  try {
    assert.equal(await lireModulesDesactives(ctx()), null);
  } finally {
    rpcLeve = false;
  }
});

test('modules : les doublons sont absorbés par le Set', async () => {
  rpcLeve = false;
  rpcResult = { data: ['couts', 'couts', 'credits'], error: null };
  assert.equal((await lireModulesDesactives(ctx())).size, 2);
});

test('modules : une clé inconnue est conservée telle quelle (le filtrage est aval)', async () => {
  // Le module ne décide pas ce qu'est une clé valide : il transporte. Un
  // filtrage silencieux ici masquerait une valeur inattendue côté SQL.
  rpcLeve = false;
  rpcResult = { data: ['module-inexistant'], error: null };
  assert.equal((await lireModulesDesactives(ctx())).has('module-inexistant'), true);
});
