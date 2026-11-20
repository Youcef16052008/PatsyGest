import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('réglages par compte : rôle, tenant, garde RPC et RLS', async()=>{
 const db=new PGlite();
 try {
  await db.exec(`create role authenticated; create role anon; create role service_role;
    create schema auth; grant usage on schema public,auth to authenticated;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    grant execute on function auth.uid() to authenticated;
    create table public.utilisateurs(id uuid primary key,client_id uuid,auth_user_id uuid,nom text,role text);
    insert into utilisateurs values
    ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000001','Propriétaire','proprietaire'),
    ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000002','Labo','labo'),
    ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','10000000-0000-0000-0000-000000000003','Autre','vendeur');`);
  const tables=['releve_temperatures','nettoyages','non_conformites','transferts','taches_planning','demandes_reassort','recette_familles','recette_versions','ordres_fabrication','cakes','bons_commande','historique_prix','ventes','z_imports','clotures','articles','lots','mouvements','fournisseurs','conversions','parametres_couts'];
  for (const t of tables) await db.exec(`create table public.${t}(id int); alter table public.${t} enable row level security; create policy base on public.${t} for all to authenticated using(true) with check(true); grant all on public.${t} to authenticated;`);
  const funcs=['creer_famille','creer_version','activer_version','creer_of','demarrer_of','terminer_of','creer_cake','creer_cake_production','affecter_production_cake','cake_options_production','cake_liens_production','evoluer_cake','editer_cake','accepter_cgv','vendre_article','vendre_panier','importer_z','creer_commande','recevoir_commande','receptionner_lot','creer_demande_reassort','traiter_demandes_reassort','transferer_article','saisir_cloture','maj_non_conformite','rappel_lot','bloquer_lot','simuler_recette'];
  for(const f of funcs) await db.exec(`create function public.${f}() returns text language plpgsql security definer as $$ begin return 'OK'; end $$;`);
  await db.exec("create function public.restaurer_sauvegarde(jsonb) returns jsonb language plpgsql security definer as $$begin return '{}'::jsonb; end$$");
  await db.exec(await readFile(new URL('../supabase/23-controle-modules.sql',import.meta.url),'utf8'));
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false); set role authenticated;");
  assert.equal((await db.query('select * from public.lister_acces_modules()')).rows.length,2);
  await assert.rejects(db.query("select public.modifier_acces_module('33333333-3333-3333-3333-333333333333','qualite',false)"),/Compte introuvable/);
  await db.query("select public.modifier_acces_module('11111111-1111-1111-1111-111111111111','stocks',false)");
  await assert.rejects(db.query("select public.restaurer_sauvegarde('{}')"),/Module desactive/);
  await db.query("select public.modifier_acces_module('11111111-1111-1111-1111-111111111111','stocks',true)");
  await db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','qualite',false)");
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  assert.deepEqual((await db.query('select public.mes_modules_desactives() r')).rows[0].r,['qualite']);
  await assert.rejects(db.query('select public.maj_non_conformite()'),/Module desactive/);
  await assert.rejects(db.query('insert into public.nettoyages values (1)'),/row-level security/);
  await assert.rejects(db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','qualite',true)"),/Reserve au proprietaire/);
  assert.equal((await db.query('select public.demarrer_of() r')).rows[0].r,'OK');
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  await db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','qualite',true)");
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  assert.equal((await db.query('select public.maj_non_conformite() r')).rows[0].r,'OK');
 } finally {await db.close();}
});
