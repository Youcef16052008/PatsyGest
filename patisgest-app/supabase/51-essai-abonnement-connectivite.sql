-- Migration 51 — Mode d'essai (60 à 90 jours, défaut 90), verrouillage permanent,
-- espace Master, suivi de connectivité et alertes >1h (SMS / WhatsApp).
-- Additive only. Idempotente.

begin;

-- ---------------------------------------------------------------------------
-- 1. Colonnes d'essai & abonnement sur public.clients
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists statut_abonnement text not null default 'essai',
  add column if not exists essai_duree_jours integer not null default 90,
  add column if not exists essai_debut_at timestamptz not null default now(),
  add column if not exists essai_fin_at timestamptz not null default (now() + interval '90 days'),
  add column if not exists paye_at timestamptz,
  add column if not exists paye_par_master text,
  add column if not exists license_version integer not null default 1;

do $$ begin
  alter table public.clients
    add constraint clients_statut_abonnement_chk
    check (statut_abonnement in ('essai', 'paye', 'suspendu'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.clients
    add constraint clients_essai_duree_jours_chk
    check (essai_duree_jours between 60 and 90);
exception when duplicate_object then null;
end $$;

create or replace function public.patisgest_clients_essai_bi()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_duree integer;
  v_debut timestamptz;
begin
  v_duree := least(90, greatest(60, coalesce(new.essai_duree_jours, 90)));
  v_debut := coalesce(new.essai_debut_at, now());
  new.essai_duree_jours := v_duree;
  new.essai_debut_at := v_debut;
  new.essai_fin_at := v_debut + make_interval(days => v_duree);
  new.statut_abonnement := coalesce(new.statut_abonnement, 'essai');
  new.license_version := coalesce(new.license_version, 1);
  return new;
end;
$$;

drop trigger if exists trg_clients_essai_bi on public.clients;
create trigger trg_clients_essai_bi
  before insert on public.clients
  for each row execute function public.patisgest_clients_essai_bi();
revoke all on function public.patisgest_clients_essai_bi() from public, anon;
grant execute on function public.patisgest_clients_essai_bi() to service_role;

create or replace function public.patisgest_clients_essai_protect()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_jwt_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
begin
  -- Seules les opérations serveur privilégiées (service_role / postgres)
  -- peuvent modifier le statut d'essai ou marquer le compte comme payé.
  if v_jwt_role = 'authenticated' or (auth.uid() is not null and v_jwt_role <> 'service_role') then
    if new.statut_abonnement is distinct from old.statut_abonnement
       or new.essai_duree_jours is distinct from old.essai_duree_jours
       or new.essai_debut_at is distinct from old.essai_debut_at
       or new.essai_fin_at is distinct from old.essai_fin_at
       or new.paye_at is distinct from old.paye_at
       or new.paye_par_master is distinct from old.paye_par_master
       or new.license_version is distinct from old.license_version then
      raise exception 'Modification de la licence réservée à l’espace Master.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_clients_essai_protect on public.clients;
create trigger trg_clients_essai_protect
  before update on public.clients
  for each row execute function public.patisgest_clients_essai_protect();
revoke all on function public.patisgest_clients_essai_protect() from public, anon;
grant execute on function public.patisgest_clients_essai_protect() to service_role;

-- ---------------------------------------------------------------------------
-- 2. Colonnes téléphone & présence sur public.utilisateurs
-- ---------------------------------------------------------------------------
alter table public.utilisateurs
  add column if not exists telephone text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists offline_alert_sent_at timestamptz,
  add column if not exists offline_alert_count integer not null default 0;

do $$ begin
  alter table public.utilisateurs
    add constraint utilisateurs_telephone_len_chk
    check (telephone is null or char_length(telephone) <= 40);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Journal des alertes de déconnexion (>1h)
-- ---------------------------------------------------------------------------
create table if not exists public.connectivite_alertes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  role text not null,
  utilisateur_nom text,
  telephone_cible text,
  canaux jsonb not null default '[]'::jsonb,
  statut text not null default 'envoye' check (statut in ('envoye', 'partiel', 'echec', 'simulation')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_connectivite_alertes_client_created
  on public.connectivite_alertes (client_id, created_at desc);

alter table public.connectivite_alertes enable row level security;
revoke all on public.connectivite_alertes from public, anon, authenticated;

drop policy if exists connectivite_alertes_select_owner on public.connectivite_alertes;
create policy connectivite_alertes_select_owner on public.connectivite_alertes
  for select using (
    exists (
      select 1 from public.utilisateurs u
       where u.auth_user_id = auth.uid()
         and u.client_id = connectivite_alertes.client_id
         and u.role = 'proprietaire'
    )
  );

grant select on public.connectivite_alertes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPCs essai, présence et création d'espace
-- ---------------------------------------------------------------------------
create or replace function public.lire_statut_essai_client()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_rec record;
  v_verrouille boolean;
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;

  select
    c.id as client_id,
    c.nom as client_nom,
    c.statut_abonnement,
    c.essai_duree_jours,
    c.essai_debut_at,
    c.essai_fin_at,
    c.paye_at,
    c.license_version,
    u.id as utilisateur_id,
    u.role::text as role,
    u.telephone as utilisateur_telephone
  into v_rec
  from public.utilisateurs u
  join public.clients c on c.id = u.client_id
  where u.auth_user_id = v_auth
  limit 1;

  if not found then
    raise exception 'Compte introuvable.' using errcode = '42501';
  end if;

  v_verrouille := (
    v_rec.statut_abonnement = 'suspendu'
    or (v_rec.statut_abonnement = 'essai' and now() >= v_rec.essai_fin_at)
  );

  return jsonb_build_object(
    'client_id', v_rec.client_id,
    'client_nom', v_rec.client_nom,
    'statut_abonnement', v_rec.statut_abonnement,
    'essai_duree_jours', v_rec.essai_duree_jours,
    'essai_debut_at', v_rec.essai_debut_at,
    'essai_fin_at', v_rec.essai_fin_at,
    'paye_at', v_rec.paye_at,
    'license_version', v_rec.license_version,
    'server_now', now(),
    'verrouille', v_verrouille,
    'utilisateur_id', v_rec.utilisateur_id,
    'role', v_rec.role,
    'utilisateur_telephone', v_rec.utilisateur_telephone
  );
end;
$$;
revoke all on function public.lire_statut_essai_client() from public, anon;
grant execute on function public.lire_statut_essai_client() to authenticated, service_role;

create or replace function public.enregistrer_presence_utilisateur(p_telephone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_tel text;
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;

  if p_telephone is not null then
    v_tel := nullif(left(trim(p_telephone), 40), '');
    update public.utilisateurs
       set last_seen_at = now(),
           offline_alert_sent_at = null,
           telephone = v_tel
     where auth_user_id = v_auth;
  else
    update public.utilisateurs
       set last_seen_at = now(),
           offline_alert_sent_at = null
     where auth_user_id = v_auth;
  end if;

  return public.lire_statut_essai_client();
end;
$$;
revoke all on function public.enregistrer_presence_utilisateur(text) from public, anon;
grant execute on function public.enregistrer_presence_utilisateur(text) to authenticated, service_role;

create or replace function public.definir_telephone_utilisateur(p_telephone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_tel text := nullif(left(trim(coalesce(p_telephone, '')), 40), '');
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;
  update public.utilisateurs
     set telephone = v_tel
   where auth_user_id = v_auth;
  if not found then
    raise exception 'Compte introuvable.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true, 'telephone', v_tel);
end;
$$;
revoke all on function public.definir_telephone_utilisateur(text) from public, anon;
grant execute on function public.definir_telephone_utilisateur(text) to authenticated, service_role;

create or replace function public.creer_espace_patisserie(
  p_nom_etablissement text,
  p_nom_proprietaire text,
  p_telephone text default null,
  p_duree_essai integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_email text;
  v_nom_etab text := trim(coalesce(p_nom_etablissement, ''));
  v_nom_prop text := trim(coalesce(p_nom_proprietaire, ''));
  v_tel text := nullif(left(trim(coalesce(p_telephone, '')), 40), '');
  v_duree integer := least(90, greatest(60, coalesce(p_duree_essai, 90)));
  v_client uuid;
  v_site_labo uuid;
  v_site_boutique uuid;
  v_user_id uuid;
  v_fin timestamptz;
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;
  if char_length(v_nom_etab) < 2 or char_length(v_nom_etab) > 100 then
    raise exception 'Nom d’établissement invalide (2 à 100 caractères).';
  end if;
  if char_length(v_nom_prop) < 2 or char_length(v_nom_prop) > 100 then
    raise exception 'Nom du propriétaire invalide (2 à 100 caractères).';
  end if;

  if exists(select 1 from public.utilisateurs where auth_user_id = v_auth) then
    raise exception 'Un espace existe déjà pour ce compte.';
  end if;

  select lower(email) into v_email
    from auth.users
   where id = v_auth and deleted_at is null;
  if v_email is null then
    raise exception 'Utilisateur Auth introuvable.';
  end if;

  insert into public.clients (
    nom, telephone, offre, statut_abonnement, essai_duree_jours, essai_debut_at, essai_fin_at
  )
  values (
    v_nom_etab,
    v_tel,
    'solo',
    'essai',
    v_duree,
    now(),
    now() + make_interval(days => v_duree)
  )
  returning id, essai_fin_at into v_client, v_fin;

  insert into public.sites (client_id, nom, type)
  values (v_client, 'Laboratoire', 'laboratoire')
  returning id into v_site_labo;

  insert into public.sites (client_id, nom, type)
  values (v_client, 'Boutique', 'boutique')
  returning id into v_site_boutique;

  insert into public.utilisateurs (
    auth_user_id, client_id, email, nom, role, telephone, last_seen_at
  )
  values (
    v_auth, v_client, v_email, v_nom_prop, 'proprietaire', v_tel, now()
  )
  returning id into v_user_id;

  insert into public.equipe_sites (utilisateur_id, site_id)
  values (v_user_id, v_site_labo), (v_user_id, v_site_boutique)
  on conflict do nothing;

  return jsonb_build_object(
    'client_id', v_client,
    'utilisateur_id', v_user_id,
    'essai_duree_jours', v_duree,
    'essai_fin_at', v_fin
  );
end;
$$;
revoke all on function public.creer_espace_patisserie(text, text, text, integer) from public, anon;
grant execute on function public.creer_espace_patisserie(text, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Version du schéma
-- ---------------------------------------------------------------------------
insert into public.app_schema_version (id, version) values (1, 51)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

commit;
