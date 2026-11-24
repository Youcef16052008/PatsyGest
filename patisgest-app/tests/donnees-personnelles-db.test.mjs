// NF-05 / loi 18-07 — droits des personnes sur leurs données.
//
// Les mentions légales promettent « un export et une suppression sur demande
// sont possibles ». Jusqu'ici, rien dans le code ne permettait de tenir cette
// promesse : c'était une phrase commerciale, pas une fonctionnalité. La loi
// 18-07 (protection des données personnelles, Algérie) impose pourtant les deux.
//
// Ce que ces tests verrouillent :
//   1. l'export d'un client contient ses données personnelles — et rien d'autre ;
//   2. l'anonymisation efface réellement les données personnelles ;
//   3. elle **préserve les obligations légales** : on ne peut pas supprimer une
//      vente (conservation 10 ans, code de commerce) ni le journal d'audit.
//      La loi 18-07 ne demande pas de détruire les écritures comptables, elle
//      demande de ne plus pouvoir identifier la personne.
//   4. l'opération est tracée ; une anonymisation silencieuse serait suspecte.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

const PREAMBULE = `
create role authenticated; create role anon; create role service_role;
create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
alter default privileges in schema public grant all on tables to authenticated,service_role;
alter default privileges in schema public grant execute on functions to authenticated,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;`;

const CLIENT = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const AUTRE = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SITE = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const PROPRIO = '11111111-1111-1111-1111-111111111111';
const AUTH = '22222222-2222-2222-2222-222222222222';

async function base() {
  const db = new PGlite();
  await db.exec(PREAMBULE);
  for (const file of chaineDeploiement()) {
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8'))
      .replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${file}: ${e.message}`, { cause: e }); }
  }
  return db;
}

async function fixture(db) {
  await db.exec(`
    insert into public.clients(id, nom, telephone) values
      ('${CLIENT}', 'Pâtisserie ELA', '041000000'),
      ('${AUTRE}', 'Autre maison', '042000000');
    insert into public.sites(id, client_id, nom, type) values ('${SITE}', '${CLIENT}', 'Boutique', 'boutique');
    insert into public.utilisateurs(id, client_id, auth_user_id, email, role)
      values ('${PROPRIO}', '${CLIENT}', '${AUTH}', 'patron@ela.dz', 'proprietaire');
    insert into public.cakes (client_id, site_id, numero, client_nom, telephone, date_event, nb_parts, prix_ht, statut)
      values ('${CLIENT}', '${SITE}', 'C-001', 'Amina Bensalem', '0661111111', current_date + 3, 20, 5000, 'confirme');
    insert into public.ventes (client_id, site_id, numero, ticket, date_vente, lignes, total_ht, total_ttc)
      values ('${CLIENT}', '${SITE}', 'V-001', 'T-001', current_date, '[]'::jsonb, 1000, 1190);
  `);
}

async function commeProprio(db, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated; select set_config('test.uid','${AUTH}',true)`);
    return await fn();
  } finally {
    await db.exec('commit');
  }
}

test('18-07 : l’export d’un client contient ses données personnelles', async () => {
  const db = await base();
  await fixture(db);
  const r = await commeProprio(db, async () => {
    const res = await db.query(`select public.exporter_donnees_personnelles() as d`);
    return res.rows[0].d;
  });
  const txt = JSON.stringify(r);
  assert.match(txt, /Amina Bensalem/, 'le nom du client final doit figurer dans l’export');
  assert.match(txt, /0661111111/, 'son téléphone aussi');
});

test('18-07 : l’export ne déborde pas sur un autre établissement', async () => {
  const db = await base();
  await fixture(db);
  // Chaque établissement a SON site : la contrainte cakes_site_tenant_fk refuse
  // (à raison) qu'un site du client A porte une commande du client B.
  await db.exec(`
    insert into public.sites(id, client_id, nom, type)
      values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '${AUTRE}', 'Boutique autre', 'boutique');
    insert into public.cakes (client_id, site_id, numero, client_nom, telephone, date_event, nb_parts, prix_ht, statut)
      values ('${AUTRE}', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', 'C-002', 'Client Voisin', '0779999999', current_date + 3, 10, 2000, 'confirme');
  `);
  const r = await commeProprio(db, async () => {
    const res = await db.query(`select public.exporter_donnees_personnelles() as d`);
    return res.rows[0].d;
  });
  assert.doesNotMatch(JSON.stringify(r), /Client Voisin/, 'fuite entre établissements');
  await db.close();
});

test('18-07 : l’anonymisation efface les données personnelles', async () => {
  const db = await base();
  await fixture(db);
  await commeProprio(db, async () => {
    await db.query(`select public.anonymiser_client($1, 'Demande du client', 'amc-001')`, ['C-001']);
  });
  const cake = (await db.query(`select client_nom, telephone from public.cakes where numero='C-001'`)).rows[0];
  assert.notEqual(cake.client_nom, 'Amina Bensalem');
  assert.notEqual(cake.telephone, '0661111111');
  assert.match(cake.client_nom, /anonym/i, 'le nom doit indiquer qu’il a été anonymisé');
  await db.close();
});

test('18-07 : la vente comptable est conservée après anonymisation', async () => {
  const db = await base();
  await fixture(db);
  await commeProprio(db, async () => {
    await db.query(`select public.anonymiser_client($1, 'Demande', 'amc-002')`, ['C-001']);
  });
  // Conservation 10 ans (code de commerce) : la vente ne peut pas disparaître.
  const v = await db.query(`select count(*)::int as n from public.ventes where numero='V-001'`);
  assert.equal(v.rows[0].n, 1, 'une écriture comptable ne s’efface pas sur demande');
  await db.close();
});

test('18-07 : le journal d’audit n’est jamais réécrit par une anonymisation', async () => {
  const db = await base();
  await fixture(db);
  const avant = (await db.query(`select count(*)::int as n from public.journal_audit`)).rows[0].n;
  await commeProprio(db, async () => {
    await db.query(`select public.anonymiser_client($1, 'Demande', 'amc-003')`, ['C-001']);
  });
  const apres = (await db.query(`select count(*)::int as n from public.journal_audit`)).rows[0].n;
  assert.ok(apres >= avant, 'l’anonymisation ne doit pas effacer l’historique d’audit');
  // Et elle doit elle-même laisser une trace.
  const trace = await db.query(
    `select count(*)::int as n from public.journal_audit where action like '%anonymis%' or details::text like '%anonymis%'`);
  assert.ok(trace.rows[0].n >= 1, 'une anonymisation non tracée est indistinguable d’une suppression de données');
  await db.close();
});

test('18-07 : seul le propriétaire peut anonymiser', async () => {
  const db = await base();
  await fixture(db);
  await db.exec(`
    insert into public.utilisateurs(id, client_id, auth_user_id, email, role)
      values ('33333333-3333-3333-3333-333333333333', '${CLIENT}', '44444444-4444-4444-4444-444444444444', 'vendeur@ela.dz', 'vendeur');
  `);
  await assert.rejects(
    (async () => {
      await db.exec('begin');
      try {
        await db.exec(`set local role authenticated; select set_config('test.uid','44444444-4444-4444-4444-444444444444',true)`);
        await db.query(`select public.anonymiser_client('C-001','Test','amc-x')`);
      } finally { await db.exec('commit'); }
    })(),
    /proprietaire|propriétaire|autoris/i,
  );
  await db.close();
});

test('18-07 : ni anon ni les rôles applicatifs ne peuvent appeler les fonctions en RPC', async () => {
  const db = await base();
  const a = await db.query(`select has_function_privilege('anon','public.anonymiser_client(text,text,text)','execute') as v`);
  assert.equal(a.rows[0].v, false);
  const b = await db.query(`select has_function_privilege('anon','public.exporter_donnees_personnelles()','execute') as v`);
  assert.equal(b.rows[0].v, false);
  await db.close();
});
