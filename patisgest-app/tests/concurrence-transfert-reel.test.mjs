// Revue B-007 (vérification réelle) : deux appels SIMULTANÉS sur un vrai PostgreSQL.
// PGlite est mono-connexion ; ce test ne l'est pas. Il est ignoré sans PATSYGEST_PG_URL.
// Exemple : PATSYGEST_PG_URL=postgres://postgres@127.0.0.1:5432/postgres npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

const URL_ADMIN = process.env.PATSYGEST_PG_URL;
const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';
const AUTH = '10000000-0000-0000-0000-000000000001';
const SITE_A = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const SITE_B = 'dddddddd-dddd-dddd-dddd-dddddddddd02';
const ART = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const REF = 'REF-CONCURRENTE-0001';

const sansBase = test.skip;
const lancer = URL_ADMIN ? test : sansBase;

async function nouvelleBase() {
  const nom = `pgtest_${process.pid}_${Date.now()}`;
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`create database ${nom}`);
  await admin.end();
  const url = new URL(URL_ADMIN);
  url.pathname = `/${nom}`;
  const db = new pg.Client({ connectionString: url.toString() });
  await db.connect();
  await db.query(`do $$ begin
      create role authenticated nologin; exception when duplicate_object then null; end $$;`);
  await db.query(`do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;`);
  await db.query(`do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;`);
  await db.query(`create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const file of chaineDeploiement()) {
    if (file.startsWith('07-')) await db.query("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.query('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8')).replace('create extension if not exists pgcrypto;', '');
    try { await db.query(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
  }
  await db.query(`insert into clients(id,nom) values ('${CLIENT}','Atelier');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values ('${USER}','${CLIENT}','${AUTH}','owner@example.test','Propriétaire','proprietaire');
   insert into sites(id,client_id,nom,type) values ('${SITE_A}','${CLIENT}','Labo','laboratoire'), ('${SITE_B}','${CLIENT}','Boutique','boutique');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values ('${ART}','${CLIENT}','P1','Éclair','produit','piece',100,9);
   insert into lots(client_id,article_id,site_id,numero,qte_init,qte_rest,pu,date_reception,bloque,congele)
     values ('${CLIENT}','${ART}','${SITE_A}','L1',10,10,5,'2026-11-01',false,false);`);
  return { db, url: url.toString(), nom };
}

// Une connexion distincte par appel, comme deux requêtes HTTP simultanées.
async function appelSur(url, sql, params) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query(`select set_config('test.uid','${AUTH}',false)`);
    await c.query('set role authenticated');
    return (await c.query(sql, params)).rows[0].r;
  } catch (e) {
    return { erreur: e.message };
  } finally {
    await c.end();
  }
}

async function stockSiteA(db) {
  return Number((await db.query(`select coalesce(sum(qte_rest),0)::numeric as s from lots where article_id='${ART}' and site_id='${SITE_A}'`)).rows[0].s);
}

lancer('D2/D4/D7/D9 : les garde-fous tenant 39 tiennent sur PostgreSQL réel', async () => {
  const { db, nom } = await nouvelleBase();
  try {
    const CLIENT_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const AUTH_B = '10000000-0000-0000-0000-000000000002';
    const ARTICLE_B = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';
    await db.query(`insert into clients(id,nom) values ('${CLIENT_B}','Tenant B fictif');
      insert into utilisateurs(id,client_id,auth_user_id,email,nom,role)
        values ('22222222-2222-2222-2222-222222222222','${CLIENT_B}','${AUTH_B}','b@example.test','Propriétaire B','proprietaire');
      insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva)
        values ('${ARTICLE_B}','${CLIENT_B}','B1','Article B','matiere','kg',10,9);
      update sites set subdomain='security-39', publication='publiee' where id='${SITE_B}';
      insert into recette_familles(client_id,code,nom,cle_nom,visible_vitrine)
        values ('${CLIENT}','SEC39','Famille publique','famille-sec39',true);
      select set_config('test.uid','${AUTH}',false);
      set role anon;`);
    const catalogue = await db.query("select * from public.vitrine_catalogue where subdomain='security-39'");
    assert.equal(catalogue.rows.length, 1);
    assert.ok(!catalogue.fields.some((field) => field.name === 'client_id'), 'D2: aucun client_id dans le schéma PostgREST public');

    await db.query('reset role; set role authenticated');
    await assert.rejects(
      db.query(`update sites set publication='brouillon',subdomain='support' where id='${SITE_B}'`),
      undefined,
      'D4: les colonnes publication/domaine sont interdites en UPDATE direct',
    );
    await assert.rejects(
      db.query(`update clients set offre='enterprise' where id='${CLIENT}'`),
      undefined,
      'D9: un tenant ne modifie pas son offre en direct',
    );

    const dump = {
      version: 1,
      client_id: CLIENT,
      tables: [{table:'recette_familles',lignes:[{
        id:'cccccccc-0000-0000-0000-000000000039', client_id:CLIENT,
        code:'CROSS-TENANT', nom:'Famille fictive', produit_id:ARTICLE_B,
        visible_vitrine:false, ordre_vitrine:100,
      }]}],
    };
    await assert.rejects(
      db.query('select public.restaurer_sauvegarde($1::jsonb)', [JSON.stringify(dump)]),
      /Référence étrangère inter-tenant détectée/,
      'D7: le propriétaire A ne restaure pas une famille liée à un article B',
    );
    await db.query('reset role');
    const restored = await db.query("select count(*)::int as n from recette_familles where id='cccccccc-0000-0000-0000-000000000039'");
    assert.equal(restored.rows[0].n, 0, 'D7: rejet avant toute insertion');
  } finally {
    await db.end();
    await supprimer(nom);
  }
});

lancer('B-007 réel : deux appels simultanés de même référence déplacent le stock une seule fois', async () => {
  const { db, url, nom } = await nouvelleBase();
  try {
    const sql = 'select public.transferer_article_ref($1,$2,$3,$4,$5,$6,$7) as r';
    const p = [ART, SITE_A, SITE_B, 4, 'test', null, REF];
    const [a, b] = await Promise.all([appelSur(url, sql, p), appelSur(url, sql, p)]);
    const reussis = [a, b].filter((r) => !r.erreur);
    assert.equal(reussis.length, 2, `les deux appels doivent répondre (rejeu, pas d’erreur) : ${JSON.stringify([a, b])}`);
    assert.equal(reussis.filter((r) => r.rejoue === false).length, 1, 'un seul transfert réel');
    assert.equal(reussis.filter((r) => r.rejoue === true).length, 1, 'l’autre est un rejeu');
    assert.equal(a.transfert_id, b.transfert_id, 'même transfert');
    assert.equal(await stockSiteA(db), 6, 'stock déplacé une seule fois (10 - 4)');
    assert.equal((await db.query(`select count(*)::int as n from transferts where client_ref='${REF}'`)).rows[0].n, 1);
  } finally {
    await db.end();
    await supprimer(nom);
  }
});

lancer('B-007 réel : deux transferts simultanés SANS référence ne dépassent pas le stock', async () => {
  const { db, url, nom } = await nouvelleBase();
  try {
    const sql = 'select public.transferer_article($1,$2,$3,$4,$5,$6) as r';
    const p = [ART, SITE_A, SITE_B, 6, 'test', null];
    const [a, b] = await Promise.all([appelSur(url, sql, p), appelSur(url, sql, p)]);
    const ok = [a, b].filter((r) => !r.erreur).length;
    assert.equal(ok, 1, `un seul doit réussir (stock 10, 6 + 6) : ${JSON.stringify([a, b])}`);
    const stock = await stockSiteA(db);
    assert.ok(stock >= 0, 'pas de stock négatif');
    assert.equal(stock, 4, 'exactement 6 sortis du site A');
    const dest = Number((await db.query(`select coalesce(sum(qte_rest),0)::numeric as s from lots where site_id='${SITE_B}'`)).rows[0].s);
    assert.equal(dest, 6, 'exactement 6 arrivés au site B');
  } finally {
    await db.end();
    await supprimer(nom);
  }
});

async function supprimer(nom) {
  const admin = new pg.Client({ connectionString: URL_ADMIN });
  await admin.connect();
  await admin.query(`drop database if exists ${nom} with (force)`);
  await admin.end();
}
