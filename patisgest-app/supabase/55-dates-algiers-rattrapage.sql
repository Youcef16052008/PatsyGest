-- =====================================================================
-- Migration 55 — Rattrapage F-04 : date métier dans les fonctions créées
-- APRÈS la migration 36.
--
-- 36 remplaçait `current_date` par `(now() at time zone 'Africa/Algiers')::date`
-- dans les défauts de colonnes et les fonctions présentes à ce moment-là.
-- Les migrations 41 (`enregistrer_avoir`) et 47/50 (`valider_tiroir_jour`)
-- ont ensuite réintroduit `current_date` : entre 23 h et minuit UTC, un
-- avoir ou un comptage de tiroir prenait la date UTC de la veille.
--
-- Correctif additif et rejouable : on ne réécrit aucune migration appliquée.
-- On reprend la définition installée de chaque fonction publique contenant
-- encore `current_date`, on remplace l'occurrence par la date d'Alger, puis on
-- vérifie qu'il n'en reste aucune. Les droits, `SECURITY DEFINER`,
-- `search_path` et le langage sont conservés par `CREATE OR REPLACE`.
--
-- Prérequis : 36 et 35 (app_schema_version). Aucune vue publique avec
-- `current_date` n'est tolérée : une vue serait figée et exigerait un audit.
-- =====================================================================

begin;

do $migration$
declare
  r record;
  n integer := 0;
  remplacement constant text := '(now() at time zone ''Africa/Algiers'')::date';
begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 55 : table app_schema_version absente (migration 35 requise).';
  end if;
  if exists (
    select 1 from pg_views v
     where v.schemaname = 'public'
       and pg_get_viewdef(format('%I.%I', v.schemaname, v.viewname)::regclass) ~* '\mcurrent_date\M'
  ) then
    raise exception 'Migration 55 : vue publique contenant current_date, audit manuel requis.';
  end if;

  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  loop
    execute regexp_replace(r.def, '\mcurrent_date\M', remplacement, 'gi');
    n := n + 1;
  end loop;

  if exists (
    select 1 from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  ) then
    raise exception 'Migration 55 : current_date subsiste après réécriture.';
  end if;

  raise notice 'Migration 55 : % fonction(s) repassées en date Africa/Algiers.', n;
end $migration$;

insert into public.app_schema_version (id, version) values (1, 55)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

commit;
