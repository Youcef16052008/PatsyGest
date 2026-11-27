import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { chaineDeploiement, cheminMigration } from '../migrations-historique.mjs';

/*
 * Chaîne PGlite ACTIVE utilisée par `tests/chaine-rejouable.test.mjs`.
 *
 * Ce n'est pas une base vierge sans aucun stub : PGlite ne fournit ni Auth
 * Supabase, ni `rls_auto_enable()`, ni extension pgcrypto. Les adaptations
 * ci-dessous sont explicites et déjà utilisées par les tests PGlite existants.
 * Le but est de rendre la chaîne du manifeste capable d'échouer, pas de certifier
 * un déploiement Supabase ou une base pilote.
 */
const PREAMBULE = `
create role authenticated; create role anon; create role service_role;
create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
grant execute on function auth.uid() to authenticated,anon,service_role;`;

/**
 * @param {{ corrompre?: (file: string, sql: string) => string | null | undefined }} [options]
 * @returns {Promise<{ files: number, version: number }>}
 */
export async function appliquerChaineActive(options = {}) {
  const db = new PGlite();
  const fichiers = chaineDeploiement();
  try {
    await db.exec(PREAMBULE);
    for (const file of fichiers) {
      if (file.startsWith('07-')) {
        await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
      }
      if (file.startsWith('09-')) {
        await db.exec('alter table public.clotures add column if not exists revision integer default 1');
      }
      let sql = (await readFile(new URL(`../../supabase/${cheminMigration(file)}`, import.meta.url), 'utf8'))
        .replace(/create extension[^;]*pgcrypto[^;]*;/gi, '');
      const remplacement = options.corrompre?.(file, sql);
      if (typeof remplacement === 'string') sql = remplacement;
      try {
        await db.exec(sql);
      } catch (error) {
        throw new Error(`Migration ${file} : ${error.message}`, { cause: error });
      }
    }
    const res = await db.query('select max(version)::int as version from public.app_schema_version');
    return { files: fichiers.length, version: Number(res.rows[0]?.version ?? 0) };
  } finally {
    await db.close();
  }
}
