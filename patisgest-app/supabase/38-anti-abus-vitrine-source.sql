-- =====================================================================
-- 38 — Anti-abus vitrine par source (revue B-008).
--
-- Problème : 27 limite à 30 demandes par heure pour TOUT l'établissement.
-- Un seul robot bloque donc toutes les demandes légitimes.
--
-- Correction :
--   1. patisgest_verifier_source_vitrine(sous_domaine, source) : appelée par le
--      serveur avant la demande. `source` est un HMAC de l'IP calculé côté
--      serveur avec un secret ; la base ne voit jamais l'IP. Plafond : 10
--      demandes par heure et par source et par établissement. Les lignes sont
--      purgées au bout de 2 heures.
--   2. Le plafond global de 27 passe de 30 à 300 par heure : il ne sert plus
--      qu'à borner un afflux massif. Garde stricte : échec si le corps installé
--      diffère de celui attendu.
--
-- Limite connue : le plafond par source ne protège pas contre un botnet qui
-- change d'adresse. Cela relève de la limitation au bord (hébergeur), hors base.
--
-- Rejouable. Prérequis : 27 et 32 (patisgest_demander_commande installée).
-- =====================================================================
begin;

do $$
begin
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is null then
    raise exception 'Migration 38 : patisgest_demander_commande absente (migrations 27 et 32 requises).';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_schema_version') then
    raise exception 'Migration 38 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

create table if not exists public.vitrine_sources_recentes (
  client_id    uuid        not null references public.clients(id) on delete cascade,
  source_hash  text        not null check (source_hash ~ '^[0-9a-f]{32,128}$'),
  created_at   timestamptz not null default now()
);
create index if not exists vitrine_sources_recentes_idx
  on public.vitrine_sources_recentes (client_id, source_hash, created_at);

-- Données de contrôle : aucun accès direct, seulement via la fonction ci-dessous.
alter table public.vitrine_sources_recentes enable row level security;
revoke all on public.vitrine_sources_recentes from public, anon, authenticated;

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

  delete from public.vitrine_sources_recentes r
   where r.client_id = v_client and r.created_at < now() - interval '2 hours';

  insert into public.vitrine_sources_recentes (client_id, source_hash) values (v_client, p_source);

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
grant execute on function public.patisgest_verifier_source_vitrine(text, text) to anon, authenticated, service_role;

-- Plafond global : 30 -> 300 (garde stricte, une seule occurrence attendue).
do $migration$
declare
  definition text;
  corrigee text;
  n integer;
  ancien constant text := 'if v_flux >= 30 then';
  nouveau constant text := 'if v_flux >= 300 then';
begin
  select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
    into definition;
  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà relevé : rejouable sans effet
  else
    raise exception 'Plafond global de patisgest_demander_commande inattendu (occurrences : %) : audit manuel requis.', n;
  end if;
end
$migration$;

insert into public.app_schema_version (id, version)
values (1, 38)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

commit;
