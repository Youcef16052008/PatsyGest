// Amorçage d'une pile Supabase CLI locale jetable pour les tests E2E Playwright.
//
// Applique la chaîne principale (01, 03..57) avec les mêmes garde-fous et
// adaptateurs de rejeu que les tests d'intégration isolés, crée les comptes Auth
// réels via l'API Admin GoTrue (indépendamment des colonnes internes `auth.users`),
// insère le client pilote + sites, exécute `seed.mjs` et vérifie la connexion.
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';
import { chaineDeploiement, cheminMigration } from '../migrations-historique.mjs';
import { seed } from './seed.mjs';

const { API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL, PATSYGEST_DISPOSABLE } = process.env;

function assertLocal(value, expectedPort, label) {
  assert.ok(value, `${label} manquant`);
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), `Refus (${label}) : hôte non local (${url.hostname})`);
  assert.equal(url.port, expectedPort, `Refus (${label}) : port attendu ${expectedPort}, reçu ${url.port}`);
}

assert.equal(PATSYGEST_DISPOSABLE, 'yes', 'PATSYGEST_DISPOSABLE=yes requis');
assertLocal(API_URL, '54321', 'API_URL');
assertLocal(DB_URL, '54322', 'DB_URL');
assert.ok(ANON_KEY, 'ANON_KEY manquant');
assert.ok(SERVICE_ROLE_KEY, 'SERVICE_ROLE_KEY manquant');

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const SITE_LABO = '22222222-2222-4222-8222-222222222201';
const SITE_BOUTIQUE = '22222222-2222-4222-8222-222222222202';
const PASSWORD = 'PatisGest2026!';

const PILOT_USERS = [
  {
    email: 'amina@patisserie.dz',
    nom: 'Aïcha (Propriétaire)',
    role: 'proprietaire',
    sites: [SITE_LABO, SITE_BOUTIQUE],
  },
  {
    email: 'sara@patisserie.dz',
    nom: 'Sara (Responsable Labo)',
    role: 'labo',
    sites: [SITE_LABO],
  },
  {
    email: 'amine@patisserie.dz',
    nom: 'Amine (Vendeur)',
    role: 'vendeur',
    sites: [SITE_BOUTIQUE],
  },
];

const sql = postgres(DB_URL, { max: 1, onnotice: () => {} });
const admin = createClient(API_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

try {
  const existing = await sql`select to_regclass('public.clients') as table_name`;
  assert.equal(existing[0].table_name, null, 'La base jetable doit être vierge avant bootstrap E2E');

  // Utilitaire DDL présent sur Supabase hébergé mais absent de certaines piles CLI locales,
  // et privilèges par défaut d'un projet Supabase réel avant la chaîne 01..53.
  await sql.unsafe(`
    do $$ begin
      if to_regprocedure('public.rls_auto_enable()') is null then
        create function public.rls_auto_enable() returns event_trigger language plpgsql as $f$begin end$f$;
      end if;
    end $$;
    alter default privileges in schema public grant all on tables to authenticated, service_role;
    alter default privileges in schema public grant all on sequences to authenticated, service_role;
    alter default privileges in schema public grant execute on functions to authenticated, service_role;
  `);

  for (const file of chaineDeploiement()) {
    if (file.startsWith('07-')) {
      await sql.unsafe("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    }
    if (file.startsWith('09-')) {
      await sql.unsafe('alter table public.clotures add column if not exists revision integer default 1');
    }
    const migrationSql = await readFile(new URL(`../../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8');
    try {
      await sql.unsafe(migrationSql);
    } catch (error) {
      throw new Error(`Migration ${file} : ${error.message}`, { cause: error });
    }
  }

  await sql`
    insert into public.clients (id, nom, adresse, telephone, nif, nis, rc, offre)
    values (
      ${CLIENT_ID},
      'Pâtisserie El Yasmine — Oran',
      'Rue Emir Abdelkader, Oran',
      '0550 12 34 56',
      'NIF 123456789',
      'NIS 987654321',
      'RC 31/00-123456B26',
      'pro'
    )
    on conflict (id) do nothing
  `;

  await sql`
    insert into public.sites (id, client_id, nom, type, adresse)
    values
      (${SITE_LABO}, ${CLIENT_ID}, 'Laboratoire — Oran Centre', 'laboratoire', 'Rue Emir Abdelkader, Oran'),
      (${SITE_BOUTIQUE}, ${CLIENT_ID}, 'Boutique — Front de Mer', 'boutique', 'Boulevard de l''ALN, Oran')
    on conflict (id) do nothing
  `;

  for (const user of PILOT_USERS) {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nom: user.nom },
    });
    assert.ifError(error && new Error(`Création Auth ${user.email} : ${error.message}`));
    const authUserId = data.user.id;

    const insertedUser = await sql`
      insert into public.utilisateurs (auth_user_id, client_id, email, nom, role)
      values (${authUserId}, ${CLIENT_ID}, ${user.email}, ${user.nom}, ${user.role})
      on conflict (auth_user_id) do update set nom = excluded.nom
      returning id
    `;
    const userId = insertedUser[0].id;
    for (const siteId of user.sites) {
      await sql`
        insert into public.equipe_sites (utilisateur_id, site_id)
        values (${userId}, ${siteId})
        on conflict do nothing
      `;
    }
  }

  process.env.PATSYGEST_PG_URL = DB_URL;
  assert.equal(await seed(), true, 'seed() E2E doit retourner true');

  await sql`notify pgrst, 'reload schema'`;
  for (let i = 0; i < 30; i += 1) {
    const probe = await admin.from('articles').select('id').limit(1);
    if (!probe.error) break;
    if (i === 29) {
      throw new Error(`Cache PostgREST non prêt après 30 s : ${probe.error.message}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Vérifier qu'une connexion Auth réelle et les lectures RLS de base fonctionnent avant Playwright.
  const anon = createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await anon.auth.signInWithPassword({
    email: 'amina@patisserie.dz',
    password: PASSWORD,
  });
  assert.ifError(signIn.error && new Error(`Test signInWithPassword : ${signIn.error.message}`));
  const me = await anon.from('utilisateurs').select('id, role').single();
  assert.ifError(me.error && new Error(`Lecture utilisateurs : ${me.error.message}`));
  const schemaVer = await anon.from('app_schema_version').select('version').maybeSingle();
  assert.ifError(schemaVer.error && new Error(`Lecture app_schema_version : ${schemaVer.error.message}`));
  assert.equal(schemaVer.data?.version, 58);
  const arts = await anon.from('articles').select('id').limit(1);
  assert.ifError(arts.error && new Error(`Lecture articles : ${arts.error.message}`));

  console.log('Bootstrap E2E prêt (chaîne 01..58, comptes Auth réels, seed et PostgREST vérifiés).');
} finally {
  await sql.end();
}
