-- =====================================================================
-- Migration 28 — Fermeture des droits `anon` sur les tables internes
--
-- Constat mesuré sur la base pilote (2026-11-19) :
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'cakes' and grantee = 'anon';
--   → INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--
-- Autrement dit : `anon` (la clé publique, embarquée dans le navigateur)
-- possédait les droits DML complets sur `cakes`, `articles`, `sites`,
-- `recette_familles`, `recette_versions`… Aujourd'hui rien ne fuit, parce
-- que la RLS est active partout et qu'aucune policy ne vise `anon` ou
-- `public` : mesuré, `anon` lit 0 ligne. Mais c'est une protection par un
-- seul verrou. Une policy ajoutée par distraction (`to public`, `to anon`,
-- ou un oubli de `to authenticated`) ouvrirait immédiatement la table.
--
-- La vitrine est le premier écran qui rend la clé `anon` réellement utile
-- et donc réellement attractive : on ajoute le second verrou AVANT.
--
-- Portée : `anon` perd tout droit sur les tables internes. Il conserve :
--   * `select` sur `public.vitrine_catalogue` (la vue publique, 26) ;
--   * `execute` sur `public.patisgest_demander_commande` (27).
-- `authenticated` et `service_role` ne changent pas.
--
-- Idempotent : rejouable.
-- =====================================================================

begin;

-- On boucle sur les tables du schéma public pour ne pas dépendre d'une
-- liste écrite à la main qui se périmerait à la prochaine table créée.
-- Les vues sont incluses séparément : `anon` doit les perdre aussi, sauf
-- `vitrine_catalogue` regrantée explicitement en fin de migration.
do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
       and c.relname <> 'vitrine_catalogue'
  loop
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;

-- Les séquences aussi (reconstruites par défaut après un `pg_restore`).
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon', r.relname);
  end loop;
end $$;

-- Les fonctions : `anon` ne garde que la RPC de dépôt de commande et les
-- fonctions d'aide non sensibles déjà accordées à `authenticated`.
-- On révoque tout, puis on regrante le strict nécessaire pour que l'état
-- soit identique après n'importe quel `pg_restore`.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'patisgest_demander_commande'
  loop
    execute format('revoke all on function %s from anon', r.sig);
  end loop;
end $$;

-- La vue publique reste lisible par un visiteur non connecté.
grant select on public.vitrine_catalogue to anon;

commit;

-- ------------------------------------------------ vérification
--   -- 0 table interne lisible par anon
--   begin; set local role anon;
--     select count(*) from public.clients;          -- 0
--     select count(*) from public.cakes;            -- 0
--     select count(*) from public.vitrine_catalogue;-- N (dès qu'une vitrine est publiée)
--   rollback;
--
--   -- exactement une fonction exécutable par anon
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');
