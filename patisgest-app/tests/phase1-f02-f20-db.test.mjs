// Phase 1 : F-02 (restauration sans perte silencieuse), F-05 (version), F-20 (coût OF partiel).
// Chaîne déployable : 01→23 puis 25→34. Base PGlite jetable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationsRepetition } from './migrations-historique.mjs';

const APRES_23 = ['25-domaines-boutiques.sql','26-vitrine-publique.sql','27-commandes-vitrine.sql','28-fermeture-anon.sql','29-fermeture-public-fonctions.sql','30-edition-vitrine-rpc.sql','31-publication-vitrine.sql','32-garde-prix-vitrine-rattrapage.sql','33-restauration-sans-perte.sql','34-cout-of-partiel.sql'];
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

const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';
const AUTH = '10000000-0000-0000-0000-000000000001';
const SITE = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const ART = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const FAM = 'ffffffff-ffff-ffff-ffff-ffffffffff01';
const VER = 'ffffffff-ffff-ffff-ffff-ffffffffff02';

async function jeu(db) {
  await db.exec(`insert into clients(id,nom) values ('${CLIENT}','Atelier');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values ('${USER}','${CLIENT}','${AUTH}','owner@example.test','Propriétaire','proprietaire');
   insert into sites(id,client_id,nom,type) values ('${SITE}','${CLIENT}','Labo','laboratoire');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values ('${ART}','${CLIENT}','P1','Éclair','produit','piece',100,9);`);
}

test('F-02 : un doublon ne fait plus perdre les lignes nouvelles de la même table', async () => {
  const db = await base();
  try {
    await charger(db, historique); await charger(db, APRES_23); await jeu(db);
    const existante = (await db.query(`select row_to_json(a) as j from public.articles a where id='${ART}'`)).rows[0].j;
    const nouvelle = { ...existante, id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee09', code: 'P9', nom: 'Nouveau gâteau' };
    const dump = { version: '1', client_id: CLIENT, tables: [{ table: 'articles', lignes: [existante, nouvelle] }] };
    await db.exec(`select set_config('test.uid','${AUTH}',false)`);
    await db.exec('set role authenticated');
    const r = (await db.query('select public.restaurer_sauvegarde($1::jsonb) as r', [JSON.stringify(dump)])).rows[0].r;
    await db.exec('reset role');
    assert.equal(r.insere.articles, 1, 'la ligne nouvelle est insérée');
    assert.equal(r.ignore.articles, 1, 'le doublon est compté comme ignoré (et non la table entière)');
    const n = (await db.query("select count(*)::int n from public.articles where code='P9'")).rows[0].n;
    assert.equal(n, 1, 'la nouvelle ligne existe bien en base');
  } finally { await db.close(); }
});

test('F-05 : une version de sauvegarde inconnue est refusée avant toute écriture', async () => {
  const db = await base();
  try {
    await charger(db, historique); await charger(db, APRES_23); await jeu(db);
    const dump = { version: '2', client_id: CLIENT, tables: [{ table: 'articles', lignes: [] }] };
    await db.exec(`select set_config('test.uid','${AUTH}',false)`);
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select public.restaurer_sauvegarde($1::jsonb)', [JSON.stringify(dump)]), /Version de sauvegarde non prise en charge/);
    await db.exec('reset role');
  } finally { await db.close(); }
});

test('réversibilité : l’enveloppe publique garde le contrôle des modules après 33', async () => {
  const db = await base();
  try {
    await charger(db, historique); await charger(db, APRES_23);
    const def = (await db.query("select pg_get_functiondef('public.restaurer_sauvegarde(jsonb)'::regprocedure) as d")).rows[0].d;
    assert.ok(def.includes('patisgest_exiger_modules'), 'enveloppe toujours gardée par les modules');
    const interne = (await db.query("select has_function_privilege('authenticated','public.patisgest_restaurer_sauvegarde_interne(jsonb)','EXECUTE') as ok")).rows[0].ok;
    assert.equal(interne, false, 'l’interne n’est pas appelable directement');
  } finally { await db.close(); }
});

test('F-20 : un OF fini en deux lots partiels ne compte ses matières qu’une fois', async () => {
  const db = await base();
  try {
    await charger(db, historique); await charger(db, APRES_23); await jeu(db);
    await db.exec(`insert into recette_familles(id,client_id,code,nom,produit_id) values ('${FAM}','${CLIENT}','P1','Éclair','${ART}');
     insert into recette_versions(id,client_id,famille_id,version,active,rendement_qte,rendement_unite) values ('${VER}','${CLIENT}','${FAM}',1,true,1,'pcs');`);
    await db.query(`insert into ordres_fabrication(client_id,famille_id,version_id,site_id,numero,qte_prevue,qte_realisee,date_prevue,statut,consommations,manquants,lots_produits,cout_reel)
      values ($1,$2,$3,$4,'OF-T1',100,0,current_date,'encours','[{"qty":100,"pu":10}]'::jsonb,'[]'::jsonb,'[]'::jsonb,0)`, [CLIENT, FAM, VER, SITE]);
    await db.exec(`select set_config('test.uid','${AUTH}',false)`);
    await db.exec('set role authenticated');
    const of = (await db.query("select id from public.ordres_fabrication where numero='OF-T1'")).rows[0].id;
    await db.query('select public.terminer_of($1,40,$2,$3)', [of, 'L1', '2027-01-01']);
    await db.query('select public.terminer_of($1,60,$2,$3)', [of, 'L2', '2027-01-01']);
    await db.exec('reset role');
    const total = (await db.query("select coalesce(sum(qte_init*pu),0)::float as t from public.lots where ref='OF-T1'")).rows[0].t;
    assert.ok(Math.abs(total - 1000) < 0.05, `total des lots = ${total}, attendu 1000 (consommations une seule fois)`);
  } finally { await db.close(); }
});
