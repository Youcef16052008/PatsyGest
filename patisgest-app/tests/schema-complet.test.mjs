import { migrationsRepetition } from './migrations-historique.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Reconstitue les migrations métier, non les services Auth/PostgREST Supabase.
// Les identités et données sont factices et restent dans cette base éphémère.
test('migrations locales sur schéma métier complet et policies authentifiées', async () => {
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
  const migrations=migrationsRepetition();
  for (const file of migrations) {
   let sql=await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8');
   sql=sql.replace('create extension if not exists pgcrypto;', ''); // gen_random_uuid est natif dans PGlite
   // La 07 actuelle a été rééditée après la 16 : sa fin référence l'ancienne
   // signature historique, supprimée par la 17 sur la base existante.
   if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
   if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1;');
   try {await db.exec(sql);} catch (e) {throw new Error(`${file}: ${e.message}`,{cause:e});}
  }
  // Inventaire de surface : toute nouvelle fonction SECURITY DEFINER accessible
  // doit être classée ; cela ne prouve pas que les fonctions sont sûres.
  const inventory=JSON.parse(await readFile(new URL('./inventaire-rpc.json',import.meta.url),'utf8'));
  const expected=Object.entries(inventory).filter(([k])=>k!=='metadata').flatMap(([,v])=>v).sort();
  assert.equal(new Set(expected).size,expected.length,'Entrée dupliquée dans l’inventaire RPC');
  const exposed=(await db.query(`select p.proname,has_function_privilege('anon',p.oid,'execute') as anon_exec
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prosecdef
    and (has_function_privilege('authenticated',p.oid,'execute') or has_function_privilege('anon',p.oid,'execute')) order by p.proname`)).rows;
  assert.deepEqual(exposed.map(x=>x.proname),expected,'Inventaire RPC incomplet, signature surchargée ou droits inattendus');
  assert.equal(exposed.some(x=>x.anon_exec),false,'RPC SECURITY DEFINER accessible à anon');
  const views=(await db.query(`select c.relname, c.reloptions, has_table_privilege('anon',c.oid,'select') as anon_select
    from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('v','m') order by c.relname`)).rows;
  assert.deepEqual(views.map(v=>v.relname),['labo_articles','labo_bons_commande','labo_cakes','labo_lots','labo_ordres_fabrication','labo_recette_versions','labo_ventes_quantites','vendeur_lots','vendeur_ordres_fabrication']);
  assert.equal(views.some(v=>v.anon_select),false,'Vue labo accessible à anon');
  assert.ok(views.every(v=>v.reloptions?.includes('security_barrier=true')),'Barrière de vue manquante');
  await db.exec(`insert into clients(id,nom) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Atelier A'),('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Atelier B');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values
   ('11111111-1111-1111-1111-111111111111','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000001','owner@example.test','Propriétaire','proprietaire'),
   ('22222222-2222-2222-2222-222222222222','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','10000000-0000-0000-0000-000000000002','labo@example.test','Labo','labo'),
   ('33333333-3333-3333-3333-333333333333','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','10000000-0000-0000-0000-000000000003','autre@example.test','Autre','proprietaire');
   insert into sites(id,client_id,nom) values ('dddddddd-dddd-dddd-dddd-dddddddddddd','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Labo');
   insert into equipe_sites(utilisateur_id,site_id) values ('22222222-2222-2222-2222-222222222222','dddddddd-dddd-dddd-dddd-dddddddddddd');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht) values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A1','Farine','matiere','kg',123);
   select set_config('test.uid','10000000-0000-0000-0000-000000000002',false); set role authenticated;`);
  await assert.rejects(db.query("insert into public.parametres_couts(client_id,taux_horaire) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',123)"), /row-level security/);
  assert.equal((await db.query('select * from public.articles')).rows.length,0);
  assert.equal((await db.query('select nom from public.labo_articles')).rows[0].nom,'Farine');
  const result=await db.query("select public.receptionner_lot('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee','dddddddd-dddd-dddd-dddd-dddddddddddd','LOT1',5,12,null,null,null) as id");
  assert.ok(result.rows[0].id);
  assert.equal((await db.query('select qte_rest from public.labo_lots')).rows[0].qte_rest,'5.0000');
  // Les commandes conservent leurs quantités mais jamais leurs montants.
  await db.query("insert into public.fournisseurs(client_id,nom) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Fournisseur test')");
  const supplier=(await db.query('select id from fournisseurs')).rows[0].id;
  const bc=await db.query("select public.creer_commande($1, $2::jsonb, null) r",[supplier,JSON.stringify([{articleId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',qte:3,pu:99}])]);
  const purchaseId=bc.rows[0].r.commande_id;
  const safePurchase=(await db.query('select lignes from public.labo_bons_commande where id=$1',[purchaseId])).rows[0].lignes;
  assert.equal(safePurchase[0].qte,3); assert.equal('pu' in safePurchase[0],false);
  const reception=await db.query("select public.recevoir_commande($1, 'dddddddd-dddd-dddd-dddd-dddddddddddd', $2::jsonb) r",[purchaseId,JSON.stringify([{index:0,qte:2,numero:'COM-1',dlc:'2099-01-01'}])]);
  assert.equal(reception.rows[0].r.lots,1);
  // Les recettes et OF utilisent les vraies RPC, la sortie du coût est expurgée.
  await db.query("insert into public.articles(client_id,code,nom,niveau,unite,pv_ht,tva) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','P1','Gâteau','produit','pcs',100,19)");
  const prod=(await db.query("select id from public.labo_articles where code='P1'")).rows[0].id;
  const famille=(await db.query("select public.creer_famille('REC','Recette',$1) r",[prod])).rows[0].r.famille_id;
  const version=(await db.query("select public.creer_version($1,10,'pcs',$2::jsonb,null,1,2,3,4,0,true) r",[famille,JSON.stringify([{articleId:'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',q:1,u:'kg',parage:0}])])).rows[0].r.version_id;
  // Les vues de prévision ne doivent pas exposer les prix, même si des JSON
  // historiques contiennent des champs financiers supplémentaires.
  await db.exec('reset role');
  await db.query("update public.recette_versions set ingredients=jsonb_set(ingredients,'{0,secret_financier}',to_jsonb(9999),true) where id=$1",[version]);
  await db.query("insert into public.ventes(client_id,site_id,numero,ticket,date_vente,source,lignes,total_ht,total_ttc) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','V1','T1',current_date,'caisse',$1::jsonb,999,1199)",[JSON.stringify([{articleId:prod,qty:4,pu:999,totalHT:3996,secret:{cout:777}}])]);
  await db.exec('set role authenticated');
  const sanitized=(await db.query('select ingredients from public.labo_recette_versions where id=$1',[version])).rows[0].ingredients;
  assert.equal(sanitized[0].q,1); assert.equal('secret_financier' in sanitized[0],false);
  const sale=(await db.query('select * from public.labo_ventes_quantites')).rows[0];
  assert.equal(sale.lignes[0].qty,4); assert.equal('pu' in sale.lignes[0],false); assert.equal('secret' in sale.lignes[0],false); assert.equal('total_ttc' in sale,false);
  const of=(await db.query("select public.creer_of($1,'dddddddd-dddd-dddd-dddd-dddddddddddd',10,current_date,'test-of') r",[version])).rows[0].r.of_id;
  // Vérifier le brouillon réassort avec deux sites, sans succès partiel.
  await db.exec(`reset role;
   insert into sites(id,client_id,nom) values ('cccccccc-cccc-cccc-cccc-cccccccccccc','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','Autre site');
   insert into demandes_reassort(id,client_id,site_id,article_id,date_cible,qte) values
   ('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','dddddddd-dddd-dddd-dddd-dddddddddddd','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',current_date,1),
   ('aaaaaaaa-0000-0000-0000-000000000002','aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','cccccccc-cccc-cccc-cccc-cccccccccccc','eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',current_date,1);
   set role authenticated;`);
  const request='aaaaaaaa-0000-0000-0000-000000000001', hidden='aaaaaaaa-0000-0000-0000-000000000002';
  // Cake : vérifier que la création réelle fonctionne sur le socle complet
  // (notamment sans colonne cakes.agent_id), pas seulement dans un mock.
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  const cake=(await db.query("select public.creer_cake_production('Test',null,'2099-02-01',10,1000,'[]',null,false,$1,'cccccccc-cccc-cccc-cccc-cccccccccccc',10) r",[version])).rows[0].r.cake_id;
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  await assert.rejects(db.query("select public.accepter_cgv($1,'1')",[cake]),/Site non autorise/);
  await assert.rejects(db.query("select public.creer_cake_production('Test',null,'2099-02-01',10,1000,'[]',null,false,$1,'dddddddd-dddd-dddd-dddd-dddddddddddd',10)",[version]),/Creation reservee au comptoir/);
  await db.exec('reset role');
  await db.query('delete from public.cakes where id=$1',[cake]);
  await db.exec('set role authenticated');
  assert.equal((await db.query("select public.traiter_demandes_reassort($1::uuid[],'planifiee',$2,null) r",[[request],of])).rows[0].r.updated,1);
  await assert.rejects(db.query("select public.traiter_demandes_reassort($1::uuid[],'annulee',null,null)",[[request,hidden]]),/Site non autorise/);
  assert.equal((await db.query('select statut from public.demandes_reassort where id=$1',[request])).rows[0].statut,'planifiee');
  await db.exec("reset role; delete from sites where id='cccccccc-cccc-cccc-cccc-cccccccccccc'; set role authenticated;");
  await db.query('select public.demarrer_of($1)',[of]);
  const partial=(await db.query("select public.terminer_of($1,5,'GATEAU-1','2099-01-01') r",[of])).rows[0].r;
  assert.equal(partial.statut,'partiel'); assert.equal('cout_unitaire' in partial,false);
  const finished=(await db.query("select public.terminer_of($1,5,'GATEAU-2','2099-01-01') r",[of])).rows[0].r;
  assert.equal(finished.statut,'termine'); assert.equal('cout_unitaire' in finished,false);
  await db.exec('reset role');
  const valorisation=(await db.query("select cout_reel, (select sum((x->>'qty')::numeric*(x->>'pu')::numeric) from jsonb_array_elements(consommations) x) matiere from public.ordres_fabrication where id=$1",[of])).rows[0];
  // Une seule consommation matière + 9 de frais par série, même lorsque
  // la fabrication est réceptionnée en deux lots ; le coût dépend du FEFO.
  assert.equal(Number(valorisation.cout_reel),Number(valorisation.matiere)+9);
  await db.exec('set role authenticated');
  const rappel=(await db.query('select public.rappel_lot($1) r',[finished.lot_id])).rows[0].r;
  assert.ok(rappel.lot); assert.ok(!JSON.stringify(rappel).includes('total_ht'));
  assert.equal(rappel.sections_masquees.ventes,true);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  const rappelOwner=(await db.query('select public.rappel_lot($1) r',[finished.lot_id])).rows[0].r;
  assert.ok(rappelOwner.lot); assert.equal(rappelOwner.sections_masquees,undefined);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  // L'écriture d'un nouveau prix reste possible sans lecture des prix existants.
  await db.query(`insert into public.articles(client_id,code,nom,niveau,unite,pv_ht,tva)
    values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','A2','Sucre','matiere','kg',44,19)`);
  assert.equal((await db.query('select count(*)::int n from public.articles')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.historique_prix')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.labo_articles')).rows[0].n,3);
  await assert.rejects(db.query('select pv_ht from public.labo_articles'),/does not exist/);
  await assert.rejects(db.query("select public.vendre_panier('dddddddd-dddd-dddd-dddd-dddddddddddd','[]','X','especes')"),/Reserve au comptoir/);
  // Un compte sans privilège de gestion ne peut pas modifier ses propres accès.
  await assert.rejects(db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','qualite',false)"),/Reserve au proprietaire/);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  assert.equal((await db.query('select count(*)::int n from public.articles')).rows[0].n,3);
  const emptyDump={client_id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',tables:[]};
  const restore=(await db.query('select public.restaurer_sauvegarde($1::jsonb) r',[JSON.stringify(emptyDump)])).rows[0].r;
  assert.deepEqual(restore.ignore,{});
  // Une collision sur les sites ne doit pas laisser passer l'article suivant.
  const existingSite=(await db.query("select to_jsonb(s) row from sites s where id='dddddddd-dddd-dddd-dddd-dddddddddddd'")).rows[0].row;
  const existingArticle=(await db.query("select to_jsonb(a) row from articles a where id='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'")).rows[0].row;
  const newArticle={...existingArticle,id:'aaaaaaaa-0000-0000-0000-000000000099',code:'REST-NOUVEAU'};
  const collision={client_id:emptyDump.client_id,tables:[{table:'sites',lignes:[existingSite]},{table:'articles',lignes:[newArticle]}]};
  await assert.rejects(db.query('select public.restaurer_sauvegarde($1::jsonb)',[JSON.stringify(collision)]),/Conflit de restauration/);
  assert.equal((await db.query('select count(*)::int n from articles where id=$1',[newArticle.id])).rows[0].n,0);
  // FK valide en PostgreSQL mais vers un autre établissement : refus atomique.
  await db.exec(`reset role; insert into sites(id,client_id,nom) values ('bbbbbbbb-0000-0000-0000-000000000099','bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb','Site étranger'); set role authenticated`);
  const existingLot=(await db.query('select to_jsonb(l) row from lots l limit 1')).rows[0].row;
  const foreignLot={...existingLot,id:'aaaaaaaa-0000-0000-0000-000000000098',site_id:'bbbbbbbb-0000-0000-0000-000000000099'};
  await assert.rejects(db.query('select public.restaurer_sauvegarde($1::jsonb)',[JSON.stringify({client_id:emptyDump.client_id,tables:[{table:'lots',lignes:[foreignLot]}]})]),/Lien inter-etablissement/);
  assert.equal((await db.query('select count(*)::int n from lots where id=$1',[foreignLot.id])).rows[0].n,0);
  const restoredArticle=(await db.query('select public.restaurer_sauvegarde($1::jsonb) r',[JSON.stringify({client_id:emptyDump.client_id,tables:[{table:'articles',lignes:[newArticle]}]})])).rows[0].r;
  assert.equal(restoredArticle.insere.articles,1);
  assert.deepEqual((await db.query('select to_jsonb(a) row from articles a where id=$1',[newArticle.id])).rows[0].row,newArticle);
  await assert.rejects(db.query("select public.modifier_acces_module('33333333-3333-3333-3333-333333333333','qualite',false)"),/Compte introuvable/);
  await db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','qualite',false)");
  await db.query("select public.modifier_acces_module('22222222-2222-2222-2222-222222222222','planning',false)");
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  assert.equal((await db.query('select count(*)::int n from public.labo_ventes_quantites')).rows[0].n,0);
  await assert.rejects(db.query("select public.maj_non_conformite(null,'corrige','Action')"),/Module desactive/);
  await assert.rejects(db.query("insert into public.nettoyages(client_id,date_nettoyage,zone) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',current_date,'test')"), /row-level security|violates row-level security/);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000003',false)");
  assert.equal((await db.query('select count(*)::int n from public.articles')).rows[0].n,0);
  assert.equal((await db.query('select count(*)::int n from public.labo_articles')).rows[0].n,0);
  // Affectation et révocation : aucune élévation inter-établissement ; le
  // même sujet Auth perd les accès sans rafraîchir son identité simulée.
  await assert.rejects(db.query("select public.equipe_accepter_invitation('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')"),/Admission indisponible/);
  await assert.rejects(db.query('update public.equipe_admission_securite set autorisee=true'),/permission denied/);
  const member='22222222-2222-2222-2222-222222222222', memberSite='dddddddd-dddd-dddd-dddd-dddddddddddd';
  await assert.rejects(db.query('select public.equipe_modifier_affectations($1,$2::uuid[],$3::text[])',[member,[memberSite],['stocks']]),/Compte introuvable/);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  await assert.rejects(db.query('select public.equipe_modifier_affectations($1,$2::uuid[],$3::text[])',[member,[memberSite],['inconnu']]),/Modules invalides/);
  const before=(await db.query('select * from public.equipe_lister_membres()')).rows.find(x=>x.id===member);
  assert.ok(before); assert.deepEqual(before.sites,[memberSite]);
  await db.query("select public.modifier_acces_module($1,'stocks',false)",[member]);
  await assert.rejects(db.query('select public.equipe_modifier_affectations_versionnees($1,$2::bigint,$3::uuid[],$4::text[])',[member,before.revision,[memberSite],['stocks']]),/Affectations modifiees/);
  const after=(await db.query('select * from public.equipe_lister_membres()')).rows.find(x=>x.id===member);
  assert.notEqual(before.revision,after.revision);
  await db.query('select public.equipe_modifier_affectations_versionnees($1,$2::bigint,$3::uuid[],$4::text[])',[member,after.revision,[memberSite],['stocks']]);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  assert.equal((await db.query("select public.patisgest_module_autorise('stocks') ok")).rows[0].ok,true);
  assert.equal((await db.query("select public.patisgest_module_autorise('planning') ok")).rows[0].ok,false);
  await assert.rejects(db.query('select public.equipe_revoquer($1)',[member]),/Reserve au proprietaire/);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000001',false)");
  await db.query('select public.equipe_revoquer($1)',[member]);
  await db.exec("select set_config('test.uid','10000000-0000-0000-0000-000000000002',false)");
  assert.equal((await db.query('select count(*)::int n from public.clients')).rows[0].n,0);
  assert.equal((await db.query("select public.patisgest_module_autorise('stocks') ok")).rows[0].ok,false);
  await assert.rejects(db.query('select * from public.equipe_journal_acces'),/permission denied/);

 } finally {await db.close();}
});

test('transition isolée : comptes existants, droits inchangés et sites choisis explicitement', async () => {
 const db=new PGlite();
 const A='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', lab='22222222-2222-2222-2222-222222222222', seller='33333333-3333-3333-3333-333333333333';
 const ownerAuth='10000000-0000-0000-0000-000000000001',labAuth='10000000-0000-0000-0000-000000000002',sellerAuth='10000000-0000-0000-0000-000000000003';
 const labSite='dddddddd-dddd-dddd-dddd-dddddddddddd',shop='eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
 const modules=['stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation'];
 try {
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  const files=migrationsRepetition();
  for(const file of files) {
   if(file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
   if(file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
   if(file.startsWith('104-')) {
    await db.query('insert into clients(id,nom) values ($1,$2)',[A,'Atelier fictif']);
    await db.query(`insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values
     ('11111111-1111-1111-1111-111111111111',$1,$2,'owner@example.test','Owner','proprietaire'),
     ($3,$1,$4,'lab@example.test','Labo','labo'),($5,$1,$6,'seller@example.test','Vendeur','vendeur')`,[A,ownerAuth,lab,labAuth,seller,sellerAuth]);
    await db.query("insert into sites(id,client_id,nom,type) values ($1,$3,'Labo','laboratoire'),($2,$3,'Boutique','boutique')",[labSite,shop,A]);
    await db.query("insert into acces_modules(utilisateur_id,module,actif) values ($1,'simulation',false),($2,'achats',false)",[lab,seller]);
   }
   const migration=(await readFile(new URL(`../supabase/${file}`,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
   try {await db.exec(migration);} catch(e) {throw new Error(`${file}: ${e.message}`,{cause:e});}
  }
  await db.exec(`select set_config('test.uid','${labAuth}',false); set role authenticated`);
  const initialLab=(await db.query('select m,public.patisgest_module_autorise(m) actif from unnest($1::text[]) m order by m',[modules])).rows;
  assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,0,'Aucun site attribué implicitement');
  await db.exec(`select set_config('test.uid','${sellerAuth}',false)`);
  const initialSeller=(await db.query('select m,public.patisgest_module_autorise(m) actif from unnest($1::text[]) m order by m',[modules])).rows;
  assert.equal((await db.query('select count(*)::int n from sites')).rows[0].n,0);
  await db.exec(`select set_config('test.uid','${ownerAuth}',false)`);
  const comptes=(await db.query('select * from public.equipe_lister_membres()')).rows;
  for(const [id,sites,original] of [[lab,[labSite],initialLab],[seller,[shop],initialSeller]]) {
   const account=comptes.find(c=>c.id===id); assert.ok(account); assert.deepEqual(account.sites,[]);
   await db.query('select public.equipe_modifier_affectations_versionnees($1,$2::bigint,$3::uuid[],$4::text[])',[id,account.revision,sites,original.filter(x=>x.actif).map(x=>x.m)]);
  }
  await db.exec(`select set_config('test.uid','${labAuth}',false)`);
  assert.deepEqual((await db.query('select m,public.patisgest_module_autorise(m) actif from unnest($1::text[]) m order by m',[modules])).rows,initialLab,'Modules labo inchangés');
  assert.deepEqual((await db.query('select id from sites')).rows.map(x=>x.id),[labSite]);
  await db.exec(`select set_config('test.uid','${sellerAuth}',false)`);
  assert.deepEqual((await db.query('select m,public.patisgest_module_autorise(m) actif from unnest($1::text[]) m order by m',[modules])).rows,initialSeller,'Modules vendeur inchangés');
  assert.deepEqual((await db.query('select id from sites')).rows.map(x=>x.id),[shop]);
 } finally {await db.close();}
});
