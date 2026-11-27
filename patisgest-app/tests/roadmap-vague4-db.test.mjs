import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { creerChaineActive } from './support/chaine-active.mjs';
import { PACK_PATISSERIE_DZ } from '../src/lib/pack-patisserie-dz.ts';

/*
 * VAGUE 4 — preuves SQL sur la chaîne PGlite 01→57.
 *
 * PGlite n'est PAS Supabase hébergé : auth.uid(), rls_auto_enable(), creer_of et
 * clotures.revision sont explicitement stubbés dans `chaine-active.mjs`. Les
 * tests prouvent le SQL du dépôt, les politiques RLS et l'isolement logique,
 * jamais une concurrence PostgreSQL réelle ni un déploiement pilote.
 */

const C1 = '11111111-1111-4111-8111-111111111111';
const C2 = '22222222-2222-4222-8222-222222222222';
const U1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const U2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const U3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
const A1 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1';
const A2 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2';
const A3 = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3';
const ALERTE = 'cccccccc-cccc-4ccc-8ccc-ccccccccccc1';

let etat;

async function superutilisateur(db) {
  await db.exec('reset role');
}

async function enTantQue(db, authUserId) {
  await superutilisateur(db);
  await db.query("select set_config('test.uid', $1::text, false)", [authUserId]);
  await db.exec('set role authenticated');
}

async function rpc(db, sql, params = []) {
  return (await db.query(sql, params)).rows[0].r;
}

async function compte(db, sql, params = []) {
  return Number((await db.query(sql, params)).rows[0].n);
}

before(async () => {
  etat = await creerChaineActive();
  await superutilisateur(etat.db);
  await etat.db.exec(`
    insert into auth.users (id, email) values
      ('${A1}', 'proprietaire-a@exemple.test'),
      ('${A2}', 'proprietaire-b@exemple.test'),
      ('${A3}', 'vendeur-a@exemple.test');
    insert into public.clients (id, nom) values
      ('${C1}', 'Atelier A'),
      ('${C2}', 'Atelier B');
    insert into public.utilisateurs (id, client_id, auth_user_id, email, nom, role) values
      ('${U1}', '${C1}', '${A1}', 'proprietaire-a@exemple.test', 'Patron A', 'proprietaire'),
      ('${U2}', '${C2}', '${A2}', 'proprietaire-b@exemple.test', 'Patron B', 'proprietaire'),
      ('${U3}', '${C1}', '${A3}', 'vendeur-a@exemple.test', 'Vendeur A', 'vendeur');
  `);
});

after(async () => {
  if (etat?.db) await etat.db.close();
});

test('profil langue 56 : version 57, défaut FR et contrainte stricte', async () => {
  const { db, version, fichiers } = etat;
  assert.equal(version, 57);
  assert.equal(fichiers.length, 56);
  assert.equal(fichiers.at(-1), '57-onboarding-pack-dz-rpc.sql');

  await superutilisateur(db);
  const colonne = await db.query(`select data_type, column_default, is_nullable
    from information_schema.columns
    where table_schema='public' and table_name='utilisateurs' and column_name='langue'`);
  assert.equal(colonne.rows.length, 1);
  assert.equal(colonne.rows[0].is_nullable, 'NO');
  assert.match(String(colonne.rows[0].column_default), /fr/);

  const langues = await db.query('select langue from public.utilisateurs order by email');
  assert.equal(langues.rows.every((r) => r.langue === 'fr'), true);
  await assert.rejects(
    db.exec(`update public.utilisateurs set langue='es' where id='${U1}'`),
    /utilisateurs_langue_check|check constraint/i,
  );
});

test('profil langue 56 : la RPC ne modifie que la ligne du compte authentifié', async () => {
  const { db } = etat;
  await enTantQue(db, A1);
  const ar = await rpc(db, 'select public.enregistrer_langue_utilisateur($1::text) as r', ['ar']);
  assert.equal(ar.ok, true);
  assert.equal(ar.langue, 'ar');
  assert.equal(ar.client_id, C1);
  await assert.rejects(
    rpc(db, 'select public.enregistrer_langue_utilisateur($1::text) as r', ['en']),
    /Langue invalide/,
  );

  await enTantQue(db, '');
  await assert.rejects(
    rpc(db, 'select public.enregistrer_langue_utilisateur($1::text) as r', ['ar']),
    /Non authentifie/,
  );

  await enTantQue(db, A2);
  const fr = await rpc(db, 'select public.enregistrer_langue_utilisateur($1::text) as r', ['fr']);
  assert.equal(fr.client_id, C2);
  await superutilisateur(db);
  const lignes = await db.query('select auth_user_id, langue from public.utilisateurs order by auth_user_id');
  const parAuth = Object.fromEntries(lignes.rows.map((r) => [r.auth_user_id, r.langue]));
  assert.equal(parAuth[A1], 'ar', 'le profil A ne doit pas être écrit par B');
  assert.equal(parAuth[A2], 'fr');
  assert.equal(parAuth[A3], 'fr');
});

test('migration D 57 : pack idempotent, filtré et isolé par client_id', async () => {
  const { db } = etat;
  await enTantQue(db, A1);
  const premier = await rpc(db, 'select public.importer_pack_patisserie_dz($1::text,$2::text) as r', ['mixte', 'ifu_0']);
  assert.equal(premier.ok, true);
  assert.equal(Number(premier.imported), 24);
  assert.equal(Number(premier.total), 24);
  const rejeu = await rpc(db, 'select public.importer_pack_patisserie_dz($1::text,$2::text) as r', ['mixte', 'ifu_0']);
  assert.equal(Number(rejeu.imported), 0, 'un second appel ne doit rien réinsérer');
  assert.equal(Number(rejeu.total), 24);

  await enTantQue(db, A3);
  await assert.rejects(
    rpc(db, 'select public.importer_pack_patisserie_dz($1::text,$2::text) as r', ['mixte', 'ifu_0']),
    /Reserve au proprietaire/,
  );

  await enTantQue(db, A2);
  const boulangerie = await rpc(db, 'select public.importer_pack_patisserie_dz($1::text,$2::text) as r', ['boulangerie', 'reel_dz']);
  assert.equal(Number(boulangerie.imported), 13);
  assert.equal(Number(boulangerie.total), 13);
  assert.equal(await compte(db, 'select count(*)::int as n from public.articles'), 13, 'RLS : B ne voit que ses articles');
  assert.equal(
    await compte(db, "select count(*)::int as n from public.articles where code='PF-ANN'"),
    0,
    'un article cake_shop de A ne doit jamais apparaître chez B',
  );
  const pcm = await db.query("select tva, pv_ht from public.articles where code='PF-PCM'");
  assert.equal(Number(pcm.rows[0].tva), 9);
  assert.equal(Number(pcm.rows[0].pv_ht), 45.87);

  await superutilisateur(db);
  const codesA = await db.query('select code from public.articles where client_id=$1 order by code', [C1]);
  assert.deepEqual(codesA.rows.map((r) => r.code), PACK_PATISSERIE_DZ.map((x) => x.code).sort());
  assert.equal(await compte(db, 'select count(*)::int as n from public.articles where client_id=$1', [C2]), 13);
  await assert.rejects(
    enTantQue(db, A2).then(() => rpc(db, 'select public.importer_pack_patisserie_dz($1::text,$2::text) as r', ['inconnu', 'ifu_0'])),
    /Activite invalide/,
  );
});

test('RLS A/B : recettes, crédits et alertes prix ne traversent jamais le tenant', async () => {
  const { db } = etat;
  await enTantQue(db, A1);
  await db.exec(`
    insert into public.recettes_libres (client_id, nom, ingredients)
    values ('${C1}', 'Recette A', '[]'::jsonb);
    insert into public.credits_clients (client_id, nom_debiteur, montant_total_da)
    values ('${C1}', 'Café A', 1000);
    insert into public.notifications_patron
      (client_id, type, cible_type, cible_id, nom_produit, prix_saisi_da, message)
    values ('${C1}', 'nouveau_prix_employe', 'nouveau_produit', '', 'Cake A', 100, 'Alerte A');
  `);
  assert.equal(await compte(db, 'select count(*)::int as n from public.recettes_libres'), 1);
  assert.equal(await compte(db, 'select count(*)::int as n from public.credits_clients'), 1);
  assert.equal(await compte(db, 'select count(*)::int as n from public.notifications_patron'), 1);

  await enTantQue(db, A2);
  assert.equal(await compte(db, 'select count(*)::int as n from public.recettes_libres'), 0);
  assert.equal(await compte(db, 'select count(*)::int as n from public.credits_clients'), 0);
  assert.equal(await compte(db, 'select count(*)::int as n from public.notifications_patron'), 0);
});

test('alerte prix : un employé déclenche, ne s’auto-valide pas, le patron approuve', async () => {
  const { db } = etat;
  await enTantQue(db, A3);
  await db.exec(`
    insert into public.notifications_patron
      (id, client_id, type, cible_type, cible_id, nom_produit, prix_saisi_da, auteur_id, auteur_nom, message)
    values
      ('${ALERTE}', '${C1}', 'nouveau_prix_employe', 'nouveau_produit', '', 'Cake employé', 100,
       '${A3}', 'Vendeur A', 'Prix proposé par le vendeur');
  `);
  assert.equal(
    await compte(db, 'select count(*)::int as n from public.notifications_patron where auteur_id=$1', [A3]),
    1,
    'un employé peut soumettre une alerte',
  );
  await assert.rejects(
    rpc(db, 'select public.traiter_alerte_prix_patron($1::uuid,$2::text,$3::numeric) as r', [ALERTE, 'approuve', null]),
    /Reserve au proprietaire/,
  );

  await enTantQue(db, A1);
  const approuvee = await rpc(db, 'select public.traiter_alerte_prix_patron($1::uuid,$2::text,$3::numeric) as r', [ALERTE, 'approuve', null]);
  assert.equal(approuvee.statut, 'approuve');
  assert.equal(Number(approuvee.prix_final_da), 100);
  await superutilisateur(db);
  const statut = await db.query('select traite_statut, traite_par from public.notifications_patron where id=$1', [ALERTE]);
  assert.equal(statut.rows[0].traite_statut, 'approuve');
  assert.equal(statut.rows[0].traite_par, A1);
});
