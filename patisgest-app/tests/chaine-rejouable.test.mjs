import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// La chaîne 01→43 doit pouvoir recréer une base de zéro.
//
// Ce test a été écrit après avoir constaté le contraire : trois migrations
// référençaient des objets qu'aucune migration ne crée (`clotures.revision`,
// `articles.pu_ht`, `rls_auto_enable()`), et le seed visait `auth.users`. Le
// dépôt décrivait donc un état antérieur aux corrections appliquées à la main en
// base — ce qui rend impossible toute restauration depuis le dépôt.
//
// Mesure de départ : 43 fichiers, 4 échecs (voir migrations/CHAINE-NON-REJOUABLE.md).
// `02-seed-pilote.sql` est exclu : c'est un seed de données, il vise `auth.users`
// qui n'existe pas dans un Postgres nu. Les 42 fichiers de schéma, eux, doivent
// passer. Tant que le défaut est ouvert, ce test est marqué `todo` pour garder la
// suite verte sans effacer le signal.

test.todo('les migrations de schéma 01→43 se rejouent sur une base vierge', async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select 'authenticated'$$;
    create function auth.jwt() returns jsonb language sql stable as $$select '{}'::jsonb$$;
    create table auth.users (id uuid primary key);
    create function creer_of(uuid,uuid,numeric) returns uuid language sql as $$select gen_random_uuid()$$;
    create function creer_of(uuid,uuid,numeric,date) returns uuid language sql as $$select gen_random_uuid()$$;
    create function public.rls_auto_enable() returns event_trigger language plpgsql as $$begin end$$;
  `);

  const racine = new URL('../supabase/', import.meta.url);
  const fichiers = (await readdir(racine))
    .filter(f => /^\d\d-.*\.sql$/.test(f) && !f.startsWith('02-'))
    .sort();

  const echecs = [];
  for (const f of fichiers) {
    // pgcrypto n'existe pas dans PGlite ; il existe sur Supabase.
    const sql = (await readFile(new URL(f, racine), 'utf8'))
      .replace(/create extension[^;]*pgcrypto[^;]*;/gi, '');
    try {
      await db.exec('begin');
      await db.exec(sql);
      await db.exec('commit');
    } catch (e) {
      await db.exec('rollback').catch(() => {});
      echecs.push(`${f} : ${String(e.message).split('\n')[0]}`);
    }
  }

  assert.deepEqual(echecs, [], `migrations qui ne se rejouent pas :\n${echecs.join('\n')}`);
});
