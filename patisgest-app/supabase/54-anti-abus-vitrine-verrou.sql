-- =====================================================================
-- Migration 54 — Verrou transactionnel anti-abus vitrine (H04-06).
--
-- La migration 38 insère la visite AVANT de compter les lignes de la même
-- source, sans verrou. Deux transactions concurrentes peuvent donc toutes
-- deux lire un compte <= 10 et laisser passer une 11e/12e demande.
--
-- Correctif additif : on ne réécrit PAS la migration 38 déjà appliquée. On
-- remplace uniquement le corps de `patisgest_verifier_source_vitrine` par une
-- version qui prend un verrou advisory de transaction, borné au couple
-- (établissement, source), AVANT la purge/insertion/comptage. Les autres
-- sources et les autres boutiques ne partagent pas ce verrou.
--
-- `pg_advisory_xact_lock` se libère à la fin de la transaction PostgREST :
-- une requête qui échoue ne laisse donc pas de verrou session bloquant.
-- Le comportement métier et les droits de la fonction restent inchangés.
--
-- Idempotente, rejouable. Prérequis : 38 et 35 (app_schema_version).
-- =====================================================================

begin;

do $$
begin
  if to_regprocedure('public.patisgest_verifier_source_vitrine(text,text)') is null then
    raise exception 'Migration 54 : patisgest_verifier_source_vitrine absente (migration 38 requise).';
  end if;
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 54 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

create or replace function public.patisgest_verifier_source_vitrine(
  p_sous_domaine text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_nb int;
begin
  if p_source is null or p_source !~ '^[0-9a-f]{32,128}$' then
    raise exception 'Référence de connexion invalide.';
  end if;

  select s.client_id into v_client
    from public.sites s
   where lower(s.subdomain) = lower(trim(coalesce(p_sous_domaine, '')))
     and s.publication = 'publiee'
   limit 1;
  if v_client is null then
    raise exception 'Vitrine introuvable ou non publiée.';
  end if;

  -- Sérialise uniquement les vérifications du même couple boutique/source.
  -- `hashtext` est volontairement qualifié pg_catalog : search_path est vide.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_client::text || ':' || p_source)::bigint
  );

  delete from public.vitrine_sources_recentes r
   where r.client_id = v_client and r.created_at < now() - interval '2 hours';

  insert into public.vitrine_sources_recentes (client_id, source_hash)
  values (v_client, p_source);

  select count(*) into v_nb
    from public.vitrine_sources_recentes r
   where r.client_id = v_client and r.source_hash = p_source
     and r.created_at > now() - interval '1 hour';
  if v_nb > 10 then
    raise exception 'Trop de demandes depuis votre connexion. Merci de réessayer plus tard ou d''appeler la boutique.';
  end if;
end;
$$;

revoke all on function public.patisgest_verifier_source_vitrine(text, text) from public;
grant execute on function public.patisgest_verifier_source_vitrine(text, text)
  to anon, authenticated, service_role;

insert into public.app_schema_version (id, version) values (1, 54)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

commit;
