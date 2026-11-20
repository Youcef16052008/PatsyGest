import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { migrationsRepetition } from './migrations-historique.mjs';

// Base jetable : ne remplace pas le test PostgREST/concurrence ni le pilote.
test('caisse : collision étrangère, rejeu et ticket associé à un autre site', async () => {
 const db = new PGlite();
 try {
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const file of migrationsRepetition()) {
   if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
   if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
   const sql=(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
   try { await db.exec(sql); } catch(e) { throw new Error(`${file}: ${e.message}`,{cause:e}); }
  }
  const client='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', user='11111111-1111-1111-1111-111111111111', auth='10000000-0000-0000-0000-000000000001';
  const s1='dddddddd-dddd-dddd-dddd-dddddddddd01', s2='dddddddd-dddd-dddd-dddd-dddddddddd02', article='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
  await db.exec(`insert into clients(id,nom) values ('${client}','Atelier');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values ('${user}','${client}','${auth}','owner@example.test','Propriétaire','proprietaire');
   insert into sites(id,client_id,nom,type) values ('${s1}','${client}','Boutique 1','boutique'),('${s2}','${client}','Boutique 2','boutique');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values ('${article}','${client}','A1','Produit','produit','piece',10,20);
   insert into ventes(client_id,site_id,numero,ticket,date_vente,source,total_ht,total_ttc) values ('${client}','${s1}','Z1','import-z',current_date,'z-import',10,12);
   create function public.test_collision_vente() returns trigger language plpgsql as $$begin if new.ticket='collision' then raise exception 'collision fictive' using errcode='23505'; end if; return new; end$$;
   create trigger test_collision_vente before insert on public.ventes for each row execute function public.test_collision_vente();
   select set_config('test.uid','${auth}',false); set role authenticated;`);
  const sale=async(site,ticket)=> (await db.query('select public.vendre_panier($1,$2::jsonb,$3,$4) as r',[site,JSON.stringify([{articleId:article,qte:1}]),ticket,'especes'])).rows[0].r;
  const first=await sale(s1,'vente-1'); assert.equal(first.duplicate,false); assert.ok(first.sale_id);
  const retry=await sale(s1,'vente-1'); assert.equal(retry.duplicate,true); assert.equal(retry.sale_id,first.sale_id);
  await assert.rejects(sale(s2,'vente-1'),/Ticket deja utilise pour une autre vente/);
  await assert.rejects(sale(s1,'import-z'),/Ticket deja utilise pour une autre vente/);
  await assert.rejects(sale(s1,'collision'),e=>e.code==='23505');
  const counts=await db.query("select count(*)::int n from public.ventes where ticket in ('vente-1','collision')");
  assert.equal(counts.rows[0].n,1);
  assert.equal((await db.query("select count(*)::int n from public.mouvements where ref='vente-1'")).rows[0].n,1);
 } finally { await db.close(); }
});
