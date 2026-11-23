// MOD-06 / US-06.4 — retours et avoirs (motif, remise en stock OU destruction tracée).
//
// Le CDC exige que le vendeur puisse reprendre un produit vendu et choisir
// explicitement entre deux devenirs : remise en stock commercialisable, ou
// destruction consignée (tracée, avec motif). Un avoir qui ne tranche pas ce
// point est une faille sanitaire : on ne remet pas en vente ce qui a été
// détruit, et on ne détruit pas silencieusement ce qu'on remet en vente.
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
const SITE = 'dddddddd-dddd-dddd-dddd-dddddddddd01';
const ARTICLE = 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1';
const USER = '11111111-1111-1111-1111-111111111111';
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

/** Jeu d'essai explicite : la fixture pilote n'est pas dans la chaîne. */
async function tenant(db) {
  await db.exec(`
    insert into public.clients(id, nom) values ('${CLIENT}', 'Pâtisserie test');
    insert into public.sites(id, client_id, nom, type) values ('${SITE}', '${CLIENT}', 'Boutique', 'boutique');
    insert into public.articles(id, client_id, code, nom, niveau, unite, pv_ht, tva)
      values ('${ARTICLE}', '${CLIENT}', 'GATEAU', 'Gâteau', 'produit', 'piece', 1000, 19);
    insert into public.utilisateurs(id, client_id, auth_user_id, email, role)
      values ('${USER}', '${CLIENT}', '${AUTH}', 'vendeur@test.dz', 'vendeur');
  `);
}

/** Exécute en tant qu'utilisateur applicatif réel (sinon PGlite est superuser). */
async function commeVendeur(db, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role authenticated; select set_config('test.uid','${AUTH}',true)`);
    return await fn();
  } finally {
    await db.exec('commit');
  }
}

/** Une vente réelle de 3 pièces, avec un lot en stock. */
async function vendre(db, qte = 3) {
  await db.exec(`
    insert into public.lots(id, client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception)
      values ('ffffffff-ffff-ffff-ffff-ffffffffff01', '${CLIENT}', '${ARTICLE}', '${SITE}', 'LOT-1', 10, 10, 300, current_date);
  `);
  return commeVendeur(db, async () => {
    const r = await db.query(
      `select public.vendre_article('${ARTICLE}','${SITE}',$1,'T-1') as res`, [qte]);
    return r.rows[0].res;
  });
}

test('US-06.4 : la vente de référence déduit bien le stock', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 3);
  const lot = await db.query(`select qte_rest from public.lots where numero='LOT-1'`);
  assert.equal(Number(lot.rows[0].qte_rest), 7, 'contrôle de départ : 10 − 3');
  assert.equal(vente.duplicate, false);
  await db.close();
});

test('US-06.4 : un avoir avec remise en stock remet la marchandise en vente', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 3);
  const res = await commeVendeur(db, async () => {
    const r = await db.query(
      `select public.enregistrer_avoir($1, $2, 'Client a changé d’avis', $3) as res`,
      [vente.sale_id, 'remise_en_stock', 2],
    );
    return r.rows[0].res;
  });
  assert.equal(res.mode, 'remise_en_stock');
  assert.equal(Number(res.qte), 2);
  const lot = await db.query(`select qte_rest from public.lots where numero='LOT-1'`);
  assert.equal(Number(lot.rows[0].qte_rest), 9, '7 + 2 remis en stock');
  await db.close();
});

test('US-06.4 : un avoir en destruction ne remet rien en vente', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 3);
  await commeVendeur(db, async () => {
    await db.query(
      `select public.enregistrer_avoir($1, $2, 'Produit tombé par terre', $3)`,
      [vente.sale_id, 'destruction', 1],
    );
  });
  const lot = await db.query(`select qte_rest from public.lots where numero='LOT-1'`);
  assert.equal(Number(lot.rows[0].qte_rest), 7, 'la destruction ne recrée pas de stock');
  await db.close();
});

test('US-06.4 : la destruction est tracée comme un mouvement, pas comme un stock', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 3);
  await commeVendeur(db, async () => {
    await db.query(`select public.enregistrer_avoir($1,'destruction','Casse',$2)`, [vente.sale_id, 1]);
  });
  const mvts = await db.query(`select type, qte, motif from public.mouvements where type like 'avoir%' order by type`);
  const types = mvts.rows.map((r) => r.type).sort();
  assert.deepEqual(types, ['avoir_destruction'], `mouvements créés : ${JSON.stringify(types)}`);
  assert.equal(Number(mvts.rows[0].qte), -1, 'une destruction sort du stock à hauteur du retour');
  await db.close();
});

test('US-06.4 : on ne peut pas rendre plus que ce qui a été vendu', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 2);
  await assert.rejects(
    commeVendeur(db, async () => {
      await db.query(`select public.enregistrer_avoir($1,'remise_en_stock','Trop',$2)`, [vente.sale_id, 5]);
    }),
    /quantit|d.passe|dépasse|sup.rieure/i,
  );
  await db.close();
});

test('US-06.4 : les avoirs successifs ne peuvent pas dépasser la vente cumulée', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 3);
  await commeVendeur(db, async () => {
    await db.query(`select public.enregistrer_avoir($1,'remise_en_stock','Premier',$2)`, [vente.sale_id, 2]);
  });
  await assert.rejects(
    commeVendeur(db, async () => {
      await db.query(`select public.enregistrer_avoir($1,'remise_en_stock','Second',$2)`, [vente.sale_id, 2]);
    }),
    /quantit|d.passe|dépasse|sup.rieure/i,
    '3 vendus, 2 déjà rendus : 2 de plus est impossible',
  );
  await db.close();
});

test('US-06.4 : un motif est obligatoire', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 1);
  await assert.rejects(
    commeVendeur(db, async () => {
      await db.query(`select public.enregistrer_avoir($1,'remise_en_stock','   ',$2)`, [vente.sale_id, 1]);
    }),
    /motif/i,
  );
  await db.close();
});

test('US-06.4 : un mode inconnu est refusé (pas de troisième voie implicite)', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 1);
  await assert.rejects(
    commeVendeur(db, async () => {
      await db.query(`select public.enregistrer_avoir($1,'peut_etre','Motif',$2)`, [vente.sale_id, 1]);
    }),
    /mode/i,
  );
  await db.close();
});

test('US-06.4 : un avoir d’un autre tenant est impossible', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 1);
  const AUTRE = '33333333-3333-3333-3333-333333333333';
  const AUTRE_AUTH = '44444444-4444-4444-4444-444444444444';
  await db.exec(`
    insert into public.clients(id, nom) values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Autre');
    insert into public.utilisateurs(id, client_id, auth_user_id, email, role)
      values ('${AUTRE}', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '${AUTRE_AUTH}', 'x@y.dz', 'proprietaire');
  `);
  await assert.rejects(
    (async () => {
      await db.exec('begin');
      try {
        await db.exec(`set local role authenticated; select set_config('test.uid','${AUTRE_AUTH}',true)`);
        await db.query(`select public.enregistrer_avoir($1,'remise_en_stock','Voisin',$2)`, [vente.sale_id, 1]);
      } finally { await db.exec('commit'); }
    })(),
    /introuvable|perimetre|périmètre/i,
  );
  await db.close();
});

test('US-06.4 : l’avoir est journalisé par la migration 40, sans code dédié', async () => {
  const db = await base();
  await tenant(db);
  const vente = await vendre(db, 2);
  await commeVendeur(db, async () => {
    await db.query(`select public.enregistrer_avoir($1,'destruction','Casse',$2)`, [vente.sale_id, 1]);
  });
  const j = await db.query(`select action, table_cible from public.journal_audit where table_cible='avoirs'`);
  assert.ok(j.rows.length >= 1, 'la création d’un avoir doit laisser une trace d’audit');
  await db.close();
});

test('US-06.4 : la fonction n’est pas exécutable par anon', async () => {
  const db = await base();
  const r = await db.query(
    `select has_function_privilege('anon','public.enregistrer_avoir(uuid,text,text,numeric)','execute') as v`);
  assert.equal(r.rows[0].v, false);
  await db.close();
});
