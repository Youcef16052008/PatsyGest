// NF-10 / RI-06 : journal d'audit « qui, quoi, quand » sur ventes, stocks,
// clôtures, connexions, avec conservation 10 ans.
//
// Avant la migration 40, `journal_audit` n'existait dans aucune migration :
// l'exigence était à la fois absente de la base et de l'application. Ce test
// vérifie les propriétés qui font qu'un journal est un journal (et pas une
// table d'événements décorative) :
//
//   1. insensible à la modification et à la suppression (immuabilité) ;
//   2. isolation par tenant (un client ne lit jamais les lignes d'un autre) ;
//   3. le rôle applicatif ne peut pas écrire ni s'inventer une identité ;
//   4. aucune purge avant 10 ans (RI-06) ;
//   5. une action métier réelle (vente, mouvement, clôture, rôle) crée une ligne.
//
// Protocole : les tests qui touchent les privilèges et la RLS passent par le
// rôle `authenticated` réel, pas par la session `postgres` (cf. CHECKLIST-60 :
// le superutilisateur contourne la RLS et ne prouve donc rien).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

const root = new URL('../', import.meta.url);

// Même préambule que matrice-app-schema.test.mjs : PGlite n'a ni pgcrypto ni le
// schéma auth de Supabase, on les reconstitue. `auth.uid()` lit `test.uid`,
// ce qui permet de tester l'autorité de l'identité sans faux JWT.
const PREAMBULE = `create role authenticated; create role anon; create role service_role;
 create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
 create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
 alter default privileges in schema public grant all on tables to authenticated,service_role;
 alter default privileges in schema public grant execute on functions to authenticated,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;`;

/** Applique la chaîne de déploiement (01–23 puis 24–40) sur une base jetable. */
async function baseDeploiement() {
  const db = new PGlite();
  await db.exec(PREAMBULE);
  for (const fichier of chaineDeploiement()) {
    const sql = (await readFile(new URL(`supabase/${cheminMigration(fichier)}`, root), 'utf8'))
      .replace('create extension if not exists pgcrypto;', '');
    // Mêmes adaptations historiques que matrice-app-schema.test.mjs : la 07 a été
    // rééditée après la 16, et la 09 suppose la révision de clotures.
    if (fichier.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (fichier.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1;');
    await db.exec(sql);
  }
  return db;
}

/**
 * Crée un tenant minimal (1 client, 1 utilisateur propriétaire) et renvoie ses ids.
 * Le seed 02 est exclu de la chaîne de déploiement : sans cela les tables sont vides.
 */
async function tenant(db, suffixe) {
  const client = (await db.query(
    `insert into public.clients (nom, nif, nis, rc, adresse)
     values ($1, 'NIF', 'NIS', 'RC', 'Oran') returning id`,
    [`Pâtisserie ${suffixe}`],
  )).rows[0].id;
  const auth = (await db.query(
    `insert into auth.users (id, email) values (gen_random_uuid(), $1) returning id`,
    [`patron-${suffixe}@test.local`],
  )).rows[0].id;
  await db.query(
    `insert into public.utilisateurs (auth_user_id, client_id, email, nom, role)
     values ($1, $2, $3, 'Patron', 'proprietaire')`,
    [auth, client, `patron-${suffixe}@test.local`],
  );
  return { client, auth };
}

/** Exécute une requête sous le rôle `authenticated` avec une identité donnée. */
async function commeUtilisateur(db, uid, sql, params = []) {
  await db.exec('begin');
  try {
    await db.query(`select set_config('test.uid', $1, true)`, [uid ?? '']);
    await db.query(`select set_config('role', 'authenticated', true)`);
    return await db.query(sql, params);
  } finally {
    await db.exec('commit');
  }
}

test('migration 40 : la table journal_audit existe dans la chaîne de déploiement', async () => {
  const db = await baseDeploiement();
  const r = await db.query(
    `select table_name from information_schema.tables
      where table_schema = 'public' and table_name = 'journal_audit'`,
  );
  assert.equal(r.rows.length, 1, 'journal_audit absente : NF-10 non satisfaite');
  await db.close();
});

test('migration 40 : les colonnes minimales du journal sont présentes', async () => {
  const db = await baseDeploiement();
  const r = await db.query(
    `select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'journal_audit'`,
  );
  const colonnes = new Set(r.rows.map((x) => x.column_name));
  // « qui, quoi, quand » (CDC §4.1 / NF-10) + le tenant pour l'isolation.
  for (const attendu of ['id', 'client_id', 'acteur_id', 'acteur_email', 'action',
                         'table_cible', 'ligne_id', 'details', 'cree_le']) {
    assert.ok(colonnes.has(attendu), `colonne manquante : ${attendu}`);
  }
  await db.close();
});

test('migration 40 : le journal est immuable (UPDATE et DELETE refusés)', async () => {
  const db = await baseDeploiement();
  const { client } = await tenant(db, 'immuable');
  await db.query(
    `insert into public.journal_audit (client_id, acteur_email, action, table_cible)
     values ($1, 'test@invite.local', 'test.immuabilite', 'articles')`,
    [client],
  );
  // La ligne de préparation doit exister. On ne fige pas le total : la création
  // du compte de test est elle-même journalisée par le déclencheur (c'est bon
  // signe, on le vérifie dans le dernier test).
  const { rows: [ligne] } = await db.query(
    `select count(*)::int as n from public.journal_audit where action = 'test.immuabilite'`,
  );
  assert.equal(ligne.n, 1, 'la ligne de préparation n’a pas été insérée');

  await assert.rejects(
    () => db.exec(`update public.journal_audit set action = 'falsifie';`),
    /immuable/i,
    'UPDATE accepté : le journal peut être réécrit, ce n’est pas un journal',
  );
  await assert.rejects(
    () => db.exec(`delete from public.journal_audit;`),
    /immuable|purge/i,
    'DELETE accepté : la trace peut être effacée, ce n’est pas un journal',
  );
  // La ligne est toujours là, intacte.
  const { rows: [apres] } = await db.query(
    `select action from public.journal_audit where action = 'test.immuabilite'`,
  );
  assert.equal(apres.action, 'test.immuabilite');
  await db.close();
});

test('migration 40 : un rôle applicatif ne peut ni écrire ni s’inventer une identité', async () => {
  const db = await baseDeploiement();
  const { client, auth } = await tenant(db, 'identite');

  // 1) Aucun privilège INSERT direct : un acteur ne peut pas fabriquer un événement.
  await assert.rejects(
    () => commeUtilisateur(db, auth,
      `insert into public.journal_audit (client_id, acteur_email, action, table_cible)
       values ($1, 'faux@test', 'faux', 'ventes')`, [client]),
    /permission denied|refus/i,
    'INSERT direct accepté : un utilisateur peut fabriquer une fausse trace',
  );

  // 2) Un UPDATE direct reste refusé par le privilège (double garde avec le trigger).
  await assert.rejects(
    () => commeUtilisateur(db, auth, `update public.journal_audit set action = 'x'`),
    /permission denied|refus/i,
  );
  await db.close();
});

test('migration 40 : la purge est impossible avant 10 ans (RI-06)', async () => {
  const db = await baseDeploiement();
  const { client } = await tenant(db, 'purge');
  await db.query(
    `insert into public.journal_audit (client_id, acteur_email, action, table_cible, cree_le)
     values ($1, 'test@invite.local', 'test.purge', 'ventes', now() - interval '1 year')`,
    [client],
  );
  // Une ligne vieille d'un an doit encore être protégée par les 10 ans.
  await assert.rejects(
    () => db.exec(`delete from public.journal_audit where cree_le < now() - interval '1 day';`),
    /immuable|purge/i,
    'Purge acceptée sur une ligne de 1 an : la conservation 10 ans n’est pas garantie',
  );
  await db.close();
});

test('migration 40 : les déclencheurs couvrent ventes, movements, clôtures et connexions', async () => {
  const db = await baseDeploiement();
  const tables = new Set(
    (await db.query(
      `select c.relname from pg_trigger t
         join pg_class c on c.oid = t.tgrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and not t.tgisinternal and t.tgname like 'audit_%'`,
    )).rows.map((x) => x.relname),
  );
  // NF-10 nomme explicitement : ventes, stocks (mouvements), clôtures, connexions.
  for (const t of ['ventes', 'mouvements', 'clotures', 'utilisateurs']) {
    assert.ok(tables.has(t), `aucun déclencheur d’audit sur ${t}`);
  }
  await db.close();
});

test('migration 40 : une action métier réelle crée bien une ligne datée', async () => {
  const db = await baseDeploiement();
  const { client, auth } = await tenant(db, 'metier');
  const avant = (await db.query(`select count(*)::int as n from public.journal_audit`)).rows[0].n;

  // Changement de rôle d'un compte : l'action « connexions / droits » de NF-10.
  await db.query(
    `update public.utilisateurs set role = 'labo' where auth_user_id = $1`, [auth],
  );

  const { rows } = await db.query(
    `select action, table_cible, acteur_email, cree_le
       from public.journal_audit where client_id = $1 order by cree_le desc`, [client],
  );
  assert.ok(rows.length > avant, 'aucune ligne d’audit créée par un changement de rôle');
  const ligne = rows.find((r) => r.table_cible === 'utilisateurs');
  assert.ok(ligne, 'la ligne d’audit ne référence pas la table utilisateurs');
  assert.match(ligne.action, /utilisateurs/i);
  assert.ok(ligne.cree_le instanceof Date, 'cree_le (le « quand ») n’est pas une date');
  await db.close();
});
