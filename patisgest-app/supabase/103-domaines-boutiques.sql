-- =====================================================================
-- Migration 25 — Domaines des boutiques en ligne (prérequis vitrine)
--
-- Objectif produit : chaque pâtisserie a un sous-domaine gratuit
-- (`elyasmine.patisgest.dz`), et l'offre Pro peut recevoir son propre
-- domaine (`patisserie-elyasmine.com`) via un CNAME → Cloudflare for SaaS.
--
-- ⚠️ Trois corrections par rapport au plan « évident » qu'on lit souvent :
--
--  1. `subdomain NOT NULL` casserait tout : la base pilote contient déjà
--     2 sites sans sous-domaine. La colonne est donc NULLABLE, et la
--     contrainte finale n'exige un sous-domaine QUE pour les sites dont
--     la vitrine est publiée (`publication <> 'aucune'`).
--
--  2. Un sous-domaine n'existe pas en double dans le monde : un client
--     pouvait prendre « el-yasmine » avant qu'un autre ne le veuille.
--     Le format est donc verrouillé (minuscules, chiffres, tirets) pour
--     qu'il soit aussi un nom DNS valide, et la réservation se fait via
--     une RPC (migration suivante) et non par un UPDATE direct.
--
--  3. Pas de `UNIQUE` global sur `custom_domain` sans normalisation : la
--     casse et le « www. » créeraient deux entrées pour le même site.
--     On normalise en minuscules et on interdit le préfixe www. : le
--     visiteur arrive sur le domaine nu, il n'y a rien à distinguer.
--
-- Rien n'est publié par cette migration : elle prépare le schéma. Le
-- routage par hôte est un chantier distinct (voir NOTE-COUT-MINIMAL.md).
-- Idempotent : rejouable.
-- =====================================================================

begin;

-- ------------------------------------------------------- sous-domaine
alter table public.sites
  add column if not exists subdomain text,
  add column if not exists custom_domain text,
  -- 'aucune' = pas de vitrine ; 'brouillon' = réservée, pas visible ;
  -- 'publiee' = la vitrine répond. Le défaut protège les sites existants :
  -- deux boutiques ne deviennent pas publiques par accident.
  add column if not exists publication text not null default 'aucune',
  add column if not exists vitrine_publiee_le timestamptz;

-- Contraintes de forme, nommées pour être modifiables plus tard.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_subdomain_forme') then
    alter table public.sites add constraint sites_subdomain_forme
      check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sites_custom_domain_forme') then
    alter table public.sites add constraint sites_custom_domain_forme
      check (
        custom_domain is null
        or (
          custom_domain = lower(custom_domain)
          and custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
          and custom_domain not like 'www.%'
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sites_publication_valeurs') then
    alter table public.sites add constraint sites_publication_valeurs
      check (publication in ('aucune', 'brouillon', 'publiee'));
  end if;

  -- Une vitrine publiée DOIT avoir une adresse : sinon elle serait
  -- inaccessible tout en apparaissant comme publiée dans l'interface.
  if not exists (select 1 from pg_constraint where conname = 'sites_publiee_a_une_adresse') then
    alter table public.sites add constraint sites_publiee_a_une_adresse
      check (publication <> 'publiee' or subdomain is not null or custom_domain is not null);
  end if;
end $$;

-- --------------------------------------------------------- unicité
-- Un sous-domaine est unique dans TOUT le service, pas par client :
-- il devient un nom DNS. Index partiels : les NULL restent autorisés.
create unique index if not exists sites_subdomain_unique
  on public.sites (lower(subdomain)) where subdomain is not null;

create unique index if not exists sites_custom_domain_unique
  on public.sites (lower(custom_domain)) where custom_domain is not null;

-- Résolution `host → site` : c'est la requête faite à CHAQUE visite
-- d'une vitrine. Sans cet index, chaque page vue balaie tous les sites.
create index if not exists sites_publication_idx
  on public.sites (publication) where publication = 'publiee';

-- ------------------------------------------------- mots réservés
-- Un client ne doit pas pouvoir prendre « app », « api », « www »… :
-- ces noms portent l'application elle-même.
create table if not exists public.sous_domaines_reserves (
  nom text primary key,
  raison text
);

insert into public.sous_domaines_reserves (nom, raison) values
  ('www', 'site principal'),
  ('app', 'application de gestion'),
  ('api', 'API'),
  ('admin', 'administration'),
  ('mail', 'e-mail'),
  ('smtp', 'e-mail'),
  ('ftp', 'transfert de fichiers'),
  ('cdn', 'assets'),
  ('static', 'assets'),
  ('assets', 'assets'),
  ('status', 'page de statut'),
  ('support', 'support'),
  ('aide', 'support'),
  ('blog', 'contenu'),
  ('demo', 'démonstration'),
  ('test', 'test'),
  ('staging', 'recette'),
  ('dev', 'développement'),
  ('patisgest', 'marque')
on conflict (nom) do nothing;

-- Lecture publique nécessaire ? Non : cette table ne contient aucune
-- donnée personnelle, mais elle est lue par la fonction de réservation
-- (SECURITY DEFINER) et non par le client. RLS activée sans policy =
-- invisible pour `anon` et `authenticated`, ce qui est le but.
alter table public.sous_domaines_reserves enable row level security;

-- ------------------------------------------------------ cohérence
-- Le site doit appartenir au même client que le sous-domaine réservé :
-- impossible de réserver pour un autre établissement.
create or replace function public.patisgest_reserver_sous_domaine(
  p_site_id uuid,
  p_sous_domaine text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_nom text := lower(trim(coalesce(p_sous_domaine, '')));
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  if public.patisgest_mon_role() not in ('proprietaire') then
    raise exception 'Réservé au propriétaire.';
  end if;

  select s.client_id into v_client
    from public.sites s
   where s.id = p_site_id
     and s.client_id = public.patisgest_mon_client();
  if v_client is null then
    raise exception 'Site introuvable dans cet établissement.';
  end if;

  if v_nom !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'Sous-domaine invalide : minuscules, chiffres et tirets uniquement.';
  end if;
  if length(v_nom) < 3 then
    raise exception 'Sous-domaine trop court (3 caractères minimum).';
  end if;
  if exists (select 1 from public.sous_domaines_reserves r where r.nom = v_nom) then
    raise exception 'Ce sous-domaine est réservé.';
  end if;
  if exists (
    select 1 from public.sites s
     where lower(s.subdomain) = v_nom and s.id <> p_site_id
  ) then
    raise exception 'Ce sous-domaine est déjà pris.';
  end if;

  update public.sites
     set subdomain = v_nom
   where id = p_site_id;
end;
$$;

revoke all on function public.patisgest_reserver_sous_domaine(uuid, text) from public;
grant execute on function public.patisgest_reserver_sous_domaine(uuid, text) to authenticated;

commit;

-- ------------------------------------------------ vérification
-- Doit renvoyer 4 colonnes et 5 contraintes (les 3 existantes + 3 ajoutées,
-- moins celles déjà présentes) :
--
--   select column_name from information_schema.columns
--    where table_name = 'sites'
--      and column_name in ('subdomain','custom_domain','publication','vitrine_publiee_le');
--
--   select conname from pg_constraint
--    where conrelid = 'public.sites'::regclass and conname like 'sites_%';
--
-- Les 2 sites existants restent à publication = 'aucune' : aucune vitrine
-- n'est ouverte par cette migration.
