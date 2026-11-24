// Revue B-008 : migration 38 (plafond par source, plafond global relevé). Base PGlite jetable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SRC_A = 'a'.repeat(64);
const SRC_B = 'b'.repeat(64);

async function chargerTout() {
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
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
  }
  await db.exec(`insert into clients(id,nom) values ('${CLIENT}','Atelier');
   insert into sites(id,client_id,nom,type,subdomain,publication) values ('dddddddd-dddd-dddd-dddd-dddddddddd01','${CLIENT}','Boutique','boutique','pilote','publiee');
   insert into sites(id,client_id,nom,type,subdomain,publication) values ('dddddddd-dddd-dddd-dddd-dddddddddd02','${CLIENT}','Brouillon','boutique','cache','brouillon');`);
  return db;
}

const verifier = (db, source, sd = 'pilote') => db.query('select public.patisgest_verifier_source_vitrine($1,$2)', [sd, source]);

test('B-008 : une source est limitée à 10 demandes par heure, les autres ne sont pas touchées', async () => {
  const db = await chargerTout();
  try {
    for (let i = 0; i < 10; i++) await verifier(db, SRC_A);
    await assert.rejects(verifier(db, SRC_A), /Trop de demandes depuis votre connexion/);
    await verifier(db, SRC_B);
  } finally { await db.close(); }
});

test('B-008 : les lignes de plus de 2 heures sont purgées', async () => {
  const db = await chargerTout();
  try {
    await db.exec(`insert into vitrine_sources_recentes(client_id,source_hash,created_at)
      select '${CLIENT}', '${SRC_B}', now() - interval '3 hours' from generate_series(1,20)`);
    await verifier(db, SRC_A);
    const n = (await db.query(`select count(*)::int as n from vitrine_sources_recentes where source_hash='${SRC_B}'`)).rows[0].n;
    assert.equal(n, 0, 'les anciennes lignes disparaissent');
  } finally { await db.close(); }
});

test('B-008 : site brouillon ou inconnu refusé sans fuite d’existence', async () => {
  const db = await chargerTout();
  try {
    await assert.rejects(verifier(db, SRC_A, 'cache'), /introuvable ou non publiée/);
    await assert.rejects(verifier(db, SRC_A, 'inconnu'), /introuvable ou non publiée/);
  } finally { await db.close(); }
});

test('B-008 : source mal formée refusée', async () => {
  const db = await chargerTout();
  try {
    await assert.rejects(verifier(db, '1.2.3.4'), /Référence de connexion invalide/);
    await assert.rejects(verifier(db, null), /Référence de connexion invalide/);
  } finally { await db.close(); }
});

test('B-008 : la table n’est lisible ni par anon ni par authentifié', async () => {
  const db = await chargerTout();
  try {
    const r = (await db.query(`select has_table_privilege('anon','public.vitrine_sources_recentes','select') as a,
      has_table_privilege('authenticated','public.vitrine_sources_recentes','select') as u`)).rows[0];
    assert.equal(r.a, false);
    assert.equal(r.u, false);
  } finally { await db.close(); }
});

test('B-008 : anon peut appeler la vérification par source (exposition voulue)', async () => {
  const db = await chargerTout();
  try {
    const r = (await db.query(`select has_function_privilege('anon','public.patisgest_verifier_source_vitrine(text,text)','execute') as v`)).rows[0];
    assert.equal(r.v, true);
  } finally { await db.close(); }
});

test('B-008 : plafond global relevé à 300 ; migration rejouable', async () => {
  const db = await chargerTout();
  try {
    const def = (await db.query(`select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure) as d`)).rows[0].d;
    assert.match(def, /if v_flux >= 300 then/);
    assert.doesNotMatch(def, /if v_flux >= 30 then/);
    await db.exec(await readFile(new URL(`../supabase/${cheminMigration('38-anti-abus-vitrine-source.sql')}`, import.meta.url), 'utf8'));
    // Intention du test : la 38 est rejouable sur son propre périmètre. La version
    // de schéma ne doit donc jamais redescendre en dessous de 38 — elle vaut 40
    // depuis la migration 40 (journal d'audit), qui la relève aussi.
    const version = (await db.query('select version from app_schema_version where id=1')).rows[0].version;
    assert.ok(version >= 38, `version ${version} : la 38 a abaissé le marqueur de schéma`);
  } finally { await db.close(); }
});
