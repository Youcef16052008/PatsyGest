// Revue F-04 (partie SQL) : migration 36 réécrit current_date en date Africa/Algiers.
// Chaîne déployable : 01→23, 25→36. Base PGlite jetable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationsRepetition } from './migrations-historique.mjs';

const APRES_23 = ['25-domaines-boutiques.sql','26-vitrine-publique.sql','27-commandes-vitrine.sql','28-fermeture-anon.sql','29-fermeture-public-fonctions.sql','30-edition-vitrine-rpc.sql','31-publication-vitrine.sql','32-garde-prix-vitrine-rattrapage.sql','33-restauration-sans-perte.sql','34-cout-of-partiel.sql','35-version-schema-app.sql','36-dates-algiers.sql'];
const historique = migrationsRepetition().filter(f => /^(0\d|1\d|2[0-3])-/.test(f) && !f.startsWith('24-'));

async function charger(db, files) {
  for (const file of files) {
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${file}`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
  }
}

async function base() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  return db;
}

test('F-04 SQL : après 36, plus aucun current_date dans les fonctions ni les défauts publics', async () => {
  const db = await base();
  try {
    await charger(db, historique);
    await charger(db, APRES_23);
    const restants = await db.query(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='public' and p.prokind in ('f','p') and pg_get_functiondef(p.oid) ~* '\\mcurrent_date\\M'`);
    assert.equal(restants.rows[0].n, 0);
    const defauts = await db.query(`select count(*)::int as n from information_schema.columns
      where table_schema='public' and column_default ~* 'current_date'`);
    assert.equal(defauts.rows[0].n, 0);
    const d = await db.query(`select column_default from information_schema.columns
      where table_schema='public' and table_name='mouvements' and column_name='date_mvt'`);
    assert.match(d.rows[0].column_default, /Africa\/Algiers/);
  } finally {
    await db.close?.();
  }
});

test('F-04 SQL : la version de schéma passe à 36 et la migration est rejouable', async () => {
  const db = await base();
  try {
    await charger(db, historique);
    await charger(db, APRES_23);
    await charger(db, ['36-dates-algiers.sql']);
    const v = await db.query('select version from public.app_schema_version');
    assert.equal(v.rows[0].version, 36);
  } finally {
    await db.close?.();
  }
});

test('F-04 SQL : un défaut `current_date` inattendu fait échouer la migration (pas de réécriture partielle)', async () => {
  const db = await base();
  try {
    await charger(db, historique);
    await charger(db, APRES_23.filter(f => !f.startsWith('36-')));
    // Une vue qui contient current_date doit bloquer la migration.
    await db.exec('create view public.v_test_date as select current_date as j');
    await assert.rejects(() => charger(db, ['36-dates-algiers.sql']), /Vue publique contenant current_date/);
  } finally {
    await db.close?.();
  }
});
