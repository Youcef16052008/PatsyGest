import { cheminMigration, chaineDeploiement } from './migrations-historique.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Remplace les tests textuels de `grant` (securite.test.mjs, vitrine.test.mjs) :
// on applique les migrations et on lit les droits réellement obtenus dans la base.
// 38 : la vérification par source est appelée par le serveur avant la demande.
const FONCTIONS_ANON_AUTORISEES = ['patisgest_demander_commande', 'patisgest_verifier_source_vitrine'];

test('droits : après toutes les migrations, aucune fonction publique n’est exécutable par PUBLIC', async () => {
  const db = await migrer();
  const ouvertes = (await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    where n.nspname = 'public' and a.grantee = 0 and a.privilege_type = 'EXECUTE'
    order by p.proname`)).rows.map((r) => r.proname);
  assert.deepEqual(ouvertes, [], `fonctions exécutables par PUBLIC : ${ouvertes.join(', ')}`);
  await db.close();
});

test('droits : anon ne peut exécuter que les fonctions publiques autorisées', async () => {
  const db = await migrer();
  const anon = (await db.query(`
    select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')
    order by p.proname`)).rows.map((r) => r.proname);
  assert.deepEqual(anon, FONCTIONS_ANON_AUTORISEES, `fonctions ouvertes à anon : ${anon.join(', ')}`);
  await db.close();
});

async function migrer() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const file of chaineDeploiement()) {
    let sql = await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8');
    sql = sql.replace('create extension if not exists pgcrypto;', '');
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1;');
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
  }
  return db;
}
