import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';

test('labo : tables financières masquées, vues minimales et RPC assainies',async()=>{
 const db=new PGlite();
 try {
 await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table utilisateurs(id uuid,auth_user_id uuid,client_id uuid,role text);
 insert into utilisateurs values ('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','labo'),('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','proprietaire');
 create function public.patisgest_mon_client() returns uuid language sql stable security definer as $$select client_id from public.utilisateurs where auth_user_id=auth.uid()$$;
 create function public.patisgest_mon_role() returns text language sql stable security definer as $$select role from public.utilisateurs where auth_user_id=auth.uid()$$;
 create function public.patisgest_module_autorise(text) returns boolean language sql stable as $$select true$$;
 create table articles(id uuid,client_id uuid,code text,nom text,niveau text,unite text,seuil numeric,pv_ht numeric,allergenes text[],traces text[],created_at timestamptz);
 create table lots(id uuid,client_id uuid,article_id uuid,site_id uuid,fournisseur_id uuid,numero text,qte_init numeric,qte_rest numeric,pu numeric,dlc date,date_reception date,ref text,congele boolean,bloque boolean,created_at timestamptz,bloque_motif text);
 create table recette_versions(id uuid,client_id uuid,famille_id uuid,version int,rendement_qte numeric,rendement_unite text,cuisson_perte_pct numeric,active boolean,created_at timestamptz,energie numeric,mo_min numeric,ingredients jsonb);
 create table ordres_fabrication(id uuid,client_id uuid,famille_id uuid,version_id uuid,site_id uuid,numero text,qte_prevue numeric,qte_realisee numeric,date_prevue date,date_lancement date,statut text,snapshot jsonb,created_at timestamptz,cout_reel numeric,client_ref text);
 create table cakes(id uuid,client_id uuid,numero text,client_nom text,telephone text,date_event date,nb_parts integer,statut text,notes text,cgv boolean,version_id uuid,site_id uuid,qte_fabrication numeric,of_id uuid,created_at timestamptz,prix_ht numeric);
 create function public.terminer_of(uuid,numeric,text,date) returns jsonb language plpgsql security definer as $$begin return '{"cout_unitaire": 123, "statut":"termine"}'; end$$;
 create function public.evoluer_cake(uuid,text,numeric) returns jsonb language plpgsql security definer as $$begin return '{"paid": 123, "balance":55,"statut":"produit"}'; end$$;
 create function public.vendre_article() returns text language plpgsql security definer as $$begin return '1000'; end$$;
 create function public.vendre_panier() returns text language plpgsql security definer as $$begin return '1000'; end$$;
 create function public.importer_z() returns text language plpgsql security definer as $$begin return '1000'; end$$;
 create function public.rappel_lot(uuid) returns jsonb language plpgsql security definer as $$begin return '{"ventes":[{"ticket":"T","total_ht":100}],"ventes_descendants":[{"ticket":"D","total_ht":500}]}'; end$$;
 grant usage on schema public,auth to authenticated; grant execute on all functions in schema public,auth to authenticated;
 insert into articles(id,client_id,nom,code,niveau,unite,seuil,pv_ht) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000001','Tarte','T','produit','pcs',2,500),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','20000000-0000-0000-0000-000000000002','Etranger','E','produit','pcs',1,999);`);
 const tables=['articles','lots','recette_versions','ordres_fabrication','cakes','mouvements','ventes','clotures','transferts','bons_commande','historique_prix','parametres_couts','z_imports'];
 for(const t of tables) {
  if(t==='ventes') { await db.exec('create table public.ventes(id uuid,client_id uuid,site_id uuid,date_vente date,source text,lignes jsonb,total_ttc numeric);'); }
  if(t==='bons_commande') { await db.exec('create table public.bons_commande(id uuid,client_id uuid,fournisseur_id uuid,numero text,date_bc date,statut text,created_at timestamptz,lignes jsonb);'); }
  if(!['ventes','bons_commande','articles','lots','recette_versions','ordres_fabrication','cakes'].includes(t)) await db.exec(`create table public.${t}(id int,client_id uuid);`);
  await db.exec(`alter table public.${t} enable row level security; create policy base on public.${t} for select to authenticated using(client_id=public.patisgest_mon_client()); grant select on public.${t} to authenticated;`);
 }
 await db.exec(await readFile(new URL('../supabase/brouillons/101-confidentialite-labo.sql',import.meta.url),'utf8'));
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000001',false);set role authenticated;");
 assert.equal((await db.query('select * from public.articles')).rows.length,0);
 const safe=await db.query('select * from public.labo_articles');
 assert.equal(safe.rows.length,1); assert.equal(safe.rows[0].nom,'Tarte'); assert.equal('pv_ht' in safe.rows[0],false);
 await assert.rejects(db.query('select pv_ht from public.labo_articles'),/does not exist/);
 const fin=await db.query("select public.terminer_of(null,1,'L',null) r"); assert.equal(fin.rows[0].r.cout_unitaire,undefined);
 const rappel=await db.query('select public.rappel_lot(null) r'); assert.equal(rappel.rows[0].r.ventes[0].total_ht,undefined); assert.equal(rappel.rows[0].r.ventes_descendants[0].total_ht,undefined);
 const cake=await db.query("select public.evoluer_cake(null,'produit',null) r"); assert.equal(cake.rows[0].r.paid,undefined);assert.equal(cake.rows[0].r.balance,undefined);
 await assert.rejects(db.query("select public.evoluer_cake(null,'payer',1)"),/reservee au comptoir/i);
 await assert.rejects(db.query('select public.vendre_panier()'),/Reserve au comptoir/i);
 await assert.rejects(db.query("select public.patisgest_terminer_of_interne(null,1,'L',null)"),/permission denied/);
 await db.exec("select set_config('test.uid','00000000-0000-0000-0000-000000000002',false)");
 assert.equal((await db.query('select pv_ht from public.articles')).rows[0].pv_ht,'500');
 assert.equal((await db.query('select * from public.labo_articles')).rows.length,0);
 assert.equal((await db.query("select public.terminer_of(null,1,'L',null) r")).rows[0].r.cout_unitaire,123);
 } finally {await db.close();}
});
