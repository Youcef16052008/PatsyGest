// NF-01 — mesure de la charge de lecture du tableau de bord.
//
// Le CDC exige « dashboard < 2 s avec 1 an de données ». L'audit a relevé que
// ce n'était **jamais mesuré** : ni test, ni banc d'essai. Ce fichier ne simule
// pas un réseau : il mesure le travail réel de lecture (volume, nombre
// d'aller-retours, coût CPU du traitement) avec un volume d'un an de données
// d'une pâtisserie plausible.
//
// Pourquoi des seuils sur le volume et non sur des millisecondes : une mesure
// de temps dans une CI est instable (machine partagée, cache froid), et un test
// qui échoue au hasard finit désactivé. Le volume, lui, est déterministe et
// c'est lui qui décide du temps réel. Le temps est affiché pour la mesure
// mensuelle sur appareil, pas pour faire échouer la CI.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
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

/** Un an d'activité d'une pâtisserie d'Oran, ordre de grandeur réaliste. */
const VOLUME = {
  articles: 120,      // fiches produit + matières
  lots: 400,          // réceptions sur 1 an (beaucoup consommées)
  ventes: 18_000,     // ~50 tickets/jour × 360 jours
  ordres: 900,        // ~3 fournées/jour
};

async function base() {
  const db = new PGlite();
  await db.exec(PREAMBULE);
  for (const file of chaineDeploiement()) {
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8'))
      .replace('create extension if not exists pgcrypto;', '');
    await db.exec(sql);
  }
  await db.exec(`
    insert into public.clients(id, nom) values ('${CLIENT}', 'Pâtisserie charge');
    insert into public.sites(id, client_id, nom, type) values ('${SITE}', '${CLIENT}', 'Boutique', 'boutique');
  `);
  return db;
}

/** Génère le volume en SQL — plus rapide et plus fidèle qu'une boucle JS. */
async function remplir(db) {
  const t0 = Date.now();
  await db.exec(`
    insert into public.articles (client_id, code, nom, niveau, unite, pv_ht, tva)
      select '${CLIENT}', 'ART-' || g, 'Article ' || g, 'produit', 'piece', 300, 19
        from generate_series(1, ${VOLUME.articles}) g;

    insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, dlc, date_reception)
      select '${CLIENT}', a.id, '${SITE}', 'LOT-' || g, 50, 10, 100,
             current_date + (g % 30), current_date - (g % 365)
        from generate_series(1, ${VOLUME.lots}) g
        join lateral (select id from public.articles where client_id='${CLIENT}' order by code offset (g % ${VOLUME.articles}) limit 1) a on true;

    insert into public.ventes (client_id, site_id, numero, ticket, date_vente, source, lignes, total_ht, total_ttc)
      select '${CLIENT}', '${SITE}', 'V-' || g, 'T-' || g,
             current_date - (g % 360), 'caisse',
             jsonb_build_array(jsonb_build_object('articleId', (select id from public.articles where client_id='${CLIENT}' order by code limit 1), 'qty', 1, 'pu', 300, 'tva', 19, 'totalHT', 300, 'totalTTC', 357)),
             300, 357
        from generate_series(1, ${VOLUME.ventes}) g;

    insert into public.ordres_fabrication (client_id, famille_id, version_id, site_id, numero, qte_prevue, date_prevue, statut, snapshot)
      select '${CLIENT}', f.id, v.id, '${SITE}', 'OF-' || g, 10, current_date - (g % 360), 'termine',
             jsonb_build_object('recette', 'Recette ' || g, 'version', 1)
        from generate_series(1, ${VOLUME.ordres}) g
        join lateral (select id from public.recette_familles where client_id='${CLIENT}' limit 1) f on true
        join lateral (select id from public.recette_versions where client_id='${CLIENT}' limit 1) v on true;

    analyze;
  `);
  return Date.now() - t0;
}

test('NF-01 : le tableau de bord lit un volume borné, pas un an d’archives', async () => {
  const db = await base();
  const dureeRemplissage = await remplir(db);
  try {
    // 1) Les lots « vivants » : c'est ce que lit le dashboard. Un lot consommé
    //    (qte_rest = 0) ne doit pas être ramené.
    const t1 = Date.now();
    const lots = (await db.query(
      `select id, article_id, site_id, numero, qte_rest, dlc, bloque, congele, date_reception
         from public.lots where client_id = $1 and qte_rest > 0 order by id`, [CLIENT])).rows;
    const tempsLots = Date.now() - t1;

    // 2) Les ventes sur 14 jours (lireVentesJours) : doit rester proportionnel
    //    à la fenêtre, pas au total annuel.
    const t2 = Date.now();
    const ventes = (await db.query(
      `select date_vente, total_ttc from public.ventes
        where client_id = $1 and date_vente >= current_date - 13 and date_vente <= current_date
        order by id`, [CLIENT])).rows;
    const tempsVentes = Date.now() - t2;

    const totalVentes = Number((await db.query(`select count(*) as n from public.ventes`)).rows[0].n);
    assert.equal(totalVentes, VOLUME.ventes, 'le jeu de données doit être réellement chargé');

    // La fenêtre de 14 jours est une petite fraction de l'année : si ce test
    // échoue, c'est que la requête a perdu son filtre de date.
    assert.ok(
      ventes.length < totalVentes / 10,
      `la lecture 14 jours ne doit pas ramener l'année (${ventes.length}/${totalVentes})`,
    );

    // Le dashboard ne doit jamais traiter plus de 2 000 lignes par table.
    assert.ok(lots.length <= 2_000, `${lots.length} lots : le dashboard en traiterait trop`);

    // Trace de mesure (temps réel, pas seuil CI).
    console.log(
      `[NF-01] volume=${VOLUME.ventes} ventes/${VOLUME.lots} lots · ` +
      `remplissage=${dureeRemplissage}ms lots=${tempsLots}ms (${lots.length} lignes) ` +
      `ventes14j=${tempsVentes}ms (${ventes.length} lignes)`,
    );
  } finally {
    await db.close();
  }
});

test('NF-01 : au-delà de la limite, lirePages s’arrête sans charger 20 000 lignes', async () => {
  // Le défaut d'origine : charger tout, puis refuser. On mesure le nombre
  // d'appels — c'est lui qui décide du temps réel chez le client.
  const { lirePages } = await import('../src/lib/workspace-read.ts');

  let appels = 0;
  let lignesChargees = 0;
  const page = async (debut, fin) => {
    appels += 1;
    const n = fin - debut + 1;
    // Collection « infinie » : chaque page est pleine.
    const data = Array.from({ length: n }, (_, i) => ({ id: debut + i }));
    lignesChargees += data.length;
    return { data, error: null };
  };

  const resultat = await lirePages(page);
  assert.equal(resultat, null, 'une collection tronquée ne doit jamais être retournée comme complète');
  // 20 000 lignes + la sonde d'une ligne qui prouve qu'il y en a d'autres.
  // C'est ce qui distingue « exactement 20 000 » de « 20 000 ou plus ».
  assert.equal(lignesChargees, 20_001, 'la limite plus une seule ligne de sonde');
  // 20000 / 500 = 40 pages + 1 sonde. L'ancienne implémentation faisait la même
  // chose MAIS sur une collection finie de 20 000 elle renvoyait null sans sonde.
  assert.equal(appels, 41, `nombre d'appels : ${appels}`);
});

test('NF-01 : une collection sous la limite n’est lue qu’une fois de trop (fin de page)', async () => {
  const { lirePages } = await import('../src/lib/workspace-read.ts');
  let appels = 0;
  const page = async (debut, fin) => {
    appels += 1;
    const restants = Math.max(0, 700 - debut);
    const n = Math.min(fin - debut + 1, restants);
    return { data: Array.from({ length: n }, (_, i) => ({ id: debut + i })), error: null };
  };
  const r = await lirePages(page);
  assert.equal(r.length, 700);
  assert.equal(appels, 2, `700 lignes = 2 pages, reçu ${appels}`);
});
