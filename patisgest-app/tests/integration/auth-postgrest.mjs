// Uniquement dans une pile Supabase CLI jetable. Ne jamais viser un projet distant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, PATSYGEST_DISPOSABLE } = process.env;
function assertLocal(value, port) {
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'Refus : hôte non local');
  assert.equal(url.port, port, 'Refus : port inattendu');
}
assert.equal(PATSYGEST_DISPOSABLE, 'yes', 'Environnement jetable requis');
assertLocal(API_URL, '54321');
assertLocal(DB_URL, '54322');
const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
const admin = createClient(API_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const client = () => createClient(API_URL, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const ok = ({ data, error }, context) => { assert.ifError(error && new Error(`${context}: ${error.message}`)); return data; };
const denied = (result, message) => {
  assert.ok(result.error, `Rejet attendu : ${message}`);
  assert.match(result.error.message, new RegExp(message, 'i'));
};
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const site = 'dddddddd-dddd-dddd-dddd-dddddddddddd', article = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ids = ['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444'];

test('Auth et PostgREST réels : isolation, confidentialité et modules', { timeout: 180000 }, async () => {
 try {
  // Garde supplémentaire : base vierge, afin de ne jamais rejouer sur une base existante.
  const existing = await sql`select to_regclass('public.clients') as table_name`;
  assert.equal(existing[0].table_name, null, 'La base doit être vierge');
  // Utilitaire DDL présent sur le pilote mais absent de la pile locale CLI.
  await sql.unsafe('create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$');
  const files = (await readdir(new URL('../../supabase/', import.meta.url))).filter(x => /^\d\d-.*\.sql$/.test(x) && !x.startsWith('02-')).sort();
  for (const file of files) {
    // Les mêmes adaptations historiques que schema-complet.test.mjs ; ce n'est
    // pas une preuve que l'historique des migrations est directement rejouable.
    if (file.startsWith('07-')) await sql.unsafe("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await sql.unsafe('alter table public.clotures add column if not exists revision integer default 1');
    try { await sql.unsafe(await readFile(new URL(`../../supabase/${file}`, import.meta.url), 'utf8')); }
    catch (e) { throw new Error(`Migration ${file}: ${e.message}`, { cause: e }); }
  }
  const emails = ['owner@example.test', 'labo@example.test', 'vendeur@example.test', 'autre@example.test'];
  const roles = ['proprietaire', 'labo', 'vendeur', 'proprietaire'];
  const password = 'Test-only-password-12345!';
  const sessions = [];
  const authIds = [];
  for (const email of emails) {
    const created = ok(await admin.auth.admin.createUser({ email, password, email_confirm: true }), 'Création compte fictif Auth');
    authIds.push(created.user.id);
    const session = client();
    ok(await session.auth.signInWithPassword({ email, password }), 'Connexion Auth réelle');
    sessions.push(session);
  }
  await sql`insert into clients(id,nom) values (${A},'Atelier A'),(${B},'Atelier B')`;
  for (let i = 0; i < ids.length; i++) {
    await sql`insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values (${ids[i]},${i === 3 ? B : A},${authIds[i]},${emails[i]},${roles[i]},${roles[i]})`;
  }
  await sql`insert into sites(id,client_id,nom) values (${site},${A},'Labo')`;
  await sql`insert into equipe_sites(utilisateur_id,site_id) values (${ids[1]},${site}),(${ids[2]},${site})`;
  await sql`insert into articles(id,client_id,code,nom,niveau,unite,pv_ht) values (${article},${A},'A1','Farine','matiere','kg',123)`;
  await sql`notify pgrst, 'reload schema'`;
  // Le rechargement du cache est asynchrone.
  for (let i = 0; i < 30; i++) {
    const probe = await sessions[0].from('articles').select('id');
    if (!probe.error) break;
    if (i === 29) throw new Error(`Cache PostgREST : ${probe.error.message}`);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  const [owner, lab, seller, other] = sessions;
  // Un compte Auth seul ne devient pas membre, même avec des métadonnées forgées.
  ok(await admin.auth.admin.createUser({email:'non-approuve@example.test',password,email_confirm:true,user_metadata:{client_id:A,role:'proprietaire'}}), 'Compte Auth sans adhésion');
  const pending = client();
  ok(await pending.auth.signInWithPassword({email:'non-approuve@example.test',password}), 'Connexion compte sans adhésion');
  assert.equal(ok(await pending.from('clients').select('id'), 'Client sans adhésion').length,0);
  assert.equal(ok(await pending.from('sites').select('id'), 'Sites sans adhésion').length,0);
  assert.equal(ok(await pending.from('articles').select('id'), 'Articles sans adhésion').length,0);
  denied(await pending.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:false}), 'Reserve au proprietaire');
  assert.equal(ok(await owner.from('articles').select('id,pv_ht'), 'Articles propriétaire').length, 1);
  assert.equal(ok(await lab.from('articles').select('*'), 'Articles bruts labo').length, 0);
  assert.equal(ok(await lab.from('labo_articles').select('*'), 'Vue labo')[0].nom, 'Farine');
  assert.ok((await lab.from('labo_articles').select('pv_ht')).error, 'Prix absent de la vue');
  assert.equal(ok(await other.from('articles').select('*'), 'Isolation autre propriétaire').length, 0);
  assert.equal(ok(await other.from('labo_articles').select('*'), 'Isolation vue labo').length, 0);
  assert.equal(ok(await seller.from('clients').select('id'), 'Client vendeur')[0].id, A);
  const newSite = ok(await owner.from('sites').insert({client_id:A,nom:'Boutique 2',type:'boutique'}).select('id').single(), 'Ajout boutique propriétaire');
  assert.ok(newSite.id);
  ok(await owner.from('sites').update({nom:'Boutique modifiée'}).eq('id',newSite.id).select('id').single(), 'Modification boutique propriétaire');
  const otherLot = await sql`insert into lots(client_id,article_id,site_id,numero,qte_init,qte_rest,pu) values (${A},${article},${newSite.id},'AUTRE-SITE',4,4,77) returning id`;
  const legacyTask=await sql`insert into taches_planning(client_id,date_tache,tache) values (${A},'2099-01-01','Donnée sans site') returning id`;
  assert.equal(ok(await lab.from('taches_planning').select('id').eq('id',legacyTask[0].id),'Planning sans site masqué').length,0);
  assert.equal(ok(await owner.from('taches_planning').select('id').eq('id',legacyTask[0].id),'Planning visible propriétaire').length,1);
  assert.ok((await lab.from('taches_planning').insert({client_id:A,date_tache:'2099-01-01',tache:'Interdit'})).error,'Écriture sans site refusée');
  denied(await lab.rpc('rappel_lot',{p_lot_id:otherLot[0].id}), 'Site non autorise');
  denied(await lab.rpc('bloquer_lot',{p_lot_id:otherLot[0].id,p_bloque:true,p_motif:'test',p_descendants:true}), 'Site non autorise');
  assert.equal(ok(await owner.from('lots').select('id').eq('site_id',newSite.id), 'Lot autre site propriétaire').length,1);
  assert.equal(ok(await lab.from('sites').select('id').eq('id',newSite.id), 'Site non attribué labo').length,0);
  assert.equal(ok(await seller.from('sites').select('id').eq('id',newSite.id), 'Site non attribué vendeur').length,0);
  assert.equal(ok(await seller.from('lots').select('id').eq('site_id',newSite.id), 'Lot non attribué vendeur').length,0);
  assert.equal(ok(await lab.from('labo_lots').select('id').eq('site_id',newSite.id), 'Vue labo autre site').length,0);
  denied(await lab.rpc('receptionner_lot',{p_article_id:article,p_site_id:newSite.id,p_numero:'NON',p_qte:1,p_pu:10}), 'Site non autorise');
  denied(await seller.rpc('vendre_article',{p_article_id:article,p_site_id:newSite.id,p_qte:1,p_ticket:'NON'}), 'Site non autorise');
  denied(await lab.rpc('transferer_article',{p_article_id:article,p_from_site_id:site,p_to_site_id:newSite.id,p_qte:1,p_motif:'test',p_responsable:'test'}), 'Site non autorise');
  assert.ok((await lab.from('sites').insert({client_id:A,nom:'Non autorisé',type:'boutique'})).error, 'Labo ne crée pas de site');
  assert.equal(ok(await lab.from('sites').update({nom:'Non autorisé'}).eq('id',newSite.id).select('id'), 'Modification labo refusée').length,0);
  assert.equal(ok(await other.from('sites').update({nom:'Autre client'}).eq('id',newSite.id).select('id'), 'Modification inter-client refusée').length,0);

  // Fondations d'adhésion uniquement : aucune RPC ne peut encore activer
  // l'accès tant que l'isolation par site n'est pas terminée.
  const code = ok(await owner.rpc('equipe_code',{p_renouveler:false}), 'Code de demande');
  denied(await pending.rpc('equipe_demander',{p_code:code,p_nom:'Personne',p_role:'proprietaire'}), 'Demande invalide');
  ok(await pending.rpc('equipe_demander',{p_code:code,p_nom:'Personne',p_role:'vendeur'}), 'Demande avec identité Auth vérifiée');
  const demands = ok(await owner.rpc('equipe_lister_demandes'), 'Demandes du propriétaire');
  assert.equal(demands.length,1); assert.equal(demands[0].email,'non-approuve@example.test');
  assert.equal(ok(await other.rpc('equipe_lister_demandes'), 'Demandes autre établissement').length,0);
  assert.ok((await pending.from('equipe_demandes').select('*')).error);
  denied(await other.rpc('equipe_refuser_demande',{p_id:demands[0].id}), 'Demande introuvable');
  denied(await other.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Demande introuvable');
  denied(await lab.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Reserve au proprietaire');
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[site]}), 'Sites invalides');
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id,newSite.id]}), 'Sites invalides');
  const pendingId=ok(await pending.auth.getUser(),'Identité Auth fictive').user.id;
  await sql`update auth.users set email='autre-adresse@example.test' where id=${pendingId}`;
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Demande devenue invalide');
  await sql`update auth.users set email='non-approuve@example.test' where id=${pendingId}`;
  const approvalRace=await Promise.all([owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}),owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]})]);
  assert.equal(approvalRace.filter(x=>!x.error).length,1,'Une seule approbation concurrente réussit');
  const approved=ok(await owner.rpc('equipe_lister_approbations'), 'Approbations propriétaire');
  assert.equal(approved.length,1); assert.deepEqual(approved[0].sites,[newSite.id]);
  assert.equal(ok(await other.rpc('equipe_lister_approbations'), 'Isolation des approbations').length,0);
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Demande introuvable');
  assert.equal(ok(await pending.from('sites').select('id'), 'Approbation ne crée pas d’accès').length,0);
  assert.equal(ok(await pending.from('clients').select('id'), 'Approbation ne rattache pas de compte').length,0);
  assert.ok((await pending.rpc('equipe_annuler_approbation',{p_id:demands[0].id})).error);
  denied(await other.rpc('equipe_annuler_approbation',{p_id:demands[0].id}), 'Demande introuvable');
  ok(await owner.rpc('equipe_annuler_approbation',{p_id:demands[0].id}), 'Annuler approbation');
  assert.equal(ok(await owner.rpc('equipe_lister_approbations'), 'Plus aucune approbation').length,0);
  ok(await pending.rpc('equipe_demander',{p_code:code,p_nom:'Personne',p_role:'vendeur'}), 'Nouvelle demande après refus');
  denied(await lab.rpc('equipe_code',{p_renouveler:false}), 'Reserve au proprietaire');
  assert.ok((await owner.rpc('equipe_inviter',{p_email:'non-approuve@example.test',p_nom:'Personne',p_role:'vendeur',p_sites:[site]})).error, 'Un vendeur ne peut être affecté à un laboratoire');
  ok(await owner.rpc('equipe_inviter',{p_email:'non-approuve@example.test',p_nom:'Personne',p_role:'vendeur',p_sites:[newSite.id]}), 'Invitation propriétaire');
  const invites = ok(await pending.rpc('equipe_mes_invitations'), 'Invitation pour adresse vérifiée');
  assert.equal(invites.length,1); assert.equal(invites[0].role,'vendeur');
  assert.ok((await pending.rpc('equipe_accepter_invitation',{p_id:invites[0].id})).error, 'Activation volontairement indisponible');
  assert.equal(ok(await pending.from('sites').select('id'), 'Toujours aucun accès avant approbation').length,0);
  const newCode = ok(await owner.rpc('equipe_code',{p_renouveler:true}), 'Renouvellement du code');
  assert.notEqual(newCode,code);
  denied(await pending.rpc('equipe_demander',{p_code:code,p_nom:'Personne',p_role:'vendeur'}), 'Code invalide');
  ok(await owner.rpc('equipe_refuser_demande',{p_id:demands[0].id}), 'Refus propriétaire');
  assert.equal(ok(await owner.rpc('equipe_lister_demandes'), 'Demandes après refus').length,0);
  denied(await lab.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:false}), 'Reserve au proprietaire');
  denied(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[3],p_module:'qualite',p_actif:false}), 'Compte introuvable');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:false}), 'Désactiver qualité');
  assert.ok(ok(await lab.rpc('mes_modules_desactives'), 'Modules du labo').includes('qualite'));
  denied(await lab.rpc('maj_non_conformite',{p_id:null,p_statut:'corrige',p_action:'test'}), 'Module desactive');
  assert.equal(ok(await lab.from('parametres_couts').select('*'), 'Coûts bruts labo').length,0);
  assert.ok((await lab.from('parametres_couts').insert({client_id:A,taux_horaire:123})).error);
  const lot = ok(await lab.rpc('receptionner_lot',{p_article_id:article,p_site_id:site,p_numero:'LOT1',p_qte:5,p_pu:12}), 'Réception labo');
  assert.ok(lot);
  assert.equal(ok(await lab.from('labo_lots').select('qte_rest'), 'Lots labo').length, 1);
  assert.equal(ok(await lab.from('lots').select('*'), 'Lots bruts labo').length, 0);

  // Achat et réception par le labo, avec contrôle des JSON financiers.
  const fournisseur = 'ffffffff-ffff-ffff-ffff-ffffffffffff';
  await sql`insert into fournisseurs(id,client_id,nom) values (${fournisseur},${A},'Fournisseur fictif')`;
  const purchaseArgs={p_fournisseur_id:fournisseur,p_lignes:[{articleId:article,qte:3,pu:99}],p_notes:null};
  const ownerPurchase=ok(await owner.rpc('creer_commande',purchaseArgs),'Commande propriétaire');
  assert.equal(ok(await lab.from('labo_bons_commande').select('id').eq('id',ownerPurchase.commande_id),'Commande sans site masquée').length,0);
  denied(await lab.rpc('creer_commande',purchaseArgs),'attribution de tous les sites');
  await sql`insert into equipe_sites(utilisateur_id,site_id) values (${ids[1]},${newSite.id})`;
  assert.equal(ok(await lab.from('taches_planning').select('id').eq('id',legacyTask[0].id),'Planning visible avec tous les sites').length,1);
  const purchase = ok(await lab.rpc('creer_commande',purchaseArgs), 'Commande labo tous sites');
  const safePurchase = ok(await lab.from('labo_bons_commande').select('lignes').eq('id',purchase.commande_id).single(), 'Commande expurgée');
  assert.equal(safePurchase.lignes[0].qte,3);
  assert.equal('pu' in safePurchase.lignes[0],false);
  const received = ok(await lab.rpc('recevoir_commande',{p_commande_id:purchase.commande_id,p_site_id:site,p_receptions:[{index:0,qte:2,numero:'COM-1',dlc:'2099-01-01'}]}), 'Réception commande');
  assert.equal(received.lots,1);
  await sql`delete from equipe_sites where utilisateur_id=${ids[1]} and site_id=${newSite.id}`;
  denied(await lab.rpc('recevoir_commande',{p_commande_id:purchase.commande_id,p_site_id:site,p_receptions:[{index:0,qte:1,numero:'COM-2',dlc:'2099-01-01'}]}),'attribution de tous les sites');

  // Recette, OF partiel, coûts et rappel via les endpoints réels.
  const product = '99999999-9999-9999-9999-999999999999';
  await sql`insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values (${product},${A},'P1','Gâteau','produit','pcs',100,19)`;
  const famille = ok(await lab.rpc('creer_famille',{p_code:'REC',p_nom:'Recette',p_produit_id:product}), 'Famille recette');
  const version = ok(await lab.rpc('creer_version',{p_famille_id:famille.famille_id,p_rendement_qte:10,p_rendement_unite:'pcs',p_lignes:[{articleId:article,q:1,u:'kg',parage:0}],p_notes:null,p_mo_min:1,p_energie:2,p_emballage:3,p_frais_generaux:4,p_cuisson_perte_pct:0,p_active:true}), 'Version recette');
  await sql`update recette_versions set ingredients=jsonb_set(ingredients,'{0,secret_financier}',to_jsonb(9999),true) where id=${version.version_id}`;
  const safeRecipe = ok(await lab.from('labo_recette_versions').select('ingredients').eq('id',version.version_id).single(), 'Recette expurgée');
  assert.equal(safeRecipe.ingredients[0].q,1); assert.equal('secret_financier' in safeRecipe.ingredients[0],false);
  const otherOrder = ok(await owner.rpc('creer_of',{p_version_id:version.version_id,p_site_id:newSite.id,p_qte_prevue:10,p_date_prevue:'2099-01-01',p_client_ref:'autre-site'}), 'OF autre site propriétaire');
  denied(await lab.rpc('demarrer_of',{p_of_id:otherOrder.of_id}), 'Site non autorise');
  denied(await lab.rpc('terminer_of',{p_of_id:otherOrder.of_id,p_qte:1,p_numero_lot:'NON',p_dlc:'2099-01-01'}), 'Site non autorise');
  const ofArgs={p_version_id:version.version_id,p_site_id:site,p_qte_prevue:10,p_date_prevue:'2099-01-01',p_client_ref:'test-of'};
  const order = ok(await lab.rpc('creer_of',ofArgs), 'Créer OF');
  const retry=ok(await lab.rpc('creer_of',ofArgs),'Rejeu idempotent');
  assert.equal(retry.of_id,order.of_id); assert.equal(retry.duplicate,true);
  const fractionalArgs={...ofArgs,p_qte_prevue:1.2346,p_client_ref:'fraction-arrondie'};
  const fractional=ok(await lab.rpc('creer_of',fractionalArgs),'Création OF avec arrondi métier');
  assert.equal(ok(await lab.rpc('creer_of',fractionalArgs),'Rejeu OF avec arrondi métier').of_id,fractional.of_id);
  const hiddenDuplicate=await lab.rpc('creer_of',{...ofArgs,p_client_ref:'autre-site'});
  denied(hiddenDuplicate,'Reference OF deja utilisee');
  assert.ok(!JSON.stringify(hiddenDuplicate).includes(otherOrder.of_id),'Aucun identifiant du site masqué');
  denied(await lab.rpc('creer_of',{...ofArgs,p_qte_prevue:11}),'Reference OF deja utilisee');
  assert.ok((await lab.rpc('patisgest_creer_of_interne',ofArgs)).error,'Fonction OF interne inaccessible');

  // Cake : création atomique affectée, ancien devis sans site propriétaire,
  // refus des références connues d'un autre site et résultats sans fuites.
  const cakeBase={p_client_nom:'Client fictif',p_telephone:null,p_date_event:'2099-02-01',p_nb_parts:10,p_prix_ht:1000,p_options:[],p_notes:null,p_cgv:false};
  const cakeSite={...cakeBase,p_version_id:version.version_id,p_site_id:site,p_qte:10};
  const ownCake=ok(await seller.rpc('creer_cake_production',cakeSite),'Devis vendeur sur site attribué').cake_id;
  const hiddenCake=ok(await owner.rpc('creer_cake_production',{...cakeSite,p_site_id:newSite.id}),'Devis propriétaire autre site').cake_id;
  const legacyCake=ok(await owner.rpc('creer_cake',cakeBase),'Ancien devis sans site propriétaire').cake_id;
  denied(await seller.rpc('creer_cake',cakeBase),'reservee au proprietaire');
  denied(await lab.rpc('creer_cake_production',cakeSite),'reservee au comptoir');
  denied(await seller.rpc('creer_cake_production',{...cakeSite,p_site_id:newSite.id}),'Site non autorise');
  const edit={p_id:ownCake,p_client_nom:'Client fictif',p_telephone:null,p_date_event:'2099-02-01',p_nb_parts:12,p_prix_ht:1000,p_tva_pct:19,p_notes:null,p_options:[]};
  ok(await seller.rpc('editer_cake',edit),'Éditer devis sur site attribué');
  denied(await lab.rpc('editer_cake',edit),'Edition reservee au comptoir');
  denied(await seller.rpc('editer_cake',{...edit,p_id:hiddenCake}),'Site non autorise');
  denied(await seller.rpc('accepter_cgv',{p_id:hiddenCake,p_version:'1'}),'Site non autorise');
  denied(await seller.rpc('evoluer_cake',{p_id:hiddenCake,p_transition:'payer',p_montant:100}),'Site non autorise');
  denied(await seller.rpc('affecter_production_cake',{p_id:hiddenCake,p_version_id:version.version_id,p_site_id:site,p_qte:10}),'Site non autorise');
  denied(await seller.rpc('affecter_production_cake',{p_id:legacyCake,p_version_id:version.version_id,p_site_id:site,p_qte:10}),'Devis hors perimetre');
  denied(await other.rpc('accepter_cgv',{p_id:ownCake,p_version:'1'}),'Devis hors perimetre');
  assert.ok((await seller.rpc('patisgest_creer_cake_interne',cakeBase)).error,'Fonction interne inaccessible');
  ok(await owner.rpc('affecter_production_cake',{p_id:legacyCake,p_version_id:version.version_id,p_site_id:site,p_qte:10}),'Affectation explicite du devis historique');
  ok(await seller.rpc('accepter_cgv',{p_id:ownCake,p_version:'1'}),'CGV du site attribué');
  await sql`update cakes set of_id=case when id=${ownCake} then ${order.of_id}::uuid else ${otherOrder.of_id}::uuid end where id in (${ownCake},${hiddenCake})`;
  await sql`update ordres_fabrication set lots_produits=${sql.json([{lotId:lot},{lotId:otherLot[0].id},{lotId:'malforme'}])} where id=${order.of_id}`;
  const cakeLinks=ok(await seller.rpc('cake_liens_production'),'Liens cake filtrés');
  assert.equal(cakeLinks.length,1); assert.equal(cakeLinks[0].cake_id,ownCake);
  assert.deepEqual(cakeLinks[0].lots.map(x=>x.lotId),[lot]);
  assert.equal(ok(await owner.rpc('cake_liens_production'),'Liens propriétaire').length,2);
  await sql`update ordres_fabrication set lots_produits='[]'::jsonb where id=${order.of_id}`;
  await sql`update cakes set of_id=null where id in (${ownCake},${hiddenCake})`;

  // Réassort : les identifiants connus ne doivent pas contourner les sites.
  const reqs = await sql`insert into demandes_reassort(client_id,site_id,article_id,date_cible,qte) values
    (${A},${site},${product},'2099-01-01',1),(${A},${newSite.id},${product},'2099-01-01',1)
    returning id,site_id`;
  const ownReq=reqs.find(x=>x.site_id===site).id, hiddenReq=reqs.find(x=>x.site_id===newSite.id).id;
  const transfer = await sql`insert into transferts(client_id,from_site_id,to_site_id) values (${A},${site},${newSite.id}) returning id`;
  const args={p_ids:[ownReq],p_statut:'planifiee',p_of_id:order.of_id,p_transfert_id:null};
  assert.equal(ok(await lab.rpc('traiter_demandes_reassort',args),'Réassort du site attribué').updated,1);
  denied(await lab.rpc('traiter_demandes_reassort',{...args,p_ids:[ownReq,hiddenReq],p_statut:'annulee'}),'Site non autorise');
  const unchanged=await sql`select statut from demandes_reassort where id=${ownReq}`;
  assert.equal(unchanged[0].statut,'planifiee','Aucune mise à jour partielle');
  denied(await lab.rpc('traiter_demandes_reassort',{...args,p_ids:[ownReq,ids[0]]}),'hors perimetre');
  denied(await lab.rpc('traiter_demandes_reassort',{...args,p_of_id:otherOrder.of_id}),'Site non autorise');
  denied(await lab.rpc('traiter_demandes_reassort',{...args,p_transfert_id:transfer[0].id}),'Site non autorise');
  denied(await seller.rpc('traiter_demandes_reassort',args),'Role non autorise');
  denied(await other.rpc('traiter_demandes_reassort',args),'hors perimetre');
  denied(await pending.rpc('traiter_demandes_reassort',args),'Module desactive');
  assert.ok((await client().rpc('traiter_demandes_reassort',args)).error,'Anon refusé');
  // Ancien lien vers un autre site : même un remplacement reste refusé.
  await sql`update demandes_reassort set of_id=${otherOrder.of_id} where id=${ownReq}`;
  assert.equal(ok(await lab.from('demandes_reassort').select('*').eq('id',ownReq),'Ancien OF hors site masqué').length,0);
  assert.equal(ok(await owner.from('demandes_reassort').select('*').eq('id',ownReq),'Ancien OF visible au propriétaire').length,1);
  denied(await lab.rpc('traiter_demandes_reassort',args),'Site non autorise');
  assert.equal(ok(await owner.rpc('traiter_demandes_reassort',{...args,p_ids:[ownReq,hiddenReq]}),'Propriétaire tous sites').updated,2);
  await sql`update demandes_reassort set transfert_id=${transfer[0].id} where id=${ownReq}`;
  assert.equal(ok(await lab.from('demandes_reassort').select('*').eq('id',ownReq),'Ancien transfert hors site masqué').length,0);
  denied(await lab.rpc('traiter_demandes_reassort',args),'Site non autorise');
  await sql`update demandes_reassort set transfert_id=null where id=${ownReq}`;
  ok(await lab.rpc('demarrer_of',{p_of_id:order.of_id}), 'Démarrer OF');
  const partial = ok(await lab.rpc('terminer_of',{p_of_id:order.of_id,p_qte:5,p_numero_lot:'GATEAU-1',p_dlc:'2099-01-01'}), 'OF partiel');
  const finished = ok(await lab.rpc('terminer_of',{p_of_id:order.of_id,p_qte:5,p_numero_lot:'GATEAU-2',p_dlc:'2099-01-01'}), 'OF terminé');
  assert.equal(partial.statut,'partiel'); assert.equal(finished.statut,'termine');
  assert.equal('cout_unitaire' in partial,false); assert.equal('cout_unitaire' in finished,false);
  const valuation = await sql`select cout_reel, (select sum((x->>'qty')::numeric*(x->>'pu')::numeric) from jsonb_array_elements(consommations) x) matiere from public.ordres_fabrication where id=${order.of_id}`;
  assert.equal(Number(valuation[0].cout_reel),Number(valuation[0].matiere)+9);
  // Même sur son propre lot, un labo partiellement affecté est bloqué tant
  // que le graphe de traçabilité n'est pas filtré par site de bout en bout.
  denied(await lab.rpc('rappel_lot',{p_lot_id:finished.lot_id}), 'acces a tous les sites');
  await sql`insert into equipe_sites(utilisateur_id,site_id) values (${ids[1]},${newSite.id})`;
  const recall = ok(await lab.rpc('rappel_lot',{p_lot_id:finished.lot_id}), 'Rappel labo avec tous les sites attribués');
  assert.ok(recall.lot); assert.ok(!JSON.stringify(recall).includes('total_ht'));

  const sale = ok(await seller.rpc('vendre_article',{p_article_id:product,p_site_id:site,p_qte:1,p_ticket:'VENTE-1'}), 'Vente vendeur');
  assert.ok(sale);
  const salesView = ok(await lab.from('labo_ventes_quantites').select('*'), 'Ventes expurgées');
  assert.equal(salesView.length,1); assert.equal('total_ttc' in salesView[0],false);
  assert.equal('pu' in salesView[0].lignes[0],false);
  denied(await lab.rpc('vendre_panier',{p_site_id:site,p_lignes:[],p_ticket:'X',p_mode_paiement:'especes'}), 'Reserve au comptoir');
  assert.ok((await lab.rpc('patisgest_terminer_of_interne',{p_of_id:ids[0],p_qte:1,p_numero_lot:'X',p_dlc:'2099-01-01'})).error);
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'planning',p_actif:false}), 'Désactiver planning');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'transferts',p_actif:false}), 'Désactiver transferts');
  denied(await lab.rpc('traiter_demandes_reassort',args),'Module desactive');
  assert.equal(ok(await lab.from('labo_ventes_quantites').select('*'), 'Planning désactivé').length,0);
  const anon = client();
  assert.ok((await anon.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:true})).error);
  const forged = await fetch(`${API_URL}/rest/v1/articles`,{headers:{apikey:ANON_KEY,Authorization:'Bearer invalid.jwt.signature'}});
  assert.equal(forged.status,401);

  // Gestion d'un membre existant : vérification en utilisant le JWT vendeur
  // obtenu au début du test, sans reconnexion après changement/révocation.
  const assignment={p_utilisateur_id:ids[2],p_sites:[newSite.id],p_modules:['caisse','planning']};
  denied(await other.rpc('equipe_modifier_affectations',assignment),'Compte introuvable');
  denied(await lab.rpc('equipe_modifier_affectations',assignment),'Reserve au proprietaire');
  denied(await owner.rpc('equipe_modifier_affectations',{...assignment,p_utilisateur_id:ids[0]}),'Compte introuvable');
  assert.ok((await anon.rpc('equipe_modifier_affectations',assignment)).error);
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_sites:[site]})).error,'Vendeur uniquement en boutique');
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_sites:[newSite.id,newSite.id]})).error);
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_modules:['caisse','inconnu']})).error);
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_modules:['caisse','caisse']})).error);
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site),'Affectation inchangée après erreurs').length,1);
  ok(await owner.rpc('equipe_modifier_affectations',assignment),'Modifier sites et modules atomiquement');
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site),'Ancien site retiré').length,0);
  assert.equal(ok(await seller.from('sites').select('id').eq('id',newSite.id),'Nouveau site attribué').length,1);
  denied(await seller.rpc('vendre_article',{p_article_id:product,p_site_id:site,p_qte:1,p_ticket:'V-REFUSE'}),'Site non autorise');
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Caisse autorisée'),true);
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'production'}),'Production désactivée'),false);
  assert.ok((await owner.from('equipe_journal_acces').select('*')).error,'Journal non accessible directement');
  ok(await owner.rpc('equipe_inviter',{p_email:emails[2],p_nom:'Vendeur',p_role:'vendeur',p_sites:[newSite.id]}),'Invitation antérieure');
  assert.equal(ok(await seller.rpc('equipe_mes_invitations'),'Invitation antérieure visible').length,1);
  denied(await other.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Compte introuvable');
  denied(await seller.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Reserve au proprietaire');
  denied(await owner.rpc('equipe_revoquer',{p_utilisateur_id:ids[0]}),'Compte introuvable');
  ok(await owner.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Révoquer membre');
  assert.ok(ok(await seller.auth.getUser(),'Compte Auth reste authentifié').user);
  assert.equal(ok(await seller.from('clients').select('id'),'Client inaccessible après révocation').length,0);
  assert.equal(ok(await seller.from('sites').select('id'),'Sites inaccessibles après révocation').length,0);
  assert.equal(ok(await seller.from('ventes').select('id'),'Ventes inaccessibles après révocation').length,0);
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Module révoqué'),false);
  assert.equal(ok(await seller.rpc('equipe_mes_invitations'),'Ancienne invitation annulée').length,0);
  denied(await seller.rpc('vendre_article',{p_article_id:product,p_site_id:newSite.id,p_qte:1,p_ticket:'V-REVOQUE'}),'Module desactive');
  assert.equal((await sql`select count(*)::int n from equipe_journal_acces where utilisateur_id=${ids[2]}`)[0].n,2);
  denied(await owner.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Compte introuvable');

  // Next réel + Auth réelle, jamais la production : une session périmée est
  // renouvelée par le proxy et son cookie permet ensuite d'ouvrir une page.
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const app=spawn(path.join(root,'node_modules','.bin','next'),['dev','-p','3414','-H','127.0.0.1'],{
    cwd:root,env:{...process.env,VERCEL_ENV:'',PATISGEST_DEMO_MODE:'false',NEXT_PUBLIC_SUPABASE_URL:API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:ANON_KEY},stdio:['ignore','pipe','pipe']
  });
  let logs=''; app.stdout.on('data',s=>{logs=(logs+s).slice(-2000)}); app.stderr.on('data',s=>{logs=(logs+s).slice(-2000)});
  try {
   let ready=false;
   for(let i=0;i<120;i++) {
    if(app.exitCode!==null) throw new Error(`Next arrêté : ${logs}`);
    try {if((await fetch('http://127.0.0.1:3414/connexion')).status===200){ready=true;break;}} catch {}
    await sleep(500);
   }
   assert.ok(ready,'Next ne démarre pas');
   const fresh=client();
   const session=ok(await fresh.auth.signInWithPassword({email:emails[0],password}),'Session HTTP fictive').session;
   assert.ok(session?.refresh_token);
   const cookieName=`sb-${new URL(API_URL).hostname.split('.')[0]}-auth-token`;
   const expired={...session,expires_at:1};
   const cookie=`${cookieName}=base64-${Buffer.from(JSON.stringify(expired)).toString('base64url')}`;
   const refreshed=await fetch('http://127.0.0.1:3414/connexion',{headers:{cookie},redirect:'manual'});
   assert.equal(refreshed.status,200);
   const setCookies=refreshed.headers.getSetCookie().filter(c=>c.startsWith(`${cookieName}=`)||c.startsWith(`${cookieName}.`));
   assert.ok(setCookies.length,'Le proxy doit renouveler le cookie Supabase');
   const renewed=setCookies.map(c=>c.split(';')[0]).join('; ');
   const dashboard=await fetch('http://127.0.0.1:3414/tableau-de-bord',{headers:{cookie:renewed},redirect:'manual'});
   assert.equal(dashboard.status,200,'La session renouvelée ouvre le tableau de bord');
  } finally {app.kill('SIGTERM');}
 } finally {
  await sql.end();
 }
});
