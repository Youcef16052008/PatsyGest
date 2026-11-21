import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Répétition PGlite distincte des tests avec brouillons 101–128. Les migrations
// 01–23 + 24–31 sont appliquées avec les mêmes adaptations historiques connues.
// Ce n'est ni un historique de déploiement validé ni le catalogue du pilote.
export async function baseMain() {
  const db = new PGlite();
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth; grant usage on schema public,auth to authenticated,anon,service_role;
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
      create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,deleted_at timestamptz);
      create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
      alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
      alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;
      grant execute on function auth.uid() to authenticated,anon,service_role;`);
    const manifest = JSON.parse(await readFile(new URL('../../migrations/repetition.json', import.meta.url), 'utf8'));
    for (const { file } of [...manifest.historique, ...manifest.main_hors_serie]) {
      // Le dépôt ne représente pas un historique vierge rejouable tel quel.
      if (file.startsWith('07-')) await db.exec("create function public.creer_of(uuid,uuid,numeric,date) returns jsonb language sql as $$select '{}'::jsonb$$");
      if (file.startsWith('09-')) await db.exec('alter table public.clotures add column if not exists revision integer default 1');
      const sql = (await readFile(new URL(`../../supabase/${file}`, import.meta.url), 'utf8'))
        .replace('create extension if not exists pgcrypto;', '');
      try { await db.exec(sql); }
      catch (error) { throw new Error(`Migration ${file}: ${error.message}`, { cause: error }); }
    }
    return db;
  } catch (error) {
    await db.close();
    throw error;
  }
}
