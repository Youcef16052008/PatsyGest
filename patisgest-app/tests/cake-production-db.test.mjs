import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// PostgreSQL embarqué, schéma minimal ; le calcul des besoins est simulé.
test('devis → OF atomique, isolation, TVA et traçabilité', async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
      create table utilisateurs(auth_user_id uuid, client_id uuid, role text);
      create table sites(id uuid primary key,client_id uuid,nom text);
      create table recette_familles(id uuid primary key,client_id uuid,produit_id uuid,nom text);
      create table recette_versions(id uuid primary key,client_id uuid,famille_id uuid,version integer,active boolean,rendement_qte numeric,rendement_unite text,ingredients jsonb);
      create table ordres_fabrication(id uuid primary key default gen_random_uuid(),client_id uuid,famille_id uuid,version_id uuid,site_id uuid,numero text,qte_prevue numeric,date_prevue date,statut text,snapshot jsonb,besoins jsonb,client_ref text,lots_produits jsonb default '[]');
      create table cakes(id uuid primary key default gen_random_uuid(), client_id uuid,numero text,client_nom text,telephone text,date_event date,retro jsonb,nb_parts integer,options jsonb,prix_ht numeric(12,2),acompte numeric(12,2),statut text,notes text,cgv boolean,agent_id uuid,tva_pct numeric default 0,paiements jsonb default '[]');
      create function public.patisgest_besoins_de_version(uuid,uuid,numeric,integer) returns jsonb language sql as $$select jsonb_build_array(jsonb_build_object('scale',$3))$$;
      insert into utilisateurs values ('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','vendeur'),('00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','vendeur');
      insert into sites values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Labo'),('20000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Autre');
      insert into recette_familles values ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Gâteau');
      insert into recette_versions values ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',1,true,10,'parts','[{"x":1}]');
      select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);
    `);
    const old = await readFile(new URL('../supabase/09-journaux-ecritures.sql', import.meta.url), 'utf8');
    await db.exec(old.slice(old.indexOf('create or replace function public.creer_cake('), old.indexOf('-- =====================================================================\n-- RPC : evoluer_cake')));
    await db.exec(await readFile(new URL('../supabase/22-cake-production.sql', import.meta.url), 'utf8'));
    const version = '40000000-0000-0000-0000-000000000001', site = '20000000-0000-0000-0000-000000000001';
    // Un site hors établissement fait échouer et annule la création du devis.
    await assert.rejects(db.query(`select public.creer_cake_production('Refuse','', '2028-03-04',20,100,'[]','',true,$1,$2,20)`, [version,'20000000-0000-0000-0000-000000000002']), /Site invalide/);
    assert.equal((await db.query('select count(*)::int n from cakes')).rows[0].n,0);
    // Un devis ancien peut être complété avant confirmation.
    const legacy=await db.query(`select public.creer_cake('Ancien','', '2028-03-04',20,100,'[]','',true) r`);
    await db.query(`select public.affecter_production_cake($1,$2,$3,20)`,[legacy.rows[0].r.cake_id,version,site]);
    assert.equal((await db.query('select version_id from cakes where id=$1',[legacy.rows[0].r.cake_id])).rows[0].version_id,version);
    const created = await db.query(`select public.creer_cake_production('Client','', '2028-03-04',20,100,'[]','',true,$1,$2,20) r`, [version, site]);
    const id=created.rows[0].r.cake_id;
    assert.equal((await db.query('select count(*)::int n from ordres_fabrication')).rows[0].n,0);
    await db.query('update cakes set tva_pct=19 where id=$1',[id]);
    await db.query(`select public.evoluer_cake($1,'payer',29.99)`,[id]);
    await assert.rejects(db.query(`select public.evoluer_cake($1,'confirme',null)`,[id]), /Acompte insuffisant/);
    await db.query(`select public.evoluer_cake($1,'payer',0.01)`,[id]);
    const result=await db.query(`select public.evoluer_cake($1,'confirme',null) r`,[id]);
    assert.equal(result.rows[0].r.balance,89);
    const order=(await db.query('select * from ordres_fabrication')).rows[0];
    assert.equal(order.statut,'planifie'); assert.equal(Number(order.qte_prevue),20); assert.equal(order.version_id,version);
    assert.equal(order.besoins[0].scale,2); assert.equal(order.snapshot.devis,created.rows[0].r.numero);
    const replay=await db.query(`select public.evoluer_cake($1,'confirme',null) r`,[id]);
    assert.equal(replay.rows[0].r.duplicate,true);
    assert.equal((await db.query('select count(*)::int n from ordres_fabrication')).rows[0].n,1);
    await assert.rejects(db.query(`select public.evoluer_cake($1,'annule',null)`,[id]), /OF est lie/);
    await assert.rejects(db.query(`select public.evoluer_cake($1,'produit',null)`,[id]), /Terminez/);
    await db.query(`update ordres_fabrication set statut='termine', lots_produits='[{"numero":"LOT-01","lotId":"123","pu":99}]' where id=$1`,[order.id]);
    await db.query(`select public.evoluer_cake($1,'produit',null)`,[id]);
    await db.query(`select public.evoluer_cake($1,'payer',70)`,[id]);
    await assert.rejects(db.query(`select public.evoluer_cake($1,'livre',null)`,[id]), /solde/);
    await assert.rejects(db.query(`select public.evoluer_cake($1,'payer',19.01)`,[id]), /Montant/);
    await db.query(`select public.evoluer_cake($1,'payer',19)`,[id]);
    assert.equal((await db.query(`select public.evoluer_cake($1,'livre',null) r`,[id])).rows[0].r.balance,0);
    await db.query(`update ordres_fabrication set lots_produits='[{"numero":"LOT-01","lotId":"123","pu":99}]' where id=$1`,[order.id]);
    const links=await db.query(`select * from public.cake_liens_production()`);
    assert.equal(links.rows[0].lots[0].numero,'LOT-01'); assert.equal(links.rows[0].lots[0].pu,undefined);
    await db.exec(`select set_config('test.uid','00000000-0000-0000-0000-000000000002',false)`);
    assert.equal((await db.query('select * from public.cake_options_production()')).rows.length,0);
    assert.equal((await db.query('select * from public.cake_liens_production()')).rows.length,0);
    await assert.rejects(db.query(`select public.evoluer_cake($1,'payer',1)`,[id]), /hors perimetre/);
  } finally { await db.close(); }
});
