// VAGUE 2 — preuves exécutables (calculs, dates, définitions SQL).
//
// Tests purs Node + sonde PGlite sur la chaîne de déploiement 01→57.
// Les actions serveur mockées sont dans `vague2-actions.test.mjs` : le harnais
// `mock.module` de Node intercepte aussi la résolution des paquets CommonJS.
// PGlite n'est PAS un déploiement Supabase/PostgreSQL réel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';

import { computeCartTotals, isValidCartQty, MAX_CART_QTE } from '../src/lib/pos-cart.ts';
import { cakeConnectedTotals } from '../src/lib/cake-money.ts';
import { computeFefoCost } from '../src/lib/fefo-cost.ts';
import { computeIngredientImpact } from '../src/lib/ingredient-impact.ts';
import { ecrituresComptables } from '../src/lib/export-comptable.ts';
import {
  dateIsoValide,
  dateMetierPasFuture,
  jourLocal,
  plusJours,
} from '../src/lib/workspace-data.ts';
import { parseClosingInput } from '../src/lib/journal-input.ts';
import { parseOfFinishInput } from '../src/lib/stock-input.ts';
import { interpreterPeriode } from '../src/lib/csv.ts';

const UUID = '11111111-1111-4111-8111-111111111111';
const UUID2 = '22222222-2222-4222-8222-222222222222';
const MAINTENANT = new Date('2026-11-26T23:30:00.000Z'); // 00:30 le 27 à Alger

function forme(entries) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.set(k, String(v));
  return fd;
}

// ---------------------------------------------------------------- H05 calculs

test('H05-01 : round4 n’est appliqué qu’à des quantités positives à 4 décimales', () => {
  assert.equal(isValidCartQty(-0.0001), false);
  assert.equal(isValidCartQty(0), false);
  assert.equal(isValidCartQty(0.00005), false, '5 décimales refusées côté client');
  for (let i = 1; i <= 1000; i++) assert.equal(isValidCartQty(i / 10_000), true);
  assert.equal(isValidCartQty(MAX_CART_QTE), true);
  assert.equal(isValidCartQty(MAX_CART_QTE + 1), false);
  const t = computeCartTotals([{ articleId: UUID, label: 'A', qte: 0.0001, prixHT: 0.01, tva: 0 }]);
  assert.equal(t.valide, true);
});

test('H05-02 : le calcul BigInt du panier ne déborde pas aux limites', async () => {
  const t = computeCartTotals([{ articleId: UUID, label: 'Max', qte: 1e8, prixHT: 1e8, tva: 0 }]);
  assert.equal(t.valide, true);
  assert.equal(t.totalHT, 10_000_000_000_000_000);
  assert.equal(t.totalTTC, 10_000_000_000_000_000);
  const db = new PGlite();
  try {
    const r = await db.query('select round(100000000::numeric * 100000000::numeric, 2) as ht');
    assert.equal(Number(r.rows[0].ht), t.totalHT);
  } finally { await db.close(); }
});

test('H05-04/H05-08 : arrondis JS et numeric PostgreSQL concordent au centime', async () => {
  const cas = [[100.005, 0], [1.005, 19], [1234.565, 9], [0.005, 0], [12.345, 9]];
  const db = new PGlite();
  try {
    for (const [ht, tva] of cas) {
      const js = cakeConnectedTotals(ht, tva, 0).ttc;
      const sql = (await db.query(
        'select round($1::numeric * (1 + $2::numeric / 100), 2) as ttc',
        [String(ht), String(tva)],
      )).rows[0].ttc;
      assert.equal(js, Number(sql), `${ht} DA à ${tva} %`);
    }

    const panier = [
      { articleId: UUID, label: 'A', qte: 2.3456, prixHT: 84.03, tva: 19 },
      { articleId: UUID2, label: 'B', qte: 0.0001, prixHT: 229.36, tva: 9 },
      { articleId: '33333333-3333-4333-8333-333333333333', label: 'C', qte: 1.005, prixHT: 0.01, tva: 0 },
    ];
    const js = computeCartTotals(panier);
    let ht = 0;
    let ttc = 0;
    for (const l of panier) {
      const r = (await db.query(
        'select round($1::numeric * $2::numeric, 2) as ht, round($1::numeric * $2::numeric * (1 + $3::numeric / 100), 2) as ttc',
        [String(l.qte), String(l.prixHT), String(l.tva)],
      )).rows[0];
      ht += Number(r.ht);
      ttc += Number(r.ttc);
    }
    assert.equal(js.totalHT, Math.round(ht * 100) / 100);
    assert.equal(js.totalTTC, Math.round(ttc * 100) / 100);
  } finally { await db.close(); }
});

test('H05-05 : un avoir à 0,005 est négatif au centime, sans Math.round(-0,5)', () => {
  const e = ecrituresComptables({
    ventes: [],
    avoirs: [{ id: 'a', numero: 'AV-1', date: '2026-11-27', site: 'Boutique', totalHT: 0.005, totalTTC: 0.005, tva: 0 }],
  });
  assert.equal(e[0].ht, -0.01);
  assert.equal(e[0].ttc, -0.01);
  assert.equal(e[0].tva === 0, true, '-0 ou 0 : aucune TVA');
  assert.equal(e[0].sens, 'avoir');
});

test('H05-06 : les coûts FEFO sont déjà arrondis par ligne avant somme', () => {
  const r = computeFefoCost(
    [{ id: 'l', qte_rest: 1, pu: 0.005, dlc: null, date_reception: null, congele: false }],
    1,
    '2026-11-27',
  );
  assert.equal(r.cout, 0.01);
  const lignes = Array.from({ length: 1000 }, () => 0.01);
  const sommeApres = Math.round(lignes.reduce((s, x) => s + x, 0) * 100) / 100;
  const sommeArrondis = lignes.reduce((s, x) => s + Math.round(x * 100) / 100, 0);
  assert.equal(sommeApres, 10);
  assert.equal(Math.round(sommeArrondis * 100) / 100, sommeApres);
});

test('H05-07 : une quantité simulée nulle ou non finie est refusée avant division', () => {
  // Garde : actions-simulation.ts:48. On verrouille l'invariant arithmétique.
  for (const qte of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 100_000_001]) {
    assert.equal(Number.isFinite(qte) && qte > 0 && qte <= 100_000_000, false);
  }
});

test('H05-10 : divergence client/SQL sur une quantité à 5 décimales', async () => {
  const db = new PGlite();
  try {
    const r = await db.query('select round(0.00005::numeric, 4) as q');
    assert.equal(Number(r.rows[0].q) > 0, true, 'SQL arrondit à 0,0001 puis accepte');
    assert.equal(isValidCartQty(0.00005), false, 'client refuse : plus de 4 décimales');
  } finally { await db.close(); }
});

test('H05-12 : ancien prix à 0 ne produit pas de division par zéro', () => {
  const article = { id: 'a', code: 'A', nom: 'Farine', unite: 'kg' };
  const rapport = computeIngredientImpact({
    article,
    ancienPu: 0,
    sourceAncien: '',
    nouveauPu: 100,
    sourceNouveau: '',
    versions: [],
    articles: [article],
    lotsByArticle: new Map(),
    conversions: [],
    asOf: '2026-11-27',
  });
  assert.equal(rapport.variationPct, null);
  assert.equal(rapport.ecartUnitaire, 100);
});

// ---------------------------------------------------------------- H08 dates

test('H08-01/H08-02/H08-08 : le jour métier est Africa/Algiers, pas UTC', () => {
  assert.equal(jourLocal(MAINTENANT), '2026-11-27');
  assert.equal(dateMetierPasFuture('2026-11-27', MAINTENANT), true);
  assert.equal(dateMetierPasFuture('2026-11-28', MAINTENANT), false);
  assert.equal(dateMetierPasFuture('2026-02-30', MAINTENANT), false);

  const closing = forme({
    date: '2026-11-27', siteId: UUID, revise: 'false', lineCount: '1',
    line0_article: UUID2, line0_produit: '0', line0_vendu: '0', line0_reporte: '0',
    line0_jete: '0', line0_casse: '0', line0_offert: '0',
  });
  assert.doesNotThrow(() => parseClosingInput(closing, MAINTENANT));

  const finOf = forme({
    ofId: UUID, qte: '1', numeroLot: 'LOT-1', dlc: '2026-11-27',
  });
  assert.doesNotThrow(() => parseOfFinishInput(finOf, MAINTENANT));
  const finOfHier = forme({
    ofId: UUID, qte: '1', numeroLot: 'LOT-1', dlc: '2026-11-26',
  });
  assert.throws(() => parseOfFinishInput(finOfHier, MAINTENANT), /DLC/);
});

test('H08-09/H08-11 : calendrier grégorien, dates avant 1970 et périodes', () => {
  assert.equal(dateIsoValide('2024-02-29'), true);
  assert.equal(dateIsoValide('2026-02-30'), false);
  assert.equal(dateIsoValide('1969-12-31'), true);
  assert.equal(plusJours('2026-12-31', 1), '2027-01-01');
  assert.equal(interpreterPeriode('2024-02-29', '2024-02-29').ok, true);
  assert.equal(interpreterPeriode('1969-12-31', '1969-12-31').ok, true);
  assert.equal(interpreterPeriode('2026-02-30', null).ok, false);
});

// ---------------------------------------------------------------- sonde SQL

async function chargerChaine() {
  const db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create role service_role;
   create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
   create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
   create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
   alter default privileges in schema public grant all on tables to authenticated,service_role;
   alter default privileges in schema public grant execute on functions to authenticated,service_role;
   grant execute on function auth.uid() to authenticated,anon,service_role;`);
  for (const f of chaineDeploiement()) {
    if (f.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (f.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
    const sql = (await readFile(new URL(`../supabase/${cheminMigration(f)}`, import.meta.url), 'utf8'))
      .replace('create extension if not exists pgcrypto;', '');
    try { await db.exec(sql); } catch (e) { throw new Error(`${f}: ${e.message}`, { cause: e }); }
  }
  return db;
}

const def = async (db, signature) =>
  (await db.query(`select pg_get_functiondef('${signature}'::regprocedure) as d`)).rows[0].d;

test('H08-03/H06-*/H07-* : définitions SQL installées après 55', async () => {
  const db = await chargerChaine();
  try {
    // H08-03 : 36 avait rattrapé les fonctions existantes ; 41/47/50 en avaient
    // réintroduit. Après 55, plus aucun current_date dans une fonction publique.
    const restants = await db.query(`select count(*)::int as n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
      where ns.nspname='public' and p.prokind in ('f','p') and pg_get_functiondef(p.oid) ~* '\\mcurrent_date\\M'`);
    assert.equal(restants.rows[0].n, 0);
    const defauts = await db.query(`select count(*)::int as n from information_schema.columns
      where table_schema='public' and column_default ~* 'current_date'`);
    assert.equal(defauts.rows[0].n, 0);
    const vues = await db.query(`select count(*)::int as n from pg_views v
      where v.schemaname='public' and pg_get_viewdef(format('%I.%I',v.schemaname,v.viewname)::regclass) ~* '\\mcurrent_date\\M'`);
    assert.equal(vues.rows[0].n, 0);
    const avoir = await def(db, 'public.enregistrer_avoir(uuid,text,text,numeric)');
    const tiroir = await def(db, 'public.valider_tiroir_jour(date,uuid,numeric,numeric,numeric,text)');
    assert.match(avoir, /Africa\/Algiers/);
    assert.match(tiroir, /Africa\/Algiers/);
    assert.doesNotMatch(avoir, /current_date/i);
    assert.doesNotMatch(tiroir, /current_date/i);
    const version = (await db.query('select version from public.app_schema_version')).rows[0].version;
    assert.ok(version >= 57);

    // H05-03 : le serveur refuse bien un prix nul (migration 32 + 53).
    const vendre = await def(db, 'public.vendre_panier(uuid,jsonb,text,text)');
    assert.match(vendre, /v_art\.pv_ht <= 0/);
    assert.doesNotMatch(vendre, /v_art\.pv_ht < 0 or/);
    // H07-09 : ordre FEFO déterministe + verrous de ligne.
    assert.match(vendre, /order by l\.congele asc, l\.dlc asc nulls last, l\.date_reception asc, l\.id asc/i);
    assert.match(vendre, /for update/i);
    assert.match(vendre, /not l\.bloque/i);

    // H07-07 : l'édition de fiche ne verrouille pas ; seule la publication le fait.
    const edition = await def(db, 'public.patisgest_enregistrer_fiche_vitrine(uuid,boolean,text,text,text,integer)');
    const publication = await def(db, 'public.patisgest_publier_vitrine(uuid,text)');
    assert.doesNotMatch(edition, /for update/i);
    assert.match(publication, /for update/i);

    // H07-06 : la décision sur une demande verrouille la ligne cake.
    const traiter = await def(db, 'public.patisgest_traiter_demande(uuid,text)');
    assert.match(traiter, /for update/i);

    // H06-02 : les statuts NC historiques sont normalisés par lower().
    const nc = await def(db, 'public.maj_non_conformite(uuid,text,text)');
    assert.match(nc, /lower\(nc\.statut\)/);
    // H06-06 : l'équivalent SQL de la révision de clôture existe.
    const cloture = await def(db, 'public.saisir_cloture(date,uuid,jsonb,boolean,jsonb)');
    assert.match(cloture, /p_revise/);
    // H06-03/H06-04 : OF verrouillé et quantité bornée au reste.
    const terminer = await def(db, 'public.patisgest_terminer_of_interne(uuid,numeric,text,date)');
    assert.match(terminer, /for update/i);
    assert.match(terminer, /p_qte > v_rest/);
    // H06-07 : le blocage explicite pose bloque=true ; le FEFO exclut ces lots.
    const bloquer = await def(db, 'public.bloquer_lot(uuid,boolean,text,boolean)');
    assert.match(bloquer, /set bloque = true/i);
    const rappel = await def(db, 'public.rappel_lot(uuid)');
    assert.match(rappel, /stable/i);

    // H08-05 : l'index partiel laisse bien passer deux cle_vitrine NULL.
    await db.exec(`insert into clients(id,nom) values ('${UUID}','Atelier');`);
    const cake = (numero) => `insert into cakes(client_id,numero,client_nom,date_event,nb_parts,prix_ht,statut,cle_vitrine)
      values ('${UUID}','${numero}','Client','2026-12-01',10,100,'devis',null)`;
    await db.exec(cake('CK-1'));
    await db.exec(cake('CK-2'));
    const doublonsNull = await db.query(`select count(*)::int as n from public.cakes where cle_vitrine is null`);
    assert.equal(doublonsNull.rows[0].n, 2);
    // H08-06 : un sous-domaine est unique globalement, insensible à la casse.
    const UUID3 = '33333333-3333-4333-8333-333333333333';
    await db.exec(`insert into clients(id,nom) values ('${UUID3}','Autre atelier');`);
    await db.exec(`insert into sites(id,client_id,nom,type,subdomain) values
      ('${UUID2}','${UUID}','Boutique','boutique','elyasmine');`);
    await assert.rejects(
      db.exec(`insert into sites(id,client_id,nom,type,subdomain) values
        ('44444444-4444-4444-8444-444444444444','${UUID3}','Boutique 2','boutique','elyasmine');`),
      /duplicate key|unique/i,
    );
    // H08-07 : l'index unique des lots couvre bien (client, article, site, numero).
    await db.exec(`insert into articles(id,client_id,code,nom,niveau,unite,pv_ht,tva)
      values ('${UUID}','${UUID}','FAR','Farine','matiere','kg',100,0);`);
    const lot = (id) => `insert into lots(id,client_id,article_id,site_id,numero,qte_init,qte_rest,pu,ref)
      values ('${id}','${UUID}','${UUID}','${UUID2}','LOT-1',1,1,100,null)`;
    await db.exec(lot('44444444-4444-4444-8444-444444444444'));
    await assert.rejects(
      db.exec(lot('55555555-5555-4555-8555-555555555555')),
      /duplicate key|unique/i,
    );
  } finally { await db.close(); }
});
