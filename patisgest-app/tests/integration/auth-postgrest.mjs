// Uniquement dans une pile Supabase CLI jetable. Ne jamais viser un projet distant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

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
const A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const site = 'dddddddd-dddd-dddd-dddd-dddddddddddd', article = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';
const ids = ['11111111-1111-1111-1111-111111111111','22222222-2222-2222-2222-222222222222','33333333-3333-3333-3333-333333333333','44444444-4444-4444-4444-444444444444'];

test('Auth et PostgREST réels : isolation, confidentialité et modules', { timeout: 180000 }, async () => {
 try {
  // Garde supplémentaire : base vierge, afin de ne jamais rejouer sur une base existante.
  const existing = await sql`select to_regclass('public.clients') as table_name`;
  assert.equal(existing[0].table_name, null, 'La base doit être vierge');
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
  assert.equal(ok(await owner.from('articles').select('id,pv_ht'), 'Articles propriétaire').length, 1);
  assert.equal(ok(await lab.from('articles').select('*'), 'Articles bruts labo').length, 0);
  assert.equal(ok(await lab.from('labo_articles').select('*'), 'Vue labo')[0].nom, 'Farine');
  assert.ok((await lab.from('labo_articles').select('pv_ht')).error, 'Prix absent de la vue');
  assert.equal(ok(await other.from('articles').select('*'), 'Isolation autre propriétaire').length, 0);
  assert.equal(ok(await other.from('labo_articles').select('*'), 'Isolation vue labo').length, 0);
  assert.equal(ok(await seller.from('clients').select('id'), 'Client vendeur')[0].id, A);
  assert.ok((await lab.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:false})).error);
  assert.ok((await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[3],p_module:'qualite',p_actif:false})).error);
  ok(await owner.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:false}), 'Désactiver qualité');
  assert.ok(ok(await lab.rpc('mes_modules_desactives'), 'Modules du labo').includes('qualite'));
  assert.ok((await lab.rpc('maj_non_conformite',{p_id:null,p_statut:'corrige',p_action:'test'})).error);
  const lot = ok(await lab.rpc('receptionner_lot',{p_article_id:article,p_site_id:site,p_numero:'LOT1',p_qte:5,p_pu:12}), 'Réception labo');
  assert.ok(lot);
  assert.equal(ok(await lab.from('labo_lots').select('qte_rest'), 'Lots labo').length, 1);
  assert.equal(ok(await lab.from('lots').select('*'), 'Lots bruts labo').length, 0);
  assert.ok((await lab.rpc('vendre_panier',{p_site_id:site,p_lignes:[],p_ticket:'X',p_mode_paiement:'especes'})).error);
  assert.ok((await lab.rpc('patisgest_terminer_of_interne',{p_of_id:ids[0],p_qte:1,p_numero_lot:'X',p_dlc:'2099-01-01'})).error);
  const anon = client();
  assert.ok((await anon.rpc('modifier_acces_module',{p_utilisateur_id:ids[1],p_module:'qualite',p_actif:true})).error);
 } finally {
  await sql.end();
 }
});
