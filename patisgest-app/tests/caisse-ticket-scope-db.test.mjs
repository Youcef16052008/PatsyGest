import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

/*
 * Migration 53 — portée du ticket d'idempotence.
 *
 * Ce test tourne sur la CHAÎNE DE DÉPLOIEMENT (01→23 puis 24→57), pas sur la
 * chaîne de répétition : le défaut corrigé ici n'existait que dans la série
 * principale, où `vendre_panier` retrouvait un ticket par
 * `(client_id, ticket)` sans `site_id` ni `source`.
 *
 * Trois scénarios mesurés sur le corps installé avant 53 :
 *   1. rejeu du ticket sur un autre site → rendait la vente de l'autre site ;
 *   2. ticket déjà pris par un IMPORT Z  → confirmé comme vente caisse ;
 *   3. rejeu avec un panier différent    → vente réelle silencieusement avalée.
 *
 * Base jetable : ne remplace ni le test de concurrence réelle ni le pilote.
 */

/** `avec52 = false` reconstruit la base telle qu'elle était avant la migration. */
async function base({ avec52 = true } = {}) {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  const plan = chaineDeploiement().filter((f) => avec52 || !f.startsWith('53-'));
  for (const file of plan) {
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8'))
      .replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
  }
  return db;
}

const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER = '11111111-1111-1111-1111-111111111111';
const AUTH = '10000000-0000-0000-0000-000000000001';
const S1 = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const S2 = 'dddddddd-dddd-dddd-dddd-dddddddddd02';
const ART = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee';

async function semer(db) {
  await db.exec(`insert into clients(id,nom) values ('${CLIENT}','Atelier');
   insert into utilisateurs(id,client_id,auth_user_id,email,nom,role)
     values ('${USER}','${CLIENT}','${AUTH}','owner@example.test','Propriétaire','proprietaire');
   insert into sites(id,client_id,nom,type) values
     ('${S1}','${CLIENT}','Boutique 1','boutique'),('${S2}','${CLIENT}','Boutique 2','boutique');
   insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva)
     values ('${ART}','${CLIENT}','A1','Gâteau','produit','piece',10,20);`);
  await db.exec(`select set_config('test.uid','${AUTH}',false); set role authenticated;`);
}

const vente = async (db, site, ticket, lignes, mode = 'especes') =>
  (await db.query('select public.vendre_panier($1,$2::jsonb,$3,$4) as r', [site, JSON.stringify(lignes), ticket, mode])).rows[0].r;

test('53 : le rejeu strict reste idempotent, les trois collisions sont refusées', async () => {
  const db = await base();
  try {
    await semer(db);

    // --- rejeu strict : même vente, jamais de double déduction de stock
    const premier = await vente(db, S1, 't-1', [{ articleId: ART, qte: 1 }]);
    assert.equal(premier.duplicate, false);
    assert.ok(premier.sale_id);
    const rejeu = await vente(db, S1, 't-1', [{ articleId: ART, qte: 1 }]);
    assert.equal(rejeu.duplicate, true);
    assert.equal(rejeu.sale_id, premier.sale_id);

    // Panier éclaté en deux lignes du même article = même contenu.
    const scinde = await vente(db, S1, 't-1', [{ articleId: ART, qte: 0.25 }, { article_id: ART, qte: 0.75 }]);
    assert.equal(scinde.duplicate, true);
    assert.equal(scinde.sale_id, premier.sale_id);

    // --- SCÉNARIO 1 : rejeu du même ticket depuis un autre site
    await assert.rejects(
      vente(db, S2, 't-1', [{ articleId: ART, qte: 1 }]),
      /Ticket deja utilise pour une autre vente/,
      'un ticket de la boutique 1 ne doit jamais rendre la vente de la boutique 1 depuis la boutique 2',
    );

    // --- SCÉNARIO 2 : ticket déjà utilisé par un import Z (autre caisse)
    await db.exec('reset role');
    await db.exec(`insert into ventes(client_id,site_id,numero,ticket,date_vente,source,total_ht,total_ttc)
      values ('${CLIENT}','${S1}','Z1','Z-77-260101-ab12',current_date,'z-import',10,12)`);
    await db.exec(`select set_config('test.uid','${AUTH}',false); set role authenticated;`);
    await assert.rejects(
      vente(db, S1, 'Z-77-260101-ab12', [{ articleId: ART, qte: 1 }]),
      /Ticket deja utilise pour une autre vente/,
      'un ticket d’import Z ne doit jamais être confirmé comme vente caisse',
    );

    // --- SCÉNARIO 3 : rejeu avec un contenu différent (onglet figé)
    await assert.rejects(
      vente(db, S1, 't-1', [{ articleId: ART, qte: 2 }]),
      /Ticket deja utilise pour une autre vente/,
      'une quantité différente est une autre vente, pas un rejeu',
    );
    await assert.rejects(
      vente(db, S1, 't-1', [{ articleId: ART, qte: 1 }], 'cheque_virement'),
      /Ticket deja utilise pour une autre vente/,
      'un mode de règlement différent est une autre vente',
    );

    // --- aucun effet fantôme
    await db.exec('reset role');
    const ventes = (await db.query('select count(*)::int as n from public.ventes')).rows[0].n;
    assert.equal(ventes, 2, 'une seule vente caisse + un import Z');
    const mouvements = (await db.query("select count(*)::int as n from public.mouvements where ref = 't-1'")).rows[0].n;
    assert.equal(mouvements, 1, 'stock déduit exactement une fois');

    // Le refus est bien un conflit d’unicité, pas une erreur générique.
    await db.exec(`select set_config('test.uid','${AUTH}',false); set role authenticated;`);
    await assert.rejects(
      db.query('select public.vendre_panier($1,$2::jsonb,$3,$4)', [S2, JSON.stringify([{ articleId: ART, qte: 1 }]), 't-1', 'especes']),
      (e) => e.code === '23505',
    );
  } finally {
    await db.close();
  }
});

test('53 : rejouable, sans DROP ni chirurgie, gardes existantes préservées', async () => {
  // Base volontairement construite SANS 53, sinon le corps serait déjà corrigé.
  const db = await base({ avec52: false });
  try {
    const lire = async () =>
      (await db.query("select pg_get_functiondef('public.vendre_panier(uuid,jsonb,text,text)'::regprocedure) as d")).rows[0].d;
    const avant = await lire();
    const migration = await readFile(new URL('../supabase/53-caisse-ticket-scope.sql', import.meta.url), 'utf8');
    await db.exec(migration);
    const apres1 = await lire();
    await db.exec(migration);
    const apres2 = await lire();

    assert.notEqual(apres1, avant, 'la migration doit réellement changer le corps');
    assert.equal(apres2, apres1, 'rejouer 53 ne doit rien modifier');

    // Gardes héritées, indispensables au reste de la chaîne.
    for (const garde of ['Reserve au comptoir.', 'patisgest_exiger_modules', "SET search_path TO ''", 'SECURITY DEFINER']) {
      assert.ok(apres2.includes(garde), `garde perdue : ${garde}`);
    }
    // Aucune dépendance à un brouillon non déployé.
    assert.equal(apres2.includes('exiger_site'), false, 'dépendance à patisgest_exiger_site (brouillon 106)');
    assert.equal(/drop\s+function/i.test(migration), false, '53 ne doit jamais supprimer de fonction');
    // Le commentaire d'en-tête cite le mot : on cherche un APPEL, pas la prose.
    assert.equal(/\bselect\s+pg_get_functiondef|\bexecute\s+pg_get_functiondef/i.test(migration), false,
      '53 ne doit pas faire de chirurgie de chaîne');
    assert.equal(/\bexecute\s+(def|corrigee|injected)/i.test(migration), false,
      '53 ne doit pas exécuter du texte de fonction réécrit');

    // 36 (dates Algiers) et 44 (retrait « carte ») restent rejouables après 53 :
    // leurs ancres de texte existent toujours à l'identique.
    await db.exec(await readFile(new URL('../supabase/36-dates-algiers.sql', import.meta.url), 'utf8'));
    await db.exec(await readFile(new URL('../supabase/44-retrait-mode-carte.sql', import.meta.url), 'utf8'));
    const final = await lire();
    assert.ok(final.includes('Ticket deja utilise pour une autre vente'), 'garde 53 perdue après rejeu de 36/44');

    // Version de schéma avancée, jamais abaissée. La chaîne contient aussi 54/55/56 :
    // rejouer 53 ne doit donc pas ramener le marqueur à 53.
    const v1 = (await db.query('select version from public.app_schema_version')).rows[0].version;
    assert.ok(v1 >= 57, `version ${v1} : rejouer 53 a abaissé une migration plus récente`);
  } finally {
    await db.close();
  }
});
