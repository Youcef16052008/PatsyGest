// F-19 : matrice application × schéma déployable.
//
// Objectif : détecter tout objet (table, vue, RPC) que l'application lit mais
// qui est absent du schéma déployé à la version requise. C'est exactement la
// classe de défaut F-19 (vues `labo_*` absentes du chemin déployable) qui a
// cassé les rôles labo et vendeur au déploiement de `main`.
//
// Le schéma de référence est la **chaîne de déploiement** (`01`–`23` puis
// `24`–`39`), pas les brouillons `101`–`128` (« pas un ordre de déploiement »).
//
// Deux catégories d'exceptions, chacune justifiée par un garde-fou vérifié ici
// et pas par une simple liste d'exclusion :
//  - les vues `labo_*` / `vendeur_*` : masquées par `ROLES_LABO_VENDEUR_ACTIFS` ;
//  - les RPC `equipe_*` et `patisgest_tous_sites_autorises` : fonctionnalité
//    expérimentale locale (`equipeExperimentaleActive`) ou appel réservé aux
//    rôles non-propriétaire — précisément les rôles masqués ci-dessus.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from './migrations-historique.mjs';
import { ROLES_LABO_VENDEUR_ACTIFS } from '../src/lib/permissions.ts';
import { equipeExperimentaleActive } from '../src/lib/equipe-experimental.ts';
import { TABLES_EXPORT } from '../src/lib/csv.ts';
import { ORDRE_RESTAURATION } from '../src/lib/sauvegarde.ts';

const SOURCE = fileURLToPath(new URL('../src/', import.meta.url));

async function fichiersSource() {
  const fichiers = [];
  const parcours = async (dir) => {
    for (const entree of await readdir(dir, { withFileTypes: true })) {
      const cible = join(dir, entree.name);
      if (entree.isDirectory()) await parcours(cible);
      else if (/\.(ts|tsx)$/.test(entree.name)) fichiers.push(cible);
    }
  };
  await parcours(SOURCE);
  return fichiers;
}

/** Objets atteints par un appel `.from(…)` / `.rpc(…)` littéral. */
async function ciblesLitterales() {
  const tables = new Set(), rpcs = new Set();
  for (const fichier of await fichiersSource()) {
    const texte = await readFile(fichier, 'utf8');
    for (const m of texte.matchAll(/\.(from|rpc)\(\s*(['"`])([^'"`\n]+)\2/g)) {
      (m[1] === 'from' ? tables : rpcs).add(m[3]);
    }
  }
  return { tables, rpcs };
}

/** Objets atteints par une lecture dynamique, depuis les listes déclaratives de l'app. */
async function ciblesDynamiques() {
  const tables = new Set(TABLES_EXPORT.map((t) => t.table));
  for (const t of ORDRE_RESTAURATION) tables.add(t);
  // `[module]/page.tsx` n'exporte pas son tableau `modules` : on y lit les
  // couples `['table','Libellé']`, uniquement dans le bloc de déclaration.
  const page = await readFile(new URL('../src/app/(app)/[module]/page.tsx', import.meta.url), 'utf8');
  const debut = page.indexOf('const modules = {');
  const fin = page.indexOf('} as const;', debut);
  assert.ok(debut >= 0 && fin > debut, 'Le tableau `modules` de [module]/page.tsx est introuvable.');
  for (const m of page.slice(debut, fin).matchAll(/\['([a-z_][a-z0-9_]*)','[^']*'\]/g)) tables.add(m[1]);
  return tables;
}

const PREAMBULE = `create role authenticated; create role anon; create role service_role;
 create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
 create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
 alter default privileges in schema public grant all on tables to authenticated,service_role;
 alter default privileges in schema public grant execute on functions to authenticated,service_role;
 grant execute on function auth.uid() to authenticated,anon,service_role;`;

async function schemaDeploye() {
  const db = new PGlite();
  await db.exec(PREAMBULE);
  for (const file of chaineDeploiement()) {
    let sql = await readFile(new URL(`../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8');
    sql = sql.replace('create extension if not exists pgcrypto;', '');
    // La 07 actuelle a été rééditée après la 16 ; la 09 suppose la révision.
    if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
    if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1;');
    await db.exec(sql);
  }
  const relations = new Set((await db.query(
    "select c.relname n from pg_class c join pg_namespace s on s.oid=c.relnamespace where s.nspname='public' and c.relkind in ('r','v','m','p')",
  )).rows.map((r) => r.n));
  const fonctions = new Set((await db.query(
    "select p.proname n from pg_proc p join pg_namespace s on s.oid=p.pronamespace where s.nspname='public'",
  )).rows.map((r) => r.n));
  return { db, relations, fonctions };
}

test('F-19 matrice application × schéma : tout objet lu existe dans la chaîne déployée', async () => {
  const { tables: litterales, rpcs } = await ciblesLitterales();
  const dynamiques = await ciblesDynamiques();
  for (const t of dynamiques) litterales.add(t);

  const tablesLabo = [...litterales].filter((t) => /^(labo|vendeur)_/.test(t)).sort();
  const tablesDeployees = [...litterales].filter((t) => !/^(labo|vendeur)_/.test(t)).sort();
  const rpcsEquipe = [...rpcs].filter((r) => r.startsWith('equipe_')).sort();
  // Réservé aux rôles non-propriétaire (labo/vendeur), masqués ci-dessus.
  const rpcsHorsChemin = [...rpcsEquipe, 'patisgest_tous_sites_autorises'].sort();
  const rpcsDeployees = [...rpcs].filter((r) => !rpcsHorsChemin.includes(r)).sort();

  const { db, relations, fonctions } = await schemaDeploye();
  try {
    // La extraction ne doit pas être vide : sinon le test se désarme en silence.
    assert.ok(tablesDeployees.length >= 25, `Extraction des tables trop faible (${tablesDeployees.length})`);
    assert.ok(rpcsDeployees.length >= 35, `Extraction des RPC trop faible (${rpcsDeployees.length})`);

    const tablesManquantes = tablesDeployees.filter((t) => !relations.has(t));
    assert.deepEqual(tablesManquantes, [], `Tables/vues lues par l'application mais absentes du schéma déployé : ${tablesManquantes.join(', ')}`);

    const rpcsManquantes = rpcsDeployees.filter((r) => !fonctions.has(r));
    assert.deepEqual(rpcsManquantes, [], `RPC appelées par l'application mais absentes du schéma déployé : ${rpcsManquantes.join(', ')}`);

    // Les exceptions ne sont admises que parce qu'un garde-fou les masque.
    assert.equal(ROLES_LABO_VENDEUR_ACTIFS, false, 'Les vues labo/vendeur ne sont plus masquées : exiger alors leur présence dans le schéma déployé.');
    assert.ok(tablesLabo.length > 0, 'Aucune vue labo/vendeur détectée : la liste d\'exception serait morte.');
    assert.equal(equipeExperimentaleActive(), false, 'La gestion d\'équipe n\'est plus hors production : exiger alors les RPC equipe_* dans le schéma déployé.');
    assert.ok(rpcsEquipe.length > 0, 'Aucune RPC equipe_* détectée : la liste d\'exception serait morte.');
    assert.ok(rpcs.has('patisgest_tous_sites_autorises'), 'La RPC de vérification des sites a changé de nom : mettre à jour la matrice.');
  } finally {
    await db.close();
  }
});

test('F-19 matrice : les vues labo/vendeur sont bien absentes de la chaîne déployée', async () => {
  // Preuve de couplage : le déploiement de `main` sans les brouillons 101/115/116
  // ne fournit pas ces vues. Si cette assertion devient fausse, c'est que la
  // chaîne de déploiement a changé et que le masquage des rôles peut être revu.
  const { db, relations } = await schemaDeploye();
  try {
    const vuesLabo = [...relations].filter((r) => /^(labo|vendeur)_/.test(r)).sort();
    assert.deepEqual(vuesLabo, [], `Des vues labo/vendeur sont maintenant dans la chaîne déploiée : revoir ROLES_LABO_VENDEUR_ACTIFS.`);
  } finally {
    await db.close();
  }
});
