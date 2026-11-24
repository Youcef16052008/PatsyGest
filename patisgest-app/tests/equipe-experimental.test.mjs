import { test } from 'node:test';
import assert from 'node:assert/strict';
import { equipeExperimentaleActive } from '../src/lib/equipe-experimental.ts';

const local = { NODE_ENV:'development', PATSYGEST_EQUIPE_EXPERIMENTAL:'true', NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54321' };
test('gestion équipe expérimentale : opt-in et API locale uniquement', () => {
  assert.equal(equipeExperimentaleActive(local),true);
  for (const change of [
    {NODE_ENV:'production'}, {VERCEL_ENV:'preview'}, {VERCEL_ENV:'production'},
    {PATSYGEST_EQUIPE_EXPERIMENTAL:'false'}, {PATSYGEST_EQUIPE_EXPERIMENTAL:undefined},
    {NEXT_PUBLIC_SUPABASE_URL:'https://pilote.supabase.co'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://127.0.0.1:54322'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://localhost.evil.test:54321'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://localhost:54321/path'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://user:password@localhost:54321'},
    {NEXT_PUBLIC_SUPABASE_URL:'http://localhost:54321/?url=pilote'},
    {NEXT_PUBLIC_SUPABASE_URL:''},
  ]) assert.equal(equipeExperimentaleActive({...local,...change}),false,JSON.stringify(change));
});

test('équipe : la production Vercel est exclue par VERCEL_ENV, même tout le reste activé', () => {
  // Découvert en comparant les rpc() du code aux fonctions de la base pilote : les
  // neuf fonctions equipe_* sont absentes en production. C'est volontaire — mais
  // ça ne tient que sur cette ligne. Si quelqu'un retire la condition VERCEL_ENV
  // pour « faire marcher le module », des écrans appelleront des RPC inexistantes.
  const toutActive = {
    NODE_ENV: 'development',
    PATSYGEST_EQUIPE_EXPERIMENTAL: 'true',
    NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
  };
  assert.equal(equipeExperimentaleActive(toutActive), true, 'témoin : sans VERCEL_ENV, actif');
  assert.equal(
    equipeExperimentaleActive({ ...toutActive, VERCEL_ENV: 'production' }),
    false,
    'VERCEL_ENV seule doit suffire à désactiver',
  );
  assert.equal(equipeExperimentaleActive({ ...toutActive, VERCEL_ENV: 'preview' }), false);
  // Une chaîne vide n'est pas une valeur Vercel : c'est « neutralisé », ce que fait
  // le harnais d'intégration. On doit donc laisser le module ouvert (sous réserve
  // de toutes les autres conditions, qui restent vérifiées).
  assert.equal(equipeExperimentaleActive({ ...toutActive, VERCEL_ENV: '' }), true,
    'chaîne vide = neutralisé explicitement, pas une valeur Vercel');
  assert.equal(equipeExperimentaleActive({ ...toutActive, VERCEL_ENV: '   ' }), true,
    'blancs seuls : même raison');
});

test('équipe : chaque action passe par un helper gardé, pas par un garde recopié', async () => {
  // La garde n'est PAS répétée dans les sept actions : elles passent toutes par
  // `clientProprietaire()`, qui appelle le garde. C'est mieux qu'un copier-coller
  // (une seule ligne à auditer), mais ça veut dire qu'une action ajoutée plus tard
  // pourrait l'oublier. Ce test vérifie les deux : le helper est gardé, et chaque
  // action appelle le helper.
  const { readFile } = await import('node:fs/promises');
  const src = await readFile(new URL('../src/lib/actions-equipe.ts', import.meta.url), 'utf8');
  const helper = src.match(/async function clientProprietaire\(\)[\s\S]{0,300}?\n}/);
  assert.ok(helper, 'le helper clientProprietaire doit exister');
  assert.match(helper[0], /equipeExperimentaleActive\(\)/, 'le helper doit appeler le garde');

  const corps = src.slice(src.indexOf('async function clientProprietaire'));
  const actions = corps.match(/export async function (\w+)/g) ?? [];
  assert.ok(actions.length >= 7, `7 actions attendues, ${actions.length} trouvées`);
  for (const decl of actions) {
    const nom = decl.replace('export async function ', '');
    const debut = corps.indexOf(`export async function ${nom}`);
    const suite = corps.slice(debut, debut + 1200);
    assert.match(suite, /clientProprietaire\(\)/, `${nom} doit passer par le helper gardé`);
  }
});
