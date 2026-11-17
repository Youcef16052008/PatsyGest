-- =====================================================================
-- PâtisGest — Sprint 1 : socle (clients, utilisateurs, sites + RLS)
-- À exécuter UNE fois dans Supabase > SQL Editor > Run.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table clients (
  id uuid primary key default gen_random_uuid(),
  nom text not null,
  adresse text,
  telephone text,
  nif text,
  nis text,
  rc text,
  offre text not null default 'solo',
  created_at timestamptz not null default now()
);

do $$ begin
  create type role_utilisateur as enum ('proprietaire', 'labo', 'vendeur');
exception when duplicate_object then null;
end $$;

create table utilisateurs (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique,
  client_id uuid not null references clients (id),
  email text not null,
  nom text,
  role role_utilisateur not null default 'vendeur',
  created_at timestamptz not null default now()
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id),
  nom text not null,
  type text not null default 'laboratoire',
  adresse text,
  created_at timestamptz not null default now()
);

-- ---------- Sécurité RLS (isolement strict par client) ----------
alter table clients enable row level security;
alter table utilisateurs enable row level security;
alter table sites enable row level security;

-- clients : lecture = son propre client
create policy "clients_select_own" on clients
  for select using (
    id in (select client_id from utilisateurs where auth_user_id = auth.uid())
  );

-- clients : modification = propriétaire uniquement
create policy "clients_update_owner" on clients
  for update using (
    exists (
      select 1 from utilisateurs u
      where u.auth_user_id = auth.uid()
        and u.client_id = clients.id
        and u.role = 'proprietaire'
    )
  );

-- utilisateurs : chacun lit sa propre ligne ; rôle et client ne sont pas modifiables par l’utilisateur
create policy "utilisateurs_select_own" on utilisateurs
  for select using (auth_user_id = auth.uid());


-- sites : lecture = sites de son client
create policy "sites_select_client" on sites
  for select using (
    client_id in (select client_id from utilisateurs where auth_user_id = auth.uid())
  );

-- sites : écriture = propriétaire + labo
create policy "sites_insert_staff" on sites
  for insert with check (
    exists (
      select 1 from utilisateurs u
      where u.auth_user_id = auth.uid()
        and u.client_id = sites.client_id
        and u.role in ('proprietaire', 'labo')
    )
  );

create policy "sites_update_staff" on sites
  for update using (
    exists (
      select 1 from utilisateurs u
      where u.auth_user_id = auth.uid()
        and u.client_id = sites.client_id
        and u.role in ('proprietaire', 'labo')
    )
  );
