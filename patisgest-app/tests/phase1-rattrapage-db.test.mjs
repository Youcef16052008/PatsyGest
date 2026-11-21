// Phase 1 de la revue : F-01 (vente à prix nul) et F-18 (commande vitrine).
// Chaîne déployable seule : 01→23 puis 25→32. Base PGlite jetable.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationsRepetition } from './migrations-historique.mjs';

const DEPLOY_APRES_23 = ['25-domaines-boutiques.sql','26-vitrine-publique.sql','27-commandes-vitrine.sql','28-fermeture-anon.sql','29-fermeture-public-fonctions.sql','30-edition-vitrine-rpc.sql','31-publication-vitrine.sql','32-garde-prix-vitrine-rattrapage.sql'];
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
const ART_OK = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee01';
const ART_ZERO = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeee02';

async function jeuDeDonnees(db) {
  await db.exec(`insert into clients(id,nom) values ('${CLIENT}','Atelier');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values ('${USER}','${CLIENT}','${AUTH}','owner@example.test','Propriétaire','proprietaire');
   insert into sites(id,client_id,nom,type,subdomain,publication) values ('${SITE}','${CLIENT}','Boutique','boutique','elyasmine','publiee');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values
     ('${ART_OK}','${CLIENT}','P1','Éclair','produit','piece',100,9),
     ('${ART_ZERO}','${CLIENT}','P0','Offert','produit','piece',0,0);`);
}

test('F-01 : vendre_panier refuse un article à prix 0 après 32, accepte un prix positif', async () => {
  const db = await base();
  try {
    await charger(db, historique);
    await charger(db, DEPLOY_APRES_23);
    await jeuDeDonnees(db);
    await db.exec(`select set_config('test.uid','${AUTH}',false)`);
    await db.exec('set role authenticated');
    const vendre = (lignes, ticket) => db.query('select public.vendre_panier($1,$2::jsonb,$3,$4) as r',
      [SITE, JSON.stringify(lignes), ticket, 'especes']).then(r => r.rows[0].r);

    await assert.rejects(vendre([{ articleId: ART_ZERO, qte: 1 }], 'zero-1'), /Prix ou TVA article invalide/);
    const ok = await vendre([{ articleId: ART_OK, qte: 2 }], 'ok-1');
    assert.equal(ok.duplicate, false);
    await db.exec('reset role');
    const ventes = await db.query("select count(*)::int n from public.ventes where ticket='zero-1'");
    assert.equal(ventes.rows[0].n, 0, 'aucune vente à 0 DA enregistrée');
    const stock = await db.query(`select count(*)::int n from public.mouvements where ref='zero-1'`);
    assert.equal(stock.rows[0].n, 0, 'aucun mouvement de stock pour la vente refusée');
  } finally { await db.close(); }
});

test('F-18 : patisgest_demander_commande aboutit après 32 (sélection de subdomain)', async () => {
  const db = await base();
  try {
    await charger(db, historique);
    await charger(db, DEPLOY_APRES_23);
    await jeuDeDonnees(db);
    const fam = (await db.query(`insert into public.recette_familles(client_id,code,nom,nom_vitrine,cle_nom,visible_vitrine,ordre_vitrine) values ('${CLIENT}','CAKE','Cake','Cake','cake',true,1) returning id`)).rows[0].id;
    await db.query(`insert into public.recette_versions(client_id,famille_id,version,active,rendement_qte,rendement_unite) values ('${CLIENT}','${fam}',1,true,1,'pcs')`);
    const r = (await db.query(`select public.patisgest_demander_commande('elyasmine','cake','Client Test','0555000000',current_date+5,10,'note','cle-navigateur-12345') as r`)).rows[0].r;
    assert.ok(r, 'la RPC renvoie un résultat');
    const n = (await db.query("select count(*)::int n from public.cakes where statut='demande'")).rows[0].n;
    assert.equal(n, 1, 'exactement une demande enregistrée');
  } finally { await db.close(); }
});

test('F-18 : la migration 32 est idempotente (rejouée sans erreur ni double correction)', async () => {
  const db = await base();
  try {
    await charger(db, historique);
    await charger(db, DEPLOY_APRES_23);
    const sql = await readFile(new URL('../supabase/32-garde-prix-vitrine-rattrapage.sql', import.meta.url), 'utf8');
    await db.exec(sql);
    await db.exec(sql); // second passage : doit être sans effet
    const def = (await db.query("select pg_get_functiondef('public.vendre_panier(uuid,jsonb,text,text)'::regprocedure) as d")).rows[0].d;
    assert.ok(def.includes('v_art.pv_ht <= 0'));
    assert.ok(!def.includes('v_art.pv_ht < 0 or'));
  } finally { await db.close(); }
});
