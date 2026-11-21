// Revue B-007 : migration 37 (transfert idempotent par client_ref). Base PGlite jetable.
// Chaîne : 01→23 puis 24→37 (chaineDeploiement). Les données sont factices.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';
const AUTH = '10000000-0000-0000-0000-000000000001';
const SITE_A = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const SITE_B = 'dddddddd-dddd-dddd-dddd-dddddddddd02';
const ART = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const ART2 = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
const REF = 'REF-TRANSFERT-0001';

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
  return db;
}

async function jeu(db) {
  await db.exec(`insert into clients(id,nom) values ('${CLIENT}','Atelier');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values ('${USER}','${CLIENT}','${AUTH}','owner@example.test','Propriétaire','proprietaire');
   insert into sites(id,client_id,nom,type) values ('${SITE_A}','${CLIENT}','Labo','laboratoire'), ('${SITE_B}','${CLIENT}','Boutique','boutique');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values ('${ART}','${CLIENT}','P1','Éclair','produit','piece',100,9), ('${ART2}','${CLIENT}','P2','Tarte','produit','piece',100,9);
   insert into lots(client_id,article_id,site_id,numero,qte_init,qte_rest,pu,date_reception,bloque,congele)
     values ('${CLIENT}','${ART}','${SITE_A}','L1',10,10,5,'2026-11-01',false,false);`);
}

async function appeler(db, sql, params) {
  await db.exec(`select set_config('test.uid','${AUTH}',false)`);
  await db.exec('set role authenticated');
  try { return (await db.query(sql, params)).rows[0].r; }
  finally { await db.exec('reset role'); }
}

const APPEL = `select public.transferer_article_ref($1,$2,$3,$4,$5,$6,$7) as r`;

test('B-007 : même référence rejouée ne déplace le stock qu’une fois', async () => {
  const db = await chargerTout();
  try {
    await jeu(db);
    const premier = await appeler(db, APPEL, [ART, SITE_A, SITE_B, 4, 'test', null, REF]);
    const rejeu = await appeler(db, APPEL, [ART, SITE_A, SITE_B, 4, 'test', null, REF]);
    assert.equal(premier.rejoue, false);
    assert.equal(rejeu.rejoue, true);
    assert.equal(rejeu.transfert_id, premier.transfert_id, 'même transfert renvoyé');
    const stock = (await db.query(`select sum(qte_rest)::numeric as s from lots where article_id='${ART}' and site_id='${SITE_A}'`)).rows[0].s;
    assert.equal(Number(stock), 6, 'le stock n’est déplacé qu’une fois (10 - 4)');
    const nb = (await db.query(`select count(*)::int as n from transferts where client_ref='${REF}'`)).rows[0].n;
    assert.equal(nb, 1);
  } finally { await db.close(); }
});

test('B-007 : même référence pour une autre demande est refusée, sans mouvement', async () => {
  const db = await chargerTout();
  try {
    await jeu(db);
    await appeler(db, APPEL, [ART, SITE_A, SITE_B, 4, 'test', null, REF]);
    await assert.rejects(
      appeler(db, APPEL, [ART, SITE_A, SITE_B, 5, 'test', null, REF]),
      /déjà utilisée pour un autre transfert/,
    );
    await assert.rejects(
      appeler(db, APPEL, [ART2, SITE_A, SITE_B, 4, 'test', null, REF]),
      /déjà utilisée pour un autre transfert/,
    );
    const stock = (await db.query(`select sum(qte_rest)::numeric as s from lots where article_id='${ART}' and site_id='${SITE_A}'`)).rows[0].s;
    assert.equal(Number(stock), 6, 'aucun mouvement supplémentaire');
  } finally { await db.close(); }
});

test('B-007 : un échec de stock n’écrit rien et ne consomme pas la référence', async () => {
  const db = await chargerTout();
  try {
    await jeu(db);
    await assert.rejects(appeler(db, APPEL, [ART, SITE_A, SITE_B, 50, 'test', null, REF]), /insuffisant/);
    const nb = (await db.query(`select count(*)::int as n from transferts`)).rows[0].n;
    assert.equal(nb, 0);
    const ok = await appeler(db, APPEL, [ART, SITE_A, SITE_B, 4, 'test', null, REF]);
    assert.equal(ok.rejoue, false, 'la référence reste disponible après un échec');
  } finally { await db.close(); }
});

test('B-007 : sans référence, comportement inchangé (pas de rejeu)', async () => {
  const db = await chargerTout();
  try {
    await jeu(db);
    const a = await appeler(db, APPEL, [ART, SITE_A, SITE_B, 1, 'test', null, null]);
    const b = await appeler(db, APPEL, [ART, SITE_A, SITE_B, 1, 'test', null, null]);
    assert.notEqual(a.transfert_id, b.transfert_id);
  } finally { await db.close(); }
});

test('B-007 : référence unique par client, longueur bornée, droits fermés', async () => {
  const db = await chargerTout();
  try {
    await jeu(db);
    await assert.rejects(
      db.exec(`insert into transferts(client_id,date_transfert,from_site_id,to_site_id,ref,lignes,client_ref) values ('${CLIENT}',current_date,'${SITE_A}','${SITE_B}','X1','[]','${REF}'); insert into transferts(client_id,date_transfert,from_site_id,to_site_id,ref,lignes,client_ref) values ('${CLIENT}',current_date,'${SITE_A}','${SITE_B}','X2','[]','${REF}');`),
      /duplicate key|transferts_client_ref_uniq/,
    );
    await assert.rejects(appeler(db, APPEL, [ART, SITE_A, SITE_B, 1, 'test', null, 'x'.repeat(65)]), /trop longue/);
    const grants = (await db.query(`select has_function_privilege('anon','public.transferer_article_ref(uuid,uuid,uuid,numeric,text,text,text)','execute') as anon,
      has_function_privilege('authenticated','public.transferer_article_ref(uuid,uuid,uuid,numeric,text,text,text)','execute') as auth`)).rows[0];
    assert.equal(grants.anon, false);
    assert.equal(grants.auth, true);
  } finally { await db.close(); }
});

test('B-007 : version de schéma enregistrée à 37 au moins, sans abaisser', async () => {
  const db = await chargerTout();
  try {
    const v = (await db.query('select version from app_schema_version where id=1')).rows[0].version;
    assert.ok(v >= 37, `version ${v} : la 37 doit enregistrer au moins 37`);
    await db.exec(await readFile(new URL(`../supabase/${cheminMigration('37-transfert-client-ref.sql')}`, import.meta.url), 'utf8'));
    assert.equal((await db.query('select version from app_schema_version where id=1')).rows[0].version, v, 'rejouable sans abaisser');
  } finally { await db.close(); }
});
