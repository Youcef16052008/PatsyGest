import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerChaineActive } from './support/chaine-active.mjs';

/*
 * H13-H20 / VAGUE 5 — benchmark LOCAL reproductible sur PGlite.
 *
 * Ce test est une preuve de plan d'exécution et de garde-fou d'index sur la
 * chaîne 01→57. Il ne certifie ni PostgreSQL/Supabase en production, ni la
 * concurrence réelle, ni Auth/PostgREST/Storage, ni un déploiement.
 */

const CLIENT = '11111111-1111-4111-8111-111111111111';
const SITE = '22222222-2222-4222-8222-222222222222';
const LIGNES = 100_000;
const ARTICLE = '33333333-3333-4333-8333-333333333333';
const UID = '99999999-9999-4999-8999-999999999999';

function duree(depart) {
  return Number(process.hrtime.bigint() - depart) / 1_000_000;
}

test('PGlite 100 000 ventes : chaîne 58, index couvrant et EXPLAIN local', { timeout: 180_000 }, async () => {
  const { db, fichiers, version } = await creerChaineActive();
  try {
    assert.equal(version, 58, 'version de chaîne attendue');
    assert.equal(fichiers.length, 57, 'nombre de fichiers de la chaîne active');
    assert.equal(fichiers.at(-1), '58-durcissement-forensique-prod.sql');

    const index = await db.query(
      "select indexname from pg_indexes where schemaname='public' and tablename='ventes' and indexname in ('ventes_client_date_idx','ventes_client_created_idx')",
    );
    const noms = new Set(index.rows.map((r) => String(r.indexname)));
    assert.ok(noms.has('ventes_client_date_idx'), 'index ventes_client_date_idx absent');
    assert.ok(noms.has('ventes_client_created_idx'), 'index ventes_client_created_idx absent');

    await db.exec(`
      insert into public.clients(id,nom) values('${CLIENT}','Bench');
      insert into public.sites(id,client_id,nom) values('${SITE}','${CLIENT}','Labo');
    `);

    const debutInsert = process.hrtime.bigint();
    await db.exec(`
      insert into public.ventes(id,client_id,site_id,numero,ticket,date_vente,lignes,manquants,total_ht,total_ttc)
      select ('00000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,
             '${CLIENT}','${SITE}','V'||g,'T'||g,
             (date '2026-01-01'+(g%365)), '[]'::jsonb,'[]'::jsonb,0,0
      from generate_series(1,${LIGNES}) g
    `);
    const insertMs = duree(debutInsert);

    const debutAnalyze = process.hrtime.bigint();
    await db.exec('analyze public.ventes');
    const analyzeMs = duree(debutAnalyze);

    const q = `select count(*)::int as n from public.ventes where client_id='${CLIENT}' and date_vente=date '2026-06-15'`;
    const debutCount = process.hrtime.bigint();
    const compte = await db.query(q);
    const countMs = duree(debutCount);
    assert.equal(compte.rows[0]?.n, Math.round(LIGNES / 365), 'comptage de la journée témoin');

    const explique = await db.query(`explain (analyze,buffers) ${q}`);
    const plan = explique.rows.map((r) => String(r['QUERY PLAN'])).join('\n');
    assert.match(plan, /Index Only Scan using ventes_client_date_idx/u, `plan inattendu :\n${plan}`);
    assert.match(plan, /Buffers: shared hit=/u, 'compteurs de buffers absents');
    const execution = Number(plan.match(/Execution Time: ([\d.]+) ms/u)?.[1] ?? Number.POSITIVE_INFINITY);
    assert.ok(execution < 50, `EXPLAIN trop lent en PGlite : ${execution} ms`);

    // H15-02 / H15-05 : 100 000 lots FEFO + 100 000 mouvements.
    await db.exec(`insert into public.articles(id,client_id,code,nom) values('${ARTICLE}','${CLIENT}','BENCH','Bench')`);
    const debutLots = process.hrtime.bigint();
    await db.exec(`
      insert into public.lots(id,client_id,article_id,site_id,numero,qte_init,qte_rest,pu,dlc,date_reception,congele,bloque)
      select ('44444444-4444-4444-8444-'||lpad(g::text,12,'0'))::uuid,'${CLIENT}','${ARTICLE}','${SITE}',
             'L'||g,1,1,0,(date '2026-01-01'+(g%365)),(date '2026-01-01'+(g%365)),false,false
      from generate_series(1,${LIGNES}) g
    `);
    const lotsMs = duree(debutLots);
    const debutMouvements = process.hrtime.bigint();
    await db.exec(`
      insert into public.mouvements(id,client_id,article_id,site_id,type,qte,pu,date_mvt)
      select ('55555555-5555-4555-8555-'||lpad(g::text,12,'0'))::uuid,'${CLIENT}','${ARTICLE}','${SITE}',
             'entree',1,0,(date '2026-01-01'+(g%365))
      from generate_series(1,${LIGNES}) g
    `);
    const mouvementsMs = duree(debutMouvements);
    await db.exec('analyze public.lots; analyze public.mouvements;');

    const qFefo = `select id from public.lots where client_id='${CLIENT}' and article_id='${ARTICLE}' and site_id='${SITE}' and qte_rest>0 and not bloque order by congele, dlc nulls last, date_reception, id limit 10`;
    const planFefo = (await db.query(`explain (analyze,buffers) ${qFefo}`)).rows.map((r) => String(r['QUERY PLAN'])).join('\n');
    assert.match(planFefo, /Index Only Scan using lots_fefo_idx/u, `plan FEFO inattendu :\n${planFefo}`);

    const qMouvements = `select count(*)::int as n from public.mouvements where client_id='${CLIENT}' and date_mvt=date '2026-06-15'`;
    const planMouvements = (await db.query(`explain (analyze,buffers) ${qMouvements}`)).rows.map((r) => String(r['QUERY PLAN'])).join('\n');
    assert.match(planMouvements, /Index Only Scan using mouvements_client_date_idx/u, `plan mouvements inattendu :\n${planMouvements}`);

    const barrieres = await db.query(
      "select count(*)::int as n from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='v' and array_to_string(c.reloptions,'') like '%security_barrier=true%'",
    );
    assert.ok(Number(barrieres.rows[0]?.n) >= 9, 'vues security_barrier manquantes');
    const restrictives = await db.query(
      "select count(*)::int as n from pg_policies where schemaname='public' and permissive='RESTRICTIVE'",
    );
    assert.ok(Number(restrictives.rows[0]?.n) >= 5, 'policies RESTRICTIVES manquantes');

    // H15-03 / H15-04 : coût mesuré d'un OFFSET 20 000 sur 100 000 ventes.
    const qOffset = `select id from public.ventes where client_id='${CLIENT}' order by date_vente offset 20000 limit 500`;
    const planOffset = (await db.query(`explain (analyze,buffers) ${qOffset}`)).rows.map((r) => String(r['QUERY PLAN'])).join('\n');
    assert.match(planOffset, /Index Scan using ventes_client_date_idx/u, 'plan OFFSET inattendu');
    const offsetExecution = Number(planOffset.match(/Execution Time: ([\d.]+) ms/u)?.[1] ?? Number.POSITIVE_INFINITY);
    assert.ok(offsetExecution < 100, `OFFSET 20 000 trop lent : ${offsetExecution} ms`);
    assert.match(readFileSync(new URL('../src/lib/workspace-read.ts', import.meta.url), 'utf8'), /const LIMITE_TOTALE = 20_000;/u);

    // H15-06 : RLS à 100 000 utilisateurs, sous rôle authenticated et uid simulé.
    const debutUtilisateurs = process.hrtime.bigint();
    await db.exec(`
      insert into public.utilisateurs(id,auth_user_id,client_id,email,nom,role,langue,offline_alert_count)
      select ('66666666-6666-4666-8666-'||lpad(g::text,12,'0'))::uuid,
             ('77777777-7777-4777-8777-'||lpad(g::text,12,'0'))::uuid,
             '${CLIENT}','u'||g||'@test','U'||g,'vendeur','fr',0
      from generate_series(1,${LIGNES}) g
    `);
    await db.exec(`
      insert into public.utilisateurs(id,auth_user_id,client_id,email,nom,role,langue,offline_alert_count)
      values('88888888-8888-4888-8888-888888888888','${UID}','${CLIENT}','owner@test','Owner','proprietaire','fr',0)
    `);
    const utilisateursMs = duree(debutUtilisateurs);
    await db.exec('analyze public.utilisateurs');
    await db.exec(`set role authenticated; set test.uid='${UID}';`);
    const sousRls = await db.query('select count(*)::int as n from public.utilisateurs');
    assert.equal(sousRls.rows[0]?.n, 1, 'RLS ne filtre pas sur auth.uid()');
    const planRls = (await db.query('explain (analyze,buffers) select count(*) from public.utilisateurs')).rows.map((r) => String(r['QUERY PLAN'])).join('\n');
    assert.match(planRls, /Index Only Scan using utilisateurs_auth_user_id_key/u, `plan RLS inattendu :\n${planRls}`);
    await db.exec('reset role;');

    console.log(
      `[bench-pglite] ventes=${insertMs.toFixed(1)}ms analyze=${analyzeMs.toFixed(1)}ms ` +
      `count=${countMs.toFixed(1)}ms lots=${lotsMs.toFixed(1)}ms mouvements=${mouvementsMs.toFixed(1)}ms ` +
      `utilisateurs=${utilisateursMs.toFixed(1)}ms execution=${execution}ms offset=${offsetExecution}ms lignes=${LIGNES}`,
    );
  } finally {
    await db.close();
  }
});
