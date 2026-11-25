import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Verrouille l'application des migrations de confidentialité par rôle.
//
// Ces sept migrations ont été appliquées au pilote le 23 novembre 2026, dans cet
// ordre précis : 104 (tables dont dépendent les autres), 101 (les vues labo),
// 105 (isolation par site), 112 (données sans site), 115/116 (vues vendeur),
// 121 (vendeur limité aux boutiques). Les appliquer dans un autre ordre échoue :
// 105 retouche les vues créées par 101, 115 et 116 appellent la fonction créée
// par 105, et 121 redéfinit cette même fonction.
//
// Ce test prouve deux choses que la suite ne pouvait pas voir avant :
//   1. les sept migrations s'appliquent ensemble, sans erreur ;
//   2. après application, le vendeur ne lit plus aucun prix d'achat.
//
// Le second point est le plus important : avant, `lots.pu` était lisible par le
// vendeur (13 lots sur 13 sur le pilote). C'était une fuite, pas un défaut
// d'affichage.

const supabase = new URL('../supabase/', import.meta.url);

const ORDRE = [
  '104-equipe-fondations',
  '101-confidentialite-labo',
  '105-sites-lecture-brouillon',
  '112-donnees-sans-site-brouillon',
  '115-confidentialite-vendeur-lots-brouillon',
  '116-confidentialite-vendeur-of-brouillon',
  '121-vendeur-sites-boutique-brouillon',
];

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLIENT = "'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'";
const U_OWN = '10000000-0000-4000-8000-000000000001';
const U_LAB = '10000000-0000-4000-8000-000000000002';
const U_VEN = '10000000-0000-4000-8000-000000000003';
const S_LAB = '20000000-0000-4000-8000-000000000001';
const S_BOUT = '20000000-0000-4000-8000-000000000002';

async function socle() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, deleted_at timestamptz);
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
    alter default privileges in schema public grant all on tables to authenticated,service_role;
    alter default privileges in schema public grant execute on functions to authenticated,service_role;
    grant execute on function auth.uid() to authenticated,anon,service_role;
    grant usage on schema auth to authenticated,anon,service_role;
    grant select on auth.users to authenticated,service_role;`);

  // Migrations 01..43, mêmes contournements que schema-complet.test.mjs :
  // PGlite n'a pas pgcrypto, et 07/09 référencent des objets créés plus tard.
  const base = (await readdir(supabase)).filter(f => /^\d\d-.*\.sql$/.test(f) && !f.startsWith('02-') && Number(f.slice(0, 2)) < 50).sort();
  for (const f of base) {
    let sql = await readFile(new URL(f, supabase), 'utf8');
    sql = sql.replace('create extension if not exists pgcrypto;', '');
    if (f.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (f.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1;');
    await db.exec(sql);
  }

  // Données représentatives du pilote : 2 sites, 3 comptes, 3 gâteaux sans site.
  await db.exec(`
    insert into clients(id,nom) values (${CLIENT},'Pâtisserie El Yasmine');
    insert into auth.users(id,email,email_confirmed_at) values
      ('${U_OWN}','amina@patisserie.dz',now()),('${U_LAB}','sara@patisserie.dz',now()),('${U_VEN}','amine@patisserie.dz',now());
    insert into utilisateurs(id,client_id,auth_user_id,email,nom,role) values
      ('${U_OWN}',${CLIENT},'${U_OWN}','amina@patisserie.dz','Amina','proprietaire'),
      ('${U_LAB}',${CLIENT},'${U_LAB}','sara@patisserie.dz','Sara','labo'),
      ('${U_VEN}',${CLIENT},'${U_VEN}','amine@patisserie.dz','Amine','vendeur');
    insert into sites(id,client_id,nom,type) values
      ('${S_LAB}',${CLIENT},'Laboratoire','laboratoire'),
      ('${S_BOUT}',${CLIENT},'Boutique','boutique');
    insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva) values
      ('30000000-0000-4000-8000-000000000001',${CLIENT},'FAR','Farine','matiere','kg',120,19),
      ('30000000-0000-4000-8000-000000000002',${CLIENT},'GAT','Gâteau','produit','pcs',900,19);
    insert into lots(id,client_id,article_id,site_id,numero,qte_init,qte_rest,pu,dlc,date_reception) values
      ('40000000-0000-4000-8000-000000000001',${CLIENT},'30000000-0000-4000-8000-000000000001','${S_LAB}','LOT-A',10,8,450,'2027-01-01',current_date),
      ('40000000-0000-4000-8000-000000000002',${CLIENT},'30000000-0000-4000-8000-000000000002','${S_BOUT}','LOT-B',5,5,300,'2026-12-01',current_date);
    insert into cakes(client_id,numero,client_nom,date_event,nb_parts,prix_ht,statut) values
      (${CLIENT},'DEV-001','Client A','2026-11-25',20,5000,'devis');
  `);

  for (const nom of ORDRE) {
    const sql = await readFile(new URL('brouillons/' + nom + '.sql', supabase), 'utf8');
    try {
      await db.exec(sql);
    } catch (e) {
      assert.fail(`${nom} ne s'applique pas : ${String(e.message).split('\n')[0]}`);
    }
  }

  // Peuplement d'equipe_sites : sans lui, 105 et 121 coupent tout accès.
  await db.exec(`
    insert into equipe_sites(utilisateur_id,site_id) values
      ('${U_LAB}','${S_LAB}'),('${U_LAB}','${S_BOUT}'),('${U_VEN}','${S_BOUT}');`);
  return db;
}

/** Exécute une requête avec l'identité du compte, puis rend la main. */
async function compter(db, uid, sql) {
  await db.exec('reset role');
  await db.exec(`select set_config('test.uid','${uid}',false)`);
  await db.exec('set role authenticated');
  try {
    const r = await db.query(sql);
    return Number(Object.values(r.rows[0])[0]);
  } finally {
    await db.exec('reset role');
  }
}

test('les 7 migrations de confidentialité s’appliquent dans l’ordre', async () => {
  const db = await socle();
  const vues = await db.query(
    `select count(*) n from information_schema.views where table_schema='public' and table_name in
     ('labo_articles','labo_lots','labo_recette_versions','labo_ordres_fabrication','labo_cakes',
      'labo_bons_commande','labo_ventes_quantites','vendeur_lots','vendeur_ordres_fabrication')`);
  assert.equal(Number(vues.rows[0].n), 9, 'les 9 vues par rôle doivent exister');
  await db.close();
});

test('le vendeur ne lit plus aucun prix d’achat', async () => {
  const db = await socle();

  const lotsBruts = await compter(db, U_VEN, 'select count(*) from public.lots');
  assert.equal(lotsBruts, 0, 'le vendeur ne doit plus lire lots directement');

  const puLus = await compter(db, U_VEN, 'select count(pu) from public.lots');
  assert.equal(puLus, 0, 'aucun prix d’achat ne doit être lisible par le vendeur');

  const vueLots = await compter(db, U_VEN, 'select count(*) from public.vendeur_lots');
  assert.equal(vueLots, 1, 'le vendeur garde ses lots via la vue, sans la colonne pu');

  const prixVente = await compter(db, U_VEN, 'select count(pv_ht) from public.articles');
  assert.equal(prixVente, 2, 'la caisse garde son catalogue et ses prix de vente');

  await db.close();
});

test('le labo lit ses vues et plus aucune table financière brute', async () => {
  const db = await socle();

  const articles = await compter(db, U_LAB, 'select count(*) from public.labo_articles');
  assert.equal(articles, 2, 'labo_articles doit exposer les articles sans pv_ht');

  const articlesBruts = await compter(db, U_LAB, 'select count(*) from public.articles');
  assert.equal(articlesBruts, 0, 'la table articles doit rester fermée au labo');

  const lotsBruts = await compter(db, U_LAB, 'select count(*) from public.lots');
  assert.equal(lotsBruts, 0, 'la table lots doit rester fermée au labo');

  const couts = await compter(db, U_LAB, 'select count(*) from public.parametres_couts');
  assert.equal(couts, 0, 'les paramètres de coûts restent fermés au labo');

  await db.close();
});

test('le vendeur est limité aux boutiques, le labo à tous ses sites', async () => {
  const db = await socle();

  const boutique = await compter(db, U_VEN, `select case when public.patisgest_site_autorise('${S_BOUT}') then 1 else 0 end`);
  assert.equal(boutique, 1, 'le vendeur doit accéder à sa boutique');

  const labo = await compter(db, U_VEN, `select case when public.patisgest_site_autorise('${S_LAB}') then 1 else 0 end`);
  assert.equal(labo, 0, 'un vendeur ne doit pas accéder au laboratoire');

  const tousSites = await compter(db, U_LAB, 'select case when public.patisgest_tous_sites_autorises() then 1 else 0 end');
  assert.equal(tousSites, 1, 'le labo doit avoir tous les sites pour le module HACCP');

  await db.close();
});

test('le propriétaire ne perd rien', async () => {
  const db = await socle();

  const articles = await compter(db, U_OWN, 'select count(*) from public.articles');
  assert.equal(articles, 2);

  const pu = await compter(db, U_OWN, 'select count(pu) from public.lots');
  assert.equal(pu, 2, 'le propriétaire lit toujours les prix d’achat');

  const tous = await compter(db, U_OWN, 'select case when public.patisgest_tous_sites_autorises() then 1 else 0 end');
  assert.equal(tous, 1);

  await db.close();
});
