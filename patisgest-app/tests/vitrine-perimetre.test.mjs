import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Reconstruction adaptée à partir des migrations main et sécurité : ceci n'est
// pas une copie du pilote ni une preuve de sécurité pour toute la vitrine.
test('vitrine : traitement d’une demande limité au site et au module attribués',async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  const migrations=(await readdir(new URL('../supabase/',import.meta.url))).filter(x=>/^\d\d-.*\.sql$/.test(x) && !x.startsWith('02-')).sort();
  for(const file of migrations){
   if(file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
   if(file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
   if(file.startsWith('24-')) {
    const dir=new URL('./fixtures/pilote-vitrine/',import.meta.url);
    for(const fixture of (await readdir(dir)).filter(x=>/^\d\d-.*\.sql$/.test(x)).sort()) {
     try {await db.exec((await readFile(new URL(fixture,dir),'utf8')).replace('create extension if not exists pgcrypto;',''));}
     catch(e){throw new Error(`Vitrine ${fixture}: ${e.message}`,{cause:e});}
    }
   }
   try {await db.exec((await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));}
   catch(e){throw new Error(`${file}: ${e.message}`,{cause:e});}
  }
  await db.exec(`insert into clients(id,nom) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values
    ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000001','owner@example.test','Owner','proprietaire'),
    ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000002','seller@example.test','Seller','vendeur');
   insert into sites(id,client_id,nom,type) values
    ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Site attribué','boutique'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Site masqué','boutique');
   insert into equipe_sites(utilisateur_id,site_id) values ('22222222-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd');
   insert into cakes(id,client_id,numero,client_nom,date_event,nb_parts,site_id,statut,origine) values
    ('aaaaaaaa-0000-0000-0000-000000000071','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','VIT-1','Fictif',current_date,1,'dddddddd-dddd-dddd-dddd-dddddddddddd','demande','vitrine'),
    ('aaaaaaaa-0000-0000-0000-000000000072','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','VIT-2','Fictif',current_date,1,'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','demande','vitrine');
   select set_config('test.uid','10000000-0000-0000-0000-000000000002',false); set role authenticated;`);
  await assert.rejects(db.query("select public.patisgest_traiter_demande('aaaaaaaa-0000-0000-0000-000000000072','accepter')"),/Site non autorise/);
  await assert.rejects(db.query("select public.patisgest_traiter_demande_interne('aaaaaaaa-0000-0000-0000-000000000071','accepter')"),/permission denied/);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  await db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','cake-design',false)");
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  await assert.rejects(db.query("select public.patisgest_traiter_demande('aaaaaaaa-0000-0000-0000-000000000071','accepter')"),/Module desactive/);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  await db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','cake-design',true)");
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  assert.equal((await db.query("select public.patisgest_traiter_demande('aaaaaaaa-0000-0000-0000-000000000071','accepter') r")).rows[0].r.statut,'devis');
  await db.exec('reset role');
  assert.equal((await db.query("select statut from cakes where id='aaaaaaaa-0000-0000-0000-000000000072'")).rows[0].statut,'demande');
  await db.exec(`insert into recette_familles(id,client_id,code,nom) values
    ('aaaaaaaa-0000-0000-0000-000000000081','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A','Recette A'),
    ('bbbbbbbb-0000-0000-0000-000000000081','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','B','Recette B');
   select set_config('test.uid','10000000-0000-0000-0000-000000000001',false); set role authenticated;`);
  await assert.rejects(db.query("insert into vitrine_photos(client_id,famille_id,chemin) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','bbbbbbbb-0000-0000-0000-000000000081','foreign.jpg')"),/row-level security/);
  const photo=(await db.query("insert into vitrine_photos(client_id,famille_id,chemin) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-0000-0000-0000-000000000081','photo.jpg') returning id")).rows[0].id;
  await assert.rejects(db.query("update vitrine_photos set famille_id='bbbbbbbb-0000-0000-0000-000000000081' where id=$1",[photo]),/row-level security/);
  await db.query("select public.modifier_acces_module('11111111-1111-1111-1111-111111111111','recettes',false)");
  await assert.rejects(db.query("select public.patisgest_enregistrer_fiche_vitrine('aaaaaaaa-0000-0000-0000-000000000081',true,'A',null,null,100)"),/Module desactive/);
  await assert.rejects(db.query("select public.patisgest_supprimer_recette('aaaaaaaa-0000-0000-0000-000000000081')"),/Module desactive/);
  await assert.rejects(db.query("insert into vitrine_photos(client_id,famille_id,chemin) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','aaaaaaaa-0000-0000-0000-000000000081','blocked.jpg')"),/row-level security/);
  await db.query("select public.modifier_acces_module('11111111-1111-1111-1111-111111111111','recettes',true)");
  assert.equal((await db.query("select public.patisgest_enregistrer_fiche_vitrine('aaaaaaaa-0000-0000-0000-000000000081',true,'A',null,null,100) r")).rows[0].r.visible,true);
  await assert.rejects(db.query("select public.patisgest_enregistrer_fiche_vitrine_interne('aaaaaaaa-0000-0000-0000-000000000081',true,'A',null,null,100)"),/permission denied/);
 } finally {await db.close();}
});
