-- Migration 44 — Recettes libres (saisie rapide DA multi-appareils)
-- Additive only. Idempotente et isolée par client_id.

begin;

create table if not exists public.recettes_libres (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 160),
  categorie text not null default 'Pâtisserie' check (char_length(categorie) <= 80),
  parts integer not null default 1 check (parts >= 1 and parts <= 10000),
  frais_fixes_da numeric(12,2) not null default 0 check (frais_fixes_da >= 0 and frais_fixes_da <= 100000000),
  prix_vente_da numeric(12,2) null check (prix_vente_da is null or (prix_vente_da >= 0 and prix_vente_da <= 100000000)),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  statut_prix text not null default 'valide' check (statut_prix in ('valide', 'a_verifier_patron', 'bloque')),
  cree_par uuid null references auth.users(id) on delete set null,
  modifie_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recettes_libres_client_idx
  on public.recettes_libres (client_id, updated_at desc);

alter table public.recettes_libres enable row level security;

revoke all on public.recettes_libres from public, anon;
grant select, insert, update, delete on public.recettes_libres to authenticated, service_role;

drop policy if exists recettes_libres_select on public.recettes_libres;
create policy recettes_libres_select on public.recettes_libres
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

drop policy if exists recettes_libres_insert on public.recettes_libres;
create policy recettes_libres_insert on public.recettes_libres
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists recettes_libres_update on public.recettes_libres;
create policy recettes_libres_update on public.recettes_libres
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists recettes_libres_delete on public.recettes_libres;
create policy recettes_libres_delete on public.recettes_libres
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

commit;
