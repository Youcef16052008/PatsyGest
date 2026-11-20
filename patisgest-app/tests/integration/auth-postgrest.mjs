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
import { SMTPServer } from 'smtp-server';
import { parse } from 'parse5';

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
  assert.ok(new RegExp(message, 'i').test(result.error.message), `Refus inattendu : attendu « ${message} », reçu « ${result.error.message} »`);
};
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const site = 'dddddddd-dddd-dddd-dddd-dddddddddddd', article = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ids = ['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444'];

// Les formulaires HTML sont soumis sans JavaScript, comme un navigateur avec
// progressive enhancement. Les marqueurs Next sont repris depuis le HTML.
function trouverFormulaire(html, predicate) {
  const forms=[];
  function visit(node) { if (node.tagName==='form') forms.push(node); for (const child of node.childNodes??[]) visit(child); }
  visit(parse(html));
  for(const form of forms) {
    const fields=[];
    function collect(node) {
      if (node.tagName==='input' || node.tagName==='select') {
        const a=Object.fromEntries((node.attrs??[]).map(x=>[x.name,x.value]));
        if (a.name) fields.push(a);
      }
      for(const child of node.childNodes??[]) collect(child);
    }
    collect(form);
    if(predicate(fields)) return fields;
  }
  throw new Error('Formulaire attendu introuvable');
}
async function soumettreFormulaire(path,cookie,fields,values) {
  const body=new FormData();
  for(const f of fields) if(f.type==='hidden') body.append(f.name,f.value??'');
  for(const [key,value] of Object.entries(values)) {
    body.delete(key); for(const item of Array.isArray(value)?value:[value]) body.append(key,item);
  }
  return fetch(`http://127.0.0.1:3414${path}`,{method:'POST',headers:{cookie,origin:'http://127.0.0.1:3414'},body,redirect:'manual'});
}

test('Auth et PostgREST réels : isolation, confidentialité et modules', { timeout: 240000 }, async () => {
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
    if (file.startsWith('24-') && process.env.PATSYGEST_TEST_VITRINE === 'yes') {
      const fixtures=new URL('../fixtures/pilote-vitrine/',import.meta.url);
      for (const name of (await readdir(fixtures)).filter(n=>/^\d\d-.*\.sql$/.test(n)).sort()) {
        try {await sql.unsafe(await readFile(new URL(name,fixtures),'utf8'));}
        catch(e) {throw new Error(`Vitrine ${name}: ${e.message}`,{cause:e});}
      }
    }
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
  await sql`insert into sites(id,client_id,nom,type) values (${site},${A},'Boutique 1','boutique')`;
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
  if (process.env.PATSYGEST_TEST_VITRINE === 'yes') {
    // Les RPC vitrine sont absentes de la reconstruction historique. La vraie
    // RPC de traitement contourne la RLS ; tester explicitement son garde 48.
    const visible='aaaaaaaa-0000-0000-0000-000000000071',hidden='aaaaaaaa-0000-0000-0000-000000000072';
    await sql`insert into cakes(id,client_id,numero,client_nom,date_event,nb_parts,site_id,statut,origine) values
      (${visible},${A},'VIT-TEST1','Client fictif',current_date,1,${site},'demande','vitrine'),
      (${hidden},${A},'VIT-TEST2','Client fictif',current_date,1,${newSite.id},'demande','vitrine')`;
    denied(await seller.rpc('patisgest_traiter_demande',{p_id:hidden,p_decision:'accepter'}),'Site non autorise');
    denied(await other.rpc('patisgest_traiter_demande',{p_id:visible,p_decision:'accepter'}),'Devis hors perimetre');
    assert.ok((await client().rpc('patisgest_traiter_demande',{p_id:visible,p_decision:'accepter'})).error,'Traitement non accessible à anon');
    assert.ok((await seller.rpc('patisgest_traiter_demande_interne',{p_id:hidden,p_decision:'accepter'})).error,'Interne inaccessible');
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'cake-design',p_actif:false}),'Désactiver module vendeur vitrine');
    denied(await seller.rpc('patisgest_traiter_demande',{p_id:visible,p_decision:'accepter'}),'Module desactive');
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'cake-design',p_actif:true}),'Réactiver module vendeur vitrine');
    assert.equal(ok(await seller.rpc('patisgest_traiter_demande',{p_id:visible,p_decision:'accepter'}),'Traitement site attribué').statut,'devis');
    assert.equal((await sql`select statut from cakes where id=${hidden}`)[0].statut,'demande');
    await sql`delete from cakes where id in (${visible},${hidden})`;
    const familyA='aaaaaaaa-0000-0000-0000-000000000081',familyB='bbbbbbbb-0000-0000-0000-000000000081';
    await sql`insert into recette_familles(id,client_id,code,nom) values (${familyA},${A},'VIT-TEST-A','Fictif A'),(${familyB},${B},'VIT-TEST-B','Fictif B')`;
    assert.ok((await owner.from('vitrine_photos').insert({client_id:A,famille_id:familyB,chemin:'foreign.jpg'})).error,'Photo vers famille étrangère refusée');
    const photo=ok(await owner.from('vitrine_photos').insert({client_id:A,famille_id:familyA,chemin:'photo.jpg'}).select('id').single(),'Photo du même tenant');
    assert.ok((await owner.from('vitrine_photos').update({famille_id:familyB}).eq('id',photo.id).select()).error,'Modification vers famille étrangère refusée');
    const fiche={p_famille_id:familyA,p_visible:true,p_nom_vitrine:'Fictif',p_description:null,p_photo:null,p_ordre:100};
    denied(await seller.rpc('patisgest_enregistrer_fiche_vitrine',fiche),'Role non autorise');
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[0],p_module:'recettes',p_actif:false}),'Désactiver recettes propriétaire');
    denied(await owner.rpc('patisgest_enregistrer_fiche_vitrine',fiche),'Module desactive');
    denied(await owner.rpc('patisgest_supprimer_recette',{p_famille_id:familyA}),'Module desactive');
    assert.ok((await owner.from('vitrine_photos').insert({client_id:A,famille_id:familyA,chemin:'blocked.jpg'})).error,'Photo bloquée sans module recettes');
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[0],p_module:'recettes',p_actif:true}),'Réactiver recettes propriétaire');
    assert.equal(ok(await owner.rpc('patisgest_enregistrer_fiche_vitrine',fiche),'Fiche autorisée').visible,true);
    assert.ok((await owner.rpc('patisgest_enregistrer_fiche_vitrine_interne',fiche)).error,'Fiche interne inaccessible');
    await sql`delete from vitrine_photos where id=${photo.id}`;
    await sql`delete from recette_familles where id in (${familyA},${familyB})`;
  }
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
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site), 'Boutique attribuée vendeur').length,1);
  // L'affectation existante ne doit pas autoriser le vendeur si un site est
  // requalifié en laboratoire après attribution : même JWT, aucune reconnexion.
  ok(await owner.from('sites').update({type:'laboratoire'}).eq('id',site).select('id').single(), 'Requalifier temporairement le site');
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site), 'Laboratoire masqué au vendeur').length,0);
  assert.equal(ok(await lab.from('sites').select('id').eq('id',site), 'Site attribué reste visible au labo').length,1);
  assert.equal(ok(await owner.from('sites').select('id').eq('id',site), 'Site reste visible au propriétaire').length,1);
  denied(await seller.rpc('vendre_article',{p_article_id:article,p_site_id:site,p_qte:1,p_ticket:'LAB-NON'}),'Site non autorise');
  ok(await owner.from('sites').update({type:'boutique'}).eq('id',site).select('id').single(), 'Restaurer le type boutique');
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site), 'Boutique rétablie visible').length,1);
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
  const ownDemands=ok(await pending.rpc('equipe_mes_demandes'),'Demandes de la personne');
  assert.equal(ownDemands.length,1); assert.equal(ownDemands[0].id,demands[0].id); assert.equal(ownDemands[0].statut,'en_attente');
  assert.equal(ok(await lab.rpc('equipe_mes_demandes'),'Demandes autre identité').length,0);
  assert.ok((await client().rpc('equipe_mes_demandes')).error,'Demandes personnelles interdites à anon');
  assert.equal(ok(await other.rpc('equipe_lister_demandes'), 'Demandes autre établissement').length,0);
  assert.ok((await pending.from('equipe_demandes').select('*')).error);
  denied(await other.rpc('equipe_refuser_demande',{p_id:demands[0].id}), 'Demande introuvable');
  denied(await other.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Demande introuvable');
  denied(await lab.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Reserve au proprietaire');
  await sql`update sites set type='laboratoire' where id=${site}`;
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[site]}), 'Sites invalides');
  await sql`update sites set type='boutique' where id=${site}`;
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id,newSite.id]}), 'Sites invalides');
  const pendingId=ok(await pending.auth.getUser(),'Identité Auth fictive').user.id;
  await sql`update auth.users set email='autre-adresse@example.test' where id=${pendingId}`;
  assert.equal(ok(await pending.rpc('equipe_mes_demandes'),'Adresse changée masque les demandes').length,0);
  denied(await owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}), 'Demande devenue invalide');
  await sql`update auth.users set email='non-approuve@example.test' where id=${pendingId}`;
  const approvalRace=await Promise.all([owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]}),owner.rpc('equipe_approuver_demande',{p_id:demands[0].id,p_sites:[newSite.id]})]);
  assert.equal(approvalRace.filter(x=>!x.error).length,1,'Une seule approbation concurrente réussit');
  const approved=ok(await owner.rpc('equipe_lister_approbations'), 'Approbations propriétaire');
  assert.equal(approved.length,1); assert.deepEqual(approved[0].sites,[newSite.id]);
  assert.equal(ok(await pending.rpc('equipe_mes_demandes'),'Approbation de la personne')[0].statut,'approuvee');
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
  await sql`update sites set type='laboratoire' where id=${site}`;
  assert.ok((await owner.rpc('equipe_inviter',{p_email:'non-approuve@example.test',p_nom:'Personne',p_role:'vendeur',p_sites:[site]})).error, 'Un vendeur ne peut être affecté à un laboratoire');
  await sql`update sites set type='boutique' where id=${site}`;
  ok(await owner.rpc('equipe_inviter',{p_email:'non-approuve@example.test',p_nom:'Personne',p_role:'vendeur',p_sites:[newSite.id]}), 'Invitation propriétaire');
  const invites = ok(await pending.rpc('equipe_mes_invitations'), 'Invitation pour adresse vérifiée');
  assert.equal(invites.length,1); assert.equal(invites[0].role,'vendeur');
  const ownerInvites = ok(await owner.rpc('equipe_lister_invitations'), 'Liste des invitations propriétaire');
  assert.equal(ownerInvites.length,1); assert.equal(ownerInvites[0].id,invites[0].id);
  assert.equal(ownerInvites[0].email,'non-approuve@example.test'); assert.deepEqual(ownerInvites[0].sites,[newSite.id]);
  assert.equal(ok(await other.rpc('equipe_lister_invitations'),'Invitations autre établissement').length,0);
  denied(await lab.rpc('equipe_lister_invitations'),'Reserve au proprietaire');
  denied(await seller.rpc('equipe_lister_invitations'),'Reserve au proprietaire');
  denied(await pending.rpc('equipe_lister_invitations'),'Reserve au proprietaire');
  assert.ok((await client().rpc('equipe_lister_invitations')).error,'Invitations inaccessibles à anon');
  denied(await pending.rpc('equipe_accepter_invitation',{p_id:invites[0].id}), 'Admission indisponible');
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
  assert.equal(ok(await seller.from('lots').select('id,pu').eq('id',lot), 'Coût du lot masqué au vendeur').length,0);
  assert.equal(ok(await seller.from('mouvements').select('id,pu').eq('lot_id',lot), 'Coût du mouvement masqué au vendeur').length,0);
  const sellerLot=ok(await seller.from('vendeur_lots').select('*').eq('id',lot).single(), 'Quantités vendeur sans coût');
  assert.equal(Number(sellerLot.qte_rest),5); assert.equal('pu' in sellerLot,false);
  assert.ok((await seller.from('vendeur_lots').select('pu')).error,'La vue ne fournit pas de colonne de prix d’achat');
  assert.equal(ok(await seller.from('vendeur_lots').select('id').eq('site_id',newSite.id),'Lots hors site masqués').length,0);
  assert.equal(ok(await lab.from('vendeur_lots').select('id'),'Vue vendeur inaccessible au labo').length,0);
  assert.equal(ok(await other.from('vendeur_lots').select('id'),'Vue vendeur inaccessible autre client').length,0);
  assert.ok((await client().from('vendeur_lots').select('id')).error,'Vue vendeur inaccessible à anon');
  assert.equal(ok(await owner.from('lots').select('pu').eq('id',lot).single(),'Prix d’achat propriétaire').pu,12);
  for (const mod of ['stocks','caisse','planning','qualite','tracabilite'])
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:mod,p_actif:false}),`Désactiver ${mod} vendeur`);
  assert.equal(ok(await seller.from('vendeur_lots').select('id'),'Vue vendeur sans module pertinent').length,0);
  for (const mod of ['stocks','caisse','planning','qualite','tracabilite'])
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:mod,p_actif:true}),`Réactiver ${mod} vendeur`);

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
  await sql`update ordres_fabrication set snapshot=jsonb_set(snapshot,'{secret_financier}',to_jsonb(9999),true) where id=${order.of_id}`;
  assert.equal(ok(await seller.from('ordres_fabrication').select('id,cout_reel,consommations').eq('id',order.of_id),'OF brut masqué au vendeur').length,0);
  const safeSellerOrder=ok(await seller.from('vendeur_ordres_fabrication').select('*').eq('id',order.of_id).single(),'OF expurgé vendeur');
  assert.equal('cout_reel' in safeSellerOrder,false); assert.equal('consommations' in safeSellerOrder,false);
  assert.equal('secret_financier' in safeSellerOrder.snapshot,false); assert.equal(safeSellerOrder.snapshot.recette,'Recette');
  assert.ok((await seller.from('vendeur_ordres_fabrication').select('cout_reel')).error,'Aucun coût dans la vue vendeur');
  assert.equal(ok(await seller.from('vendeur_ordres_fabrication').select('id').eq('id',otherOrder.of_id),'OF d’autre site masqué').length,0);
  assert.equal(ok(await lab.from('vendeur_ordres_fabrication').select('id'),'Vue OF réservée au vendeur').length,0);
  assert.ok((await client().from('vendeur_ordres_fabrication').select('id')).error,'Vue OF inaccessible à anon');
  for (const mod of ['production','planning','cake-design'])
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:mod,p_actif:false}),`Désactiver ${mod} vendeur`);
  assert.equal(ok(await seller.from('vendeur_ordres_fabrication').select('id'),'Vue OF sans module pertinent').length,0);
  for (const mod of ['production','planning','cake-design'])
    ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:mod,p_actif:true}),`Réactiver ${mod} vendeur`);
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
  assert.equal(recall.sections_masquees.ventes,true);

  const sale = ok(await seller.rpc('vendre_article',{p_article_id:product,p_site_id:site,p_qte:1,p_ticket:'VENTE-1'}), 'Vente vendeur');
  assert.ok(sale);
  const soldLot = (await sql`select lot_id from mouvements where client_id=${A} and ref='VENTE-1' and type='vente' limit 1`)[0].lot_id;
  await sql`insert into equipe_sites(utilisateur_id,site_id) values (${ids[2]},${newSite.id})`;
  const ownerRecall = ok(await owner.rpc('rappel_lot',{p_lot_id:soldLot}), 'Rappel complet propriétaire');
  assert.ok(ownerRecall.ventes.some(v=>v.ticket==='VENTE-1' && v.total_ht != null));
  const sellerRecall = ok(await seller.rpc('rappel_lot',{p_lot_id:soldLot}), 'Rappel vendeur avec caisse');
  assert.ok(sellerRecall.ventes.some(v=>v.ticket==='VENTE-1' && v.total_ht != null));
  assert.equal(sellerRecall.sections_masquees.ventes,false);
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'caisse',p_actif:false}), 'Désactiver caisse vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'production',p_actif:false}), 'Désactiver production vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'planning',p_actif:false}), 'Désactiver planning vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'transferts',p_actif:false}), 'Désactiver transferts vendeur');
  const limitedRecall = ok(await seller.rpc('rappel_lot',{p_lot_id:soldLot}), 'Rappel vendeur sans modules');
  assert.deepEqual(limitedRecall.sections_masquees,{ventes:true,ordres:true,transferts:true});
  assert.deepEqual(limitedRecall.ventes,[]); assert.deepEqual(limitedRecall.ventes_descendants,[]);
  assert.deepEqual(limitedRecall.of_consigneurs,[]); assert.equal(limitedRecall.of_producteur,null);
  assert.deepEqual(limitedRecall.transferts,[]);
  assert.ok(!JSON.stringify(limitedRecall).includes('VENTE-1'));
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'tracabilite',p_actif:false}), 'Désactiver traçabilité vendeur');
  denied(await seller.rpc('rappel_lot',{p_lot_id:soldLot}),'Module desactive');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'tracabilite',p_actif:true}), 'Réactiver traçabilité vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'caisse',p_actif:true}), 'Réactiver caisse vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'production',p_actif:true}), 'Réactiver production vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'planning',p_actif:true}), 'Réactiver planning vendeur');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'transferts',p_actif:true}), 'Réactiver transferts vendeur');
  const labRecallAfterSale = ok(await lab.rpc('rappel_lot',{p_lot_id:soldLot}), 'Rappel labo sans ventes');
  assert.equal(labRecallAfterSale.sections_masquees.ventes,true);
  assert.deepEqual(labRecallAfterSale.ventes,[]); assert.ok(!JSON.stringify(labRecallAfterSale).includes('VENTE-1'));
  denied(await other.rpc('rappel_lot',{p_lot_id:soldLot}), 'Site non autorise');
  assert.ok((await client().rpc('rappel_lot',{p_lot_id:soldLot})).error,'Rappel anonyme interdit');
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
  const members=ok(await owner.rpc('equipe_lister_membres'),'Liste des membres propriétaire');
  assert.equal(members.length,2); const sellerMember=members.find(m=>m.id===ids[2]);
  assert.ok(sellerMember); assert.ok(sellerMember.sites.includes(newSite.id));
  assert.equal(ok(await other.rpc('equipe_lister_membres'),'Isolation membres autre client').length,0);
  denied(await lab.rpc('equipe_lister_membres'),'Reserve au proprietaire');
  denied(await seller.rpc('equipe_lister_membres'),'Reserve au proprietaire');
  assert.ok((await anon.rpc('equipe_lister_membres')).error);
  denied(await other.rpc('equipe_modifier_affectations_versionnees',{...assignment,p_revision:sellerMember.revision}),'Compte introuvable');
  denied(await lab.rpc('equipe_modifier_affectations_versionnees',{...assignment,p_revision:sellerMember.revision}),'Reserve au proprietaire');
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'qualite',p_actif:false}),'Modification concurrente module');
  const staleEdit=await owner.rpc('equipe_modifier_affectations_versionnees',{...assignment,p_revision:sellerMember.revision});
  denied(staleEdit,'Affectations modifiees');
  assert.equal(staleEdit.error.code,'P0001','Un formulaire périmé ne remplace pas les nouveaux modules');
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'qualite'}),'Modification concurrente préservée'),false);
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[2],p_module:'qualite',p_actif:true}),'Restaurer qualité');
  assert.ok((await seller.rpc('patisgest_modifier_affectations_interne',assignment)).error,'Fonction interne inaccessible');
  denied(await other.rpc('equipe_modifier_affectations',assignment),'Compte introuvable');
  denied(await lab.rpc('equipe_modifier_affectations',assignment),'Reserve au proprietaire');
  denied(await owner.rpc('equipe_modifier_affectations',{...assignment,p_utilisateur_id:ids[0]}),'Compte introuvable');
  assert.ok((await anon.rpc('equipe_modifier_affectations',assignment)).error);
  await sql`update sites set type='laboratoire' where id=${site}`;
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_sites:[site]})).error,'Vendeur uniquement en boutique');
  await sql`update sites set type='boutique' where id=${site}`;
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_sites:[newSite.id,newSite.id]})).error);
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_modules:['caisse','inconnu']})).error);
  assert.ok((await owner.rpc('equipe_modifier_affectations',{...assignment,p_modules:['caisse','caisse']})).error);
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site),'Affectation inchangée après erreurs').length,1);
  ok(await owner.rpc('equipe_modifier_affectations',assignment),'Modifier sites et modules atomiquement');
  const versionAfterAssignment=ok(await owner.rpc('equipe_lister_membres'),'Révision après modification').find(m=>m.id===ids[2]).revision;
  const raceArgs={...assignment,p_revision:versionAfterAssignment};
  const edits=await Promise.all([owner.rpc('equipe_modifier_affectations_versionnees',raceArgs),owner.rpc('equipe_modifier_affectations_versionnees',raceArgs)]);
  assert.equal(edits.filter(e=>!e.error).length,1,'Une seule modification concurrente de même révision réussit');
  assert.equal(edits.find(e=>e.error)?.error.code,'P0001');
  assert.match(edits.find(e=>e.error).error.message,/Affectations modifiees/);
  const versionAfterRace=ok(await owner.rpc('equipe_lister_membres'),'Révision après concurrence').find(m=>m.id===ids[2]).revision;
  assert.notEqual(versionAfterRace,versionAfterAssignment);
  denied(await owner.rpc('equipe_revoquer_versionne',{p_utilisateur_id:ids[2],p_revision:versionAfterAssignment}),'Affectations modifiees');
  assert.equal(ok(await seller.from('sites').select('id').eq('id',site),'Ancien site retiré').length,0);
  assert.equal(ok(await seller.from('sites').select('id').eq('id',newSite.id),'Nouveau site attribué').length,1);
  denied(await seller.rpc('vendre_article',{p_article_id:product,p_site_id:site,p_qte:1,p_ticket:'V-REFUSE'}),'Site non autorise');
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Caisse autorisée'),true);
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'production'}),'Production désactivée'),false);
  assert.ok((await owner.from('equipe_journal_acces').select('*')).error,'Journal non accessible directement');
  const oldInvite=ok(await owner.rpc('equipe_inviter',{p_email:emails[2],p_nom:'Vendeur',p_role:'vendeur',p_sites:[newSite.id]}),'Invitation antérieure');
  assert.equal(ok(await seller.rpc('equipe_mes_invitations'),'Invitation antérieure visible').length,1);
  // L'adresse Auth a changé sans mise à jour de utilisateurs.email. La
  // révocation doit invalider aussi une ancienne invitation sur cette adresse.
  const changedEmail='vendeur-nouvelle-adresse@example.test';
  const futureEmail='vendeur-future-adresse@example.test';
  const futureInvite=ok(await owner.rpc('equipe_inviter',{p_email:futureEmail,p_nom:'Vendeur',p_role:'vendeur',p_sites:[newSite.id]}),'Invitation antérieure sur une troisième adresse');
  await sql`update auth.users set email=${changedEmail} where id=${authIds[2]}`;
  const changedInvite=ok(await owner.rpc('equipe_inviter',{p_email:changedEmail,p_nom:'Vendeur',p_role:'vendeur',p_sites:[newSite.id]}),'Invitation adresse Auth courante');
  assert.equal(ok(await seller.rpc('equipe_mes_invitations'),'Invitation nouvelle adresse visible')[0].id,changedInvite);
  denied(await other.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Compte introuvable');
  denied(await seller.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Reserve au proprietaire');
  denied(await owner.rpc('equipe_revoquer',{p_utilisateur_id:ids[0]}),'Compte introuvable');
  denied(await lab.rpc('equipe_revoquer_versionne',{p_utilisateur_id:ids[2],p_revision:versionAfterRace}),'Reserve au proprietaire');
  denied(await other.rpc('equipe_revoquer_versionne',{p_utilisateur_id:ids[2],p_revision:versionAfterRace}),'Compte introuvable');
  ok(await owner.rpc('equipe_revoquer_versionne',{p_utilisateur_id:ids[2],p_revision:versionAfterRace}),'Révoquer membre');
  assert.ok(ok(await seller.auth.getUser(),'Compte Auth reste authentifié').user);
  assert.equal(ok(await seller.from('clients').select('id'),'Client inaccessible après révocation').length,0);
  assert.equal(ok(await seller.from('sites').select('id'),'Sites inaccessibles après révocation').length,0);
  assert.equal(ok(await seller.from('ventes').select('id'),'Ventes inaccessibles après révocation').length,0);
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Module révoqué'),false);
  assert.equal(ok(await seller.rpc('equipe_mes_invitations'),'Ancienne invitation annulée').length,0);
  const revokedInvites=await sql`select id,annulee from equipe_invitations where id in (${oldInvite},${changedInvite})`;
  assert.equal(revokedInvites.length,2); assert.ok(revokedInvites.every(i=>i.annulee),'Ancienne et nouvelle adresse neutralisées');
  denied(await seller.rpc('vendre_article',{p_article_id:product,p_site_id:newSite.id,p_qte:1,p_ticket:'V-REVOQUE'}),'Site non autorise');
  assert.equal((await sql`select count(*)::int n from equipe_journal_acces where utilisateur_id=${ids[2]}`)[0].n,3);
  denied(await owner.rpc('equipe_revoquer',{p_utilisateur_id:ids[2]}),'Compte introuvable');
  assert.ok((await seller.from('equipe_revocations').select('*')).error,'Historique de sécurité privé');
  assert.ok((await seller.rpc('patisgest_equipe_exiger_decision_recente',{p_client:A,p_cree_le:'2099-01-01'})).error,'Contrôle interne non exposé');
  // Un changement d'adresse après révocation ne rend pas une invitation
  // antérieure valide, même si celle-ci n'était pas liée à l'ancienne adresse.
  await sql`update auth.users set email=${futureEmail} where id=${authIds[2]}`;
  assert.equal(ok(await seller.rpc('equipe_mes_invitations'),'Ancienne invitation sur troisième adresse masquée').length,0);
  await sql`update public.equipe_admission_securite set autorisee=true where cle`;
  denied(await seller.rpc('equipe_accepter_invitation',{p_id:futureInvite}),'Admission indisponible');
  assert.equal(ok(await seller.from('clients').select('id'),'Pas de réadmission sur ancienne invitation').length,0);
  const newInvite=ok(await owner.rpc('equipe_inviter',{p_email:futureEmail,p_nom:'Vendeur',p_role:'vendeur',p_sites:[newSite.id]}),'Nouvelle décision explicite après révocation');
  const readmitted=ok(await seller.rpc('equipe_accepter_invitation',{p_id:newInvite}),'Réadmission sur nouvelle invitation');
  assert.equal(ok(await seller.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Modules désactivés à la réadmission'),false);
  ok(await owner.rpc('equipe_revoquer',{p_utilisateur_id:readmitted}),'Révoquer la réadmission fictive');
  await sql`update public.equipe_admission_securite set autorisee=false where cle`;

  // Admission : la bascule n'est ouverte que par SQL privilégié dans cette
  // pile jetable, jamais par une RPC ou un membre. Tous les modules restent
  // désactivés jusqu'à une attribution explicite du propriétaire.
  const candidate=client(), candidateEmail='candidate@example.test';
  const createdCandidate=ok(await admin.auth.admin.createUser({email:candidateEmail,password,email_confirm:true,user_metadata:{role:'proprietaire',client_id:B}}),'Compte candidat Auth');
  ok(await candidate.auth.signInWithPassword({email:candidateEmail,password}),'Connexion candidat');
  ok(await candidate.rpc('equipe_demander',{p_code:newCode,p_nom:'Candidat',p_role:'labo'}),'Demande candidat');
  const candidateDemand=ok(await owner.rpc('equipe_lister_demandes'),'Demandes candidat').find(d=>d.email===candidateEmail);
  assert.ok(candidateDemand);
  ok(await owner.rpc('equipe_approuver_demande',{p_id:candidateDemand.id,p_sites:[site]}),'Approbation candidat');
  denied(await candidate.rpc('equipe_accepter_demande',{p_id:candidateDemand.id}),'Admission indisponible');
  assert.ok((await owner.from('equipe_admission_securite').update({autorisee:true}).eq('cle',true)).error,'Le propriétaire ne peut pas ouvrir la bascule');
  assert.ok((await owner.rpc('patisgest_equipe_creer_membre',{p_client:A,p_auth:createdCandidate.user.id,p_email:candidateEmail,p_nom:'Test',p_role:'proprietaire',p_sites:[site],p_source:'demande'})).error,'Helper interne inaccessible');
  await sql`update public.equipe_admission_securite set autorisee=true where cle`;
  denied(await other.rpc('equipe_accepter_demande',{p_id:candidateDemand.id}),'Demande indisponible');
  await sql`update auth.users set email='adresse-modifiee@example.test' where id=${createdCandidate.user.id}`;
  denied(await candidate.rpc('equipe_accepter_demande',{p_id:candidateDemand.id}),'Demande indisponible');
  await sql`update auth.users set email=${candidateEmail} where id=${createdCandidate.user.id}`;
  const demandRace=await Promise.all([candidate.rpc('equipe_accepter_demande',{p_id:candidateDemand.id}),candidate.rpc('equipe_accepter_demande',{p_id:candidateDemand.id})]);
  assert.equal(demandRace.filter(x=>!x.error).length,1,'Une seule admission de demande');
  const candidateMember=demandRace.find(x=>!x.error).data;
  assert.equal(ok(await candidate.from('clients').select('id'),'Adhésion candidat')[0].id,A);
  assert.equal(ok(await candidate.from('utilisateurs').select('role'),'Rôle demandé non issu des métadonnées')[0].role,'labo');
  assert.equal(ok(await candidate.rpc('patisgest_module_autorise',{p_module:'stocks'}),'Modules désactivés à l’admission'),false);
  denied(await candidate.rpc('equipe_accepter_demande',{p_id:candidateDemand.id}),'Demande indisponible');
  ok(await owner.rpc('equipe_modifier_affectations',{p_utilisateur_id:candidateMember,p_sites:[site],p_modules:['stocks']}),'Attribution explicite des modules');
  assert.equal(ok(await candidate.rpc('patisgest_module_autorise',{p_module:'stocks'}),'Module explicitement attribué'),true);

  const inviterArgs={p_email:'non-approuve@example.test',p_nom:'Personne',p_role:'vendeur',p_sites:[newSite.id]};
  const firstInvite=invites[0].id;
  denied(await other.rpc('equipe_annuler_invitation',{p_id:firstInvite}),'Invitation indisponible');
  denied(await lab.rpc('equipe_annuler_invitation',{p_id:firstInvite}),'Reserve au proprietaire');
  ok(await pending.rpc('equipe_refuser_invitation',{p_id:firstInvite}),'Refus par destinataire vérifié');
  assert.ok(!ok(await owner.rpc('equipe_lister_invitations'),'Invitation refusée masquée').some(i=>i.id===firstInvite));
  const cancelled=ok(await owner.rpc('equipe_inviter',inviterArgs),'Invitation annulable');
  ok(await owner.rpc('equipe_annuler_invitation',{p_id:cancelled}),'Annulation propriétaire');
  assert.ok(!ok(await owner.rpc('equipe_lister_invitations'),'Invitation annulée masquée').some(i=>i.id===cancelled));
  const invitation=ok(await owner.rpc('equipe_inviter',inviterArgs),'Nouvelle invitation');
  denied(await other.rpc('equipe_accepter_invitation',{p_id:invitation}),'Invitation indisponible');
  await sql`update equipe_invitations set expire_le='2000-01-01' where id=${invitation}`;
  denied(await pending.rpc('equipe_accepter_invitation',{p_id:invitation}),'Invitation indisponible');
  await sql`update equipe_invitations set expire_le='2099-01-01' where id=${invitation}`;
  await sql`update auth.users set email_confirmed_at=null where id=${pendingId}`;
  denied(await pending.rpc('equipe_accepter_invitation',{p_id:invitation}),'Invitation indisponible');
  await sql`update auth.users set email_confirmed_at=now() where id=${pendingId}`;
  await sql`update sites set type='laboratoire' where id=${newSite.id}`;
  denied(await pending.rpc('equipe_accepter_invitation',{p_id:invitation}),'Sites invalides');
  assert.equal(ok(await pending.from('clients').select('id'),'Aucune adhésion après échec').length,0);
  await sql`update sites set type='boutique' where id=${newSite.id}`;
  const invitationRace=await Promise.all([pending.rpc('equipe_accepter_invitation',{p_id:invitation}),pending.rpc('equipe_accepter_invitation',{p_id:invitation})]);
  assert.equal(invitationRace.filter(x=>!x.error).length,1,'Une seule admission par invitation');
  const pendingMember=invitationRace.find(x=>!x.error).data;
  assert.equal(ok(await pending.from('utilisateurs').select('role'),'Rôle de l’invitation')[0].role,'vendeur');
  assert.equal(ok(await pending.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Caisse désactivée par défaut'),false);
  assert.equal(ok(await pending.from('sites').select('id'),'Site boutique affecté')[0].id,newSite.id);
  ok(await owner.rpc('equipe_modifier_affectations',{p_utilisateur_id:pendingMember,p_sites:[newSite.id],p_modules:['caisse']}),'Attribution vendeur');
  assert.equal(ok(await pending.rpc('patisgest_module_autorise',{p_module:'caisse'}),'Caisse autorisée explicitement'),true);
  denied(await pending.rpc('equipe_accepter_invitation',{p_id:invitation}),'Invitation indisponible');
  await sql`update public.equipe_admission_securite set autorisee=false where cle`;

  // Restauration JSON PARTIELLE dans un troisième tenant fictif. Auth, membres,
  // droits et révocations sont volontairement hors fichier : ce test ne prouve
  // pas une sauvegarde complète ni un retour arrière de la base pilote.
  const C='cccccccc-cccc-cccc-cccc-cccccccccccc';
  const restoreSite='cccccccc-0000-0000-0000-000000000001';
  const restoreArticle='cccccccc-0000-0000-0000-000000000002';
  const restoreLot='cccccccc-0000-0000-0000-000000000003';
  const restoreMove='cccccccc-0000-0000-0000-000000000004';
  const foreignSite='bbbbbbbb-0000-0000-0000-000000000001';
  const restoreUser=ok(await admin.auth.admin.createUser({email:'restore@example.test',password,email_confirm:true}),'Compte fictif restauration').user;
  const restoreOwner=client(); ok(await restoreOwner.auth.signInWithPassword({email:'restore@example.test',password}),'Session restauration');
  await sql`insert into clients(id,nom) values (${C},'Restauration fictive')`;
  const restoreMember=(await sql`insert into utilisateurs(client_id,auth_user_id,email,nom,role) values (${C},${restoreUser.id},'restore@example.test','Propriétaire','proprietaire') returning id`)[0].id;
  await sql`insert into sites(id,client_id,nom,type) values (${restoreSite},${C},'Boutique','boutique'),(${foreignSite},${B},'Site étranger','boutique')`;
  await sql`insert into articles(id,client_id,code,nom,niveau,unite) values (${restoreArticle},${C},'REST','Farine','matiere','kg')`;
  await sql`insert into lots(id,client_id,site_id,article_id,numero,qte_init,qte_rest,pu) values (${restoreLot},${C},${restoreSite},${restoreArticle},'R1',4,3,12)`;
  await sql`insert into mouvements(id,client_id,site_id,article_id,lot_id,type,qte,pu) values (${restoreMove},${C},${restoreSite},${restoreArticle},${restoreLot},'reception',4,12)`;
  const saved={};
  for (const table of ['sites','articles','lots','mouvements']) {
    saved[table]=(await sql.unsafe(`select to_jsonb(t) as row from public.${table} t where client_id=$1 order by id`,[C])).map(r=>r.row);
  }
  const dump={client_id:C,tables:Object.entries(saved).map(([table,lignes])=>({table,lignes}))};
  await sql`delete from mouvements where client_id=${C}`; await sql`delete from lots where client_id=${C}`;
  await sql`delete from articles where client_id=${C}`; await sql`delete from sites where client_id=${C}`;
  denied(await lab.rpc('restaurer_sauvegarde',{p_dump:dump}),'restauration reservee|Reserve au proprietaire');
  assert.ok((await client().rpc('restaurer_sauvegarde',{p_dump:dump})).error,'Restauration interdite à anon');
  denied(await owner.rpc('restaurer_sauvegarde',{p_dump:dump}),'autre etablissement');
  assert.ok((await restoreOwner.rpc('patisgest_restaurer_sauvegarde_interne',{p_dump:dump})).error,'Ancienne restauration interne inaccessible');
  assert.ok((await restoreOwner.rpc('patisgest_restaurer_garde_interne',{p_dump:dump})).error,'Restauration interne de la garde inaccessible');
  const restored=ok(await restoreOwner.rpc('restaurer_sauvegarde',{p_dump:dump}),'Restaurer les données fictives');
  assert.equal(restored.insere.sites,1); assert.equal(restored.insere.articles,1); assert.equal(restored.insere.lots,1); assert.equal(restored.insere.mouvements,1);
  for (const table of Object.keys(saved)) {
    const actual=(await sql.unsafe(`select to_jsonb(t) as row from public.${table} t where client_id=$1 order by id`,[C])).map(r=>r.row);
    assert.deepEqual(actual,saved[table],`Aller-retour partiel ${table}`);
  }
  const newArticle={...saved.articles[0],id:'cccccccc-0000-0000-0000-000000000005',code:'REST-2'};
  const collision={client_id:C,tables:[{table:'sites',lignes:saved.sites},{table:'articles',lignes:[newArticle]}]};
  denied(await restoreOwner.rpc('restaurer_sauvegarde',{p_dump:collision}),'Conflit de restauration');
  assert.equal((await sql`select count(*)::int n from articles where id=${newArticle.id}`)[0].n,0,'Collision : aucune insertion partielle');
  const foreignLot={...saved.lots[0],id:'cccccccc-0000-0000-0000-000000000006',site_id:foreignSite};
  denied(await restoreOwner.rpc('restaurer_sauvegarde',{p_dump:{client_id:C,tables:[{table:'lots',lignes:[foreignLot]}]}}),'Lien inter-etablissement');
  assert.equal((await sql`select count(*)::int n from lots where id=${foreignLot.id}`)[0].n,0,'Lien étranger annulé');
  ok(await restoreOwner.rpc('modifier_acces_module',{p_utilisateur_id:restoreMember,p_module:'stocks',p_actif:false}),'Désactiver module restauration');
  denied(await restoreOwner.rpc('restaurer_sauvegarde',{p_dump:dump}),'modules desactives');
  ok(await restoreOwner.rpc('modifier_acces_module',{p_utilisateur_id:restoreMember,p_module:'stocks',p_actif:true}),'Réactiver module restauration');

  // Next réel + Auth réelle, jamais la production : une session périmée est
  // renouvelée par le proxy et son cookie permet ensuite d'ouvrir une page.
  const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
  const courriels=[];
  const smtp=new SMTPServer({authOptional:true,disabledCommands:['AUTH','STARTTLS'],onData(stream,session,done){
    let body=''; stream.on('data',chunk=>body+=chunk); stream.on('end',()=>{courriels.push({body,recipients:session.envelope.rcptTo.map(x=>x.address)});done();});
  }});
  await new Promise((resolve,reject)=>smtp.once('error',reject).listen(54325,'127.0.0.1',resolve));
  let smtpOuvert=true;
  const app=spawn(path.join(root,'node_modules','.bin','next'),['dev','-p','3414','-H','127.0.0.1'],{
    cwd:root,env:{...process.env,VERCEL_ENV:'',PATISGEST_DEMO_MODE:'false',PATSYGEST_EQUIPE_EXPERIMENTAL:'true',PATSYGEST_TEST_INVITATION_EMAIL:'true',NEXT_PUBLIC_SUPABASE_URL:API_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY:ANON_KEY},stdio:['ignore','pipe','pipe']
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
   const settings=await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:renewed},redirect:'manual'});
   assert.equal(settings.status,200,'Paramètres propriétaire accessibles');
   const settingsHtml=await settings.text();
   assert.ok(settingsHtml.includes('Équipe · expérimental'),'Interface expérimentale visible sur pile locale');
   assert.ok(settingsHtml.includes('Aucun e-mail réel n’est envoyé'),'Aucun envoi de courrier réel annoncé');
   assert.ok(settingsHtml.includes('Membres existants') && settingsHtml.includes('Enregistrer les affectations'),'Interface des membres disponible au propriétaire');
   assert.ok(settingsHtml.includes('Révoquer l’adhésion'),'Interface de révocation disponible au propriétaire');
   const labSession=ok(await client().auth.signInWithPassword({email:emails[1],password}),'Session HTTP labo').session;
   const labCookie=`${cookieName}=base64-${Buffer.from(JSON.stringify(labSession)).toString('base64url')}`;
   const labSettings=await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:labCookie},redirect:'manual'});
   assert.equal(labSettings.status,200);
   assert.ok(!(await labSettings.text()).includes('Équipe · expérimental'),'Interface propriétaire cachée au labo');
   const applicantEmail='ui-candidat@example.test';
   ok(await admin.auth.admin.createUser({email:applicantEmail,password,email_confirm:true}),'Compte fictif sans adhésion pour interface');
   const applicantSession=ok(await client().auth.signInWithPassword({email:applicantEmail,password}),'Session HTTP candidat').session;
   const applicantCookie=`${cookieName}=base64-${Buffer.from(JSON.stringify(applicantSession)).toString('base64url')}`;
   const joining=await fetch('http://127.0.0.1:3414/rejoindre',{headers:{cookie:applicantCookie},redirect:'manual'});
   assert.equal(joining.status,200,'Page candidat authentifié');
   const joiningHtml=await joining.text();
   assert.ok(joiningHtml.includes('Vos demandes') && joiningHtml.includes('Vos invitations'));

   // Soumission HTTP des formulaires réels avec sessions Auth et SMTP fictif.
   const requestForm=trouverFormulaire(joiningHtml,f=>f.some(x=>x.name==='code') && f.some(x=>x.name==='role'));
   const requestResponse=await soumettreFormulaire('/rejoindre',applicantCookie,requestForm,{code:newCode,nom:'Candidat formulaire',role:'vendeur'});
   assert.equal(requestResponse.status,200); assert.match(await requestResponse.text(),/Demande transmise/);
   const demandesUi=ok(await owner.rpc('equipe_lister_demandes'),'Demande depuis formulaire');
   const demandeUi=demandesUi.find(d=>d.email===applicantEmail); assert.ok(demandeUi);
   let ownerHtml=await (await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:renewed}})).text();
   const approveForm=trouverFormulaire(ownerHtml,f=>f.some(x=>x.name==='id' && x.value===demandeUi.id) && f.some(x=>x.name==='decision' && x.value==='approuver'));
   const forbiddenApproval=await soumettreFormulaire('/parametres',labCookie,approveForm,{sites:newSite.id});
   assert.equal(forbiddenApproval.status,200); assert.match(await forbiddenApproval.text(),/réservée au propriétaire/);
   const invalidApproval=await soumettreFormulaire('/parametres',renewed,approveForm,{});
   assert.equal(invalidApproval.status,200); assert.match(await invalidApproval.text(),/Choisissez au moins un site valide/);
   const approvedUi=await soumettreFormulaire('/parametres',renewed,approveForm,{sites:newSite.id});
   assert.equal(approvedUi.status,200); assert.match(await approvedUi.text(),/Demande approuvée/);
   assert.ok(ok(await owner.rpc('equipe_lister_approbations'),'Approbation via formulaire').some(d=>d.id===demandeUi.id));
   let candidateHtml=await (await fetch('http://127.0.0.1:3414/rejoindre',{headers:{cookie:applicantCookie}})).text();
   const acceptDemand=trouverFormulaire(candidateHtml,f=>f.some(x=>x.name==='id' && x.value===demandeUi.id) && f.some(x=>x.name==='choix' && x.value==='accepter_demande'));
   const lockedDemand=await soumettreFormulaire('/rejoindre',applicantCookie,acceptDemand,{});
   assert.equal(lockedDemand.status,200); assert.match(await lockedDemand.text(),/admission peut être verrouillée/i);
   ownerHtml=await (await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:renewed}})).text();
   const cancelApproval=trouverFormulaire(ownerHtml,f=>f.some(x=>x.name==='id' && x.value===demandeUi.id) && f.some(x=>x.name==='decision' && x.value==='annuler'));
   const cancelledApproval=await soumettreFormulaire('/parametres',renewed,cancelApproval,{});
   assert.equal(cancelledApproval.status,200); assert.match(await cancelledApproval.text(),/Décision enregistrée/);

   // Réponse à une invitation sur l'identité Auth vérifiée, sans ouverture du verrou.
   const applicantInvite=ok(await owner.rpc('equipe_inviter',{p_email:applicantEmail,p_nom:'Candidat formulaire',p_role:'vendeur',p_sites:[newSite.id]}),'Invitation candidate pour formulaire');
   candidateHtml=await (await fetch('http://127.0.0.1:3414/rejoindre',{headers:{cookie:applicantCookie}})).text();
   const acceptInvite=trouverFormulaire(candidateHtml,f=>f.some(x=>x.name==='id' && x.value===applicantInvite) && f.some(x=>x.name==='choix' && x.value==='accepter_invitation'));
   const lockedInvite=await soumettreFormulaire('/rejoindre',applicantCookie,acceptInvite,{});
   assert.equal(lockedInvite.status,200); assert.match(await lockedInvite.text(),/admission peut être verrouillée/i);
   const declineInvite=trouverFormulaire(candidateHtml,f=>f.some(x=>x.name==='id' && x.value===applicantInvite) && f.some(x=>x.name==='choix' && x.value==='refuser_invitation'));
   const declinedInvite=await soumettreFormulaire('/rejoindre',applicantCookie,declineInvite,{});
   assert.equal(declinedInvite.status,200); assert.match(await declinedInvite.text(),/Invitation refusée/);
   assert.ok(!ok(await owner.rpc('equipe_lister_invitations'),'Invitation refusée via formulaire').some(i=>i.id===applicantInvite));

   const inviteForm=trouverFormulaire(settingsHtml,f=>f.some(x=>x.name==='email') && f.some(x=>x.name==='role'));
   const forbiddenInvite=await soumettreFormulaire('/parametres',labCookie,inviteForm,{nom:'Interdit',email:'interdit@example.test',role:'vendeur',sites:newSite.id});
   assert.equal(forbiddenInvite.status,200); assert.match(await forbiddenInvite.text(),/réservée au propriétaire/);
   assert.equal(courriels.length,0);
   const inviteResponse=await soumettreFormulaire('/parametres',renewed,inviteForm,{nom:'Invitation formulaire',email:'formulaire@example.test',role:'vendeur',sites:newSite.id});
   assert.equal(inviteResponse.status,200); assert.match(await inviteResponse.text(),/Invitation enregistrée/);
   assert.equal(courriels.length,1); assert.deepEqual(courriels[0].recipients,['formulaire@example.test']);
   const invitationsUi=ok(await owner.rpc('equipe_lister_invitations'),'Invitation depuis formulaire');
   const inviteUi=invitationsUi.find(i=>i.email==='formulaire@example.test'); assert.ok(inviteUi);
   const updatedHtml=await (await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:renewed}})).text();
   const resendForm=trouverFormulaire(updatedHtml,f=>f.some(x=>x.name==='id' && x.value===inviteUi.id) && !f.some(x=>x.name==='confirmer'));
   const resendResponse=await soumettreFormulaire('/parametres',renewed,resendForm,{});
   assert.equal(resendResponse.status,200); assert.match(await resendResponse.text(),/Notification acceptée/);
   assert.equal(courriels.length,2);
   const cancelForm=trouverFormulaire(updatedHtml,f=>f.some(x=>x.name==='id' && x.value===inviteUi.id) && f.some(x=>x.name==='confirmer'));
   const cancelResponse=await soumettreFormulaire('/parametres',renewed,cancelForm,{confirmer:'oui'});
   assert.equal(cancelResponse.status,200); assert.match(await cancelResponse.text(),/Invitation annulée/);
   const revokedResponse=await soumettreFormulaire('/parametres',renewed,resendForm,{});
   assert.equal(revokedResponse.status,200); assert.match(await revokedResponse.text(),/Invitation indisponible/);
   assert.equal(courriels.length,2,'Une invitation annulée ne doit pas être renvoyée');

   // Formulaire d'affectation versionné et révocation sur une session déjà émise.
   ownerHtml=await (await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:renewed}})).text();
   const memberForm=trouverFormulaire(ownerHtml,f=>f.some(x=>x.name==='id' && x.value===candidateMember) && f.some(x=>x.name==='modules'));
   const updatedMember=await soumettreFormulaire('/parametres',renewed,memberForm,{sites:site,modules:['stocks','production']});
   assert.equal(updatedMember.status,200); assert.match(await updatedMember.text(),/Affectations enregistrées/);
   assert.equal(ok(await candidate.rpc('patisgest_module_autorise',{p_module:'production'}),'Affectation via formulaire'),true);
   const staleMember=await soumettreFormulaire('/parametres',renewed,memberForm,{sites:site,modules:['stocks']});
   assert.equal(staleMember.status,200); assert.match(await staleMember.text(),/Les accès ont changé/);
   ownerHtml=await (await fetch('http://127.0.0.1:3414/parametres',{headers:{cookie:renewed}})).text();
   const revokeMember=trouverFormulaire(ownerHtml,f=>f.some(x=>x.name==='id' && x.value===candidateMember) && f.some(x=>x.name==='confirmer') && f.some(x=>x.name==='revision'));
   const revokedMember=await soumettreFormulaire('/parametres',renewed,revokeMember,{confirmer:'oui'});
   assert.equal(revokedMember.status,200); assert.match(await revokedMember.text(),/Adhésion retirée/);
   assert.equal(ok(await candidate.from('sites').select('id'),'Session émise après révocation par formulaire').length,0);
   assert.equal(ok(await candidate.rpc('patisgest_module_autorise',{p_module:'stocks'}),'Module après révocation'),false);

   await new Promise(resolve=>smtp.close(resolve)); smtpOuvert=false;
   const failedMail=await soumettreFormulaire('/parametres',renewed,inviteForm,{nom:'Test panne courrier',email:'panne@example.test',role:'vendeur',sites:newSite.id});
   assert.equal(failedMail.status,200); const failedMailHtml=await failedMail.text();
   assert.match(failedMailHtml,/Invitation enregistrée/); assert.match(failedMailHtml,/Envoi non confirmé/);
   assert.ok(ok(await owner.rpc('equipe_lister_invitations'),'Invitation conservée après panne SMTP').some(i=>i.email==='panne@example.test'));

   const anonymousJoining=await fetch('http://127.0.0.1:3414/rejoindre',{redirect:'manual'});
   assert.equal(anonymousJoining.status,307,'Compte Auth requis');
   const memberJoining=await fetch('http://127.0.0.1:3414/rejoindre',{headers:{cookie:renewed},redirect:'manual'});
   assert.equal(memberJoining.status,307,'Un membre est redirigé vers son espace');
  } finally {app.kill('SIGTERM'); if(smtpOuvert) await new Promise(resolve=>smtp.close(resolve));}
 } finally {
  await sql.end();
 }
});
