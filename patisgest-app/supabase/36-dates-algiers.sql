-- =====================================================================
-- 36 — Dates métier à Oran (revue F-04, partie SQL).
--
-- Problème : `current_date` suit le fuseau de la session, en UTC côté Supabase.
-- Entre 23 h et minuit à Oran (UTC+1), une vente, un mouvement ou une réception
-- reçoivent la date du lendemain… ou de la veille selon l'heure : la journée
-- comptable est décalée.
--
-- Correction : toutes les occurrences `current_date` des fonctions publiques et
-- les valeurs par défaut de colonnes sont remplacées par la date du fuseau
-- Africa/Algiers. Réécriture par la définition installée (pg_get_functiondef),
-- avec gardes : toute forme inattendue fait échouer la migration entière.
--
-- Limite connue : les VUES publiques contenant `current_date` font échouer la
-- migration (non réécrites ici) ; à auditer avant de relancer.
-- Rejouable : sans occurrence restante, la migration ne change rien.
-- =====================================================================
begin;

do $migration$
declare
  r        record;
  remplacement constant text := '(now() at time zone ''Africa/Algiers'')::date';
  n_defauts integer := 0;
  n_fonctions integer := 0;
begin
  if exists (
    select 1 from pg_views v
     where v.schemaname = 'public'
       and pg_get_viewdef(format('%I.%I', v.schemaname, v.viewname)::regclass) ~* '\mcurrent_date\M'
  ) then
    raise exception 'Vue publique contenant current_date : audit manuel requis avant 36.';
  end if;

  for r in
    select c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid) as expr
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      join pg_class c on c.oid = d.adrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and pg_get_expr(d.adbin, d.adrelid) ~* '\mcurrent_date\M'
  loop
    if lower(trim(r.expr)) <> 'current_date' then
      raise exception 'Défaut inattendu sur %.% : % — audit manuel requis.', r.relname, r.attname, r.expr;
    end if;
    execute format('alter table public.%I alter column %I set default %s', r.relname, r.attname, remplacement);
    n_defauts := n_defauts + 1;
  end loop;

  for r in
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')  -- pg_get_functiondef refuse les agrégats
       and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  loop
    execute regexp_replace(r.def, '\mcurrent_date\M', remplacement, 'gi');
    n_fonctions := n_fonctions + 1;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind in ('f', 'p') and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  ) then
    raise exception 'current_date subsiste dans une fonction publique après 36.';
  end if;

  raise notice '36 : % défaut(s) et % fonction(s) réécrites', n_defauts, n_fonctions;
end
$migration$;

do $version$
begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Table app_schema_version absente : appliquer 35 avant 36.';
  end if;
end
$version$;

insert into public.app_schema_version (id, version)
values (1, 36)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

commit;
