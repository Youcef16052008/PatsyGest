-- ===== 01-socle.sql =====
-- =====================================================================
-- PâtisGest — Sprint 1 : socle (clients, utilisateurs, sites + RLS)
-- À exécuter UNE fois dans Supabase > SQL Editor > Run.
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

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

-- ===== 03-sprint2-modules.sql =====
-- =====================================================================
-- PâtisGest — Sprint 2+ : Tables métier & RLS (isolement par client_id)
-- Couvre : Fournisseurs, Articles (3 niveaux), Lots FEFO, Mouvements immuables,
-- Historique prix, Bons de commande, Recettes versionnées, Ordres de fabrication,
-- Ventes & Caisse, Clôtures 6 flux, Cake Design, HACCP, Transferts & Planning.
-- =====================================================================

create table if not exists fournisseurs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  code text,
  nom text not null,
  contact text,
  telephone text,
  email text,
  score integer not null default 4,
  delai_jours integer not null default 1,
  created_at timestamptz not null default now()
);

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  code text not null,
  nom text not null,
  niveau text not null default 'matiere',
  unite text not null default 'kg',
  seuil numeric(12,3) not null default 0,
  pv_ht numeric(12,2) not null default 0,
  tva numeric(5,2) not null default 19,
  allergenes text[] not null default '{}',
  traces text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (client_id, code)
);

create table if not exists lots (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  article_id uuid not null references articles (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  fournisseur_id uuid references fournisseurs (id) on delete set null,
  numero text not null,
  qte_init numeric(12,4) not null,
  qte_rest numeric(12,4) not null,
  pu numeric(12,2) not null default 0,
  dlc date,
  date_reception date not null default current_date,
  ref text,
  congele boolean not null default false,
  bloque boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists mouvements (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  article_id uuid not null references articles (id) on delete cascade,
  lot_id uuid references lots (id) on delete set null,
  site_id uuid not null references sites (id) on delete cascade,
  type text not null,
  qte numeric(12,4) not null,
  pu numeric(12,2) not null default 0,
  ref text,
  motif text,
  date_mvt date not null default current_date,
  created_at timestamptz not null default now()
);

create table if not exists historique_prix (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  article_id uuid not null references articles (id) on delete cascade,
  fournisseur_id uuid references fournisseurs (id) on delete set null,
  date_prix date not null default current_date,
  pu numeric(12,2) not null,
  created_at timestamptz not null default now()
);

create table if not exists bons_commande (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  fournisseur_id uuid not null references fournisseurs (id) on delete cascade,
  numero text not null,
  date_bc date not null default current_date,
  statut text not null default 'commande',
  lignes jsonb not null default '[]'::jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists recette_familles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  code text not null,
  nom text not null,
  produit_id uuid references articles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists recette_versions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  famille_id uuid not null references recette_familles (id) on delete cascade,
  version integer not null default 1,
  rendement_qte numeric(12,3) not null default 1,
  rendement_unite text not null default 'pcs',
  cuisson_perte_pct numeric(5,2) not null default 0,
  mo_min numeric(8,2) not null default 0,
  energie numeric(12,2) not null default 0,
  emballage numeric(12,2) not null default 0,
  frais_generaux numeric(12,2) not null default 0,
  ingredients jsonb not null default '[]'::jsonb,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists ordres_fabrication (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  famille_id uuid not null references recette_familles (id) on delete cascade,
  version_id uuid not null references recette_versions (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  numero text not null,
  qte_prevue numeric(12,3) not null,
  qte_realisee numeric(12,3) not null default 0,
  date_prevue date not null default current_date,
  date_lancement date,
  statut text not null default 'planifie',
  snapshot jsonb not null default '{}'::jsonb,
  besoins jsonb not null default '[]'::jsonb,
  consommations jsonb not null default '[]'::jsonb,
  manquants jsonb not null default '[]'::jsonb,
  lots_produits jsonb not null default '[]'::jsonb,
  cout_reel numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists ventes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  numero text not null,
  ticket text not null,
  date_vente date not null default current_date,
  source text not null default 'caisse',
  lignes jsonb not null default '[]'::jsonb,
  manquants jsonb not null default '[]'::jsonb,
  total_ht numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists clotures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  site_id uuid not null references sites (id) on delete cascade,
  date_cloture date not null default current_date,
  lignes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists cakes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  numero text not null,
  client_nom text not null,
  telephone text,
  date_event date not null,
  nb_parts integer not null default 20,
  options jsonb not null default '[]'::jsonb,
  prix_ht numeric(12,2) not null default 0,
  acompte numeric(12,2) not null default 0,
  statut text not null default 'devis',
  cgv boolean not null default false,
  notes text,
  retro jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists releve_temperatures (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  date_releve date not null default current_date,
  frigo_id text not null,
  frigo_nom text not null,
  seuil_max numeric(6,2) not null default 4,
  temperature numeric(6,2) not null,
  agent text,
  created_at timestamptz not null default now()
);

create table if not exists nettoyages (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  date_nettoyage date not null default current_date,
  zone text not null,
  fait boolean not null default true,
  agent text,
  created_at timestamptz not null default now()
);

create table if not exists non_conformites (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  date_nc date not null default current_date,
  type text not null,
  description text not null,
  lot_numero text,
  action text,
  statut text not null default 'Ouverte',
  created_at timestamptz not null default now()
);

create table if not exists transferts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  date_transfert date not null default current_date,
  from_site_id uuid not null references sites (id) on delete cascade,
  to_site_id uuid not null references sites (id) on delete cascade,
  motif text,
  lignes jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists taches_planning (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  date_tache date not null default current_date,
  tache text not null,
  of_numero text,
  duree_min integer not null default 60,
  responsable text,
  fait boolean not null default false,
  created_at timestamptz not null default now()
);

do $$
declare
  t text;
begin
  foreach t in array array[
    'fournisseurs','articles','lots','mouvements','historique_prix','bons_commande',
    'recette_familles','recette_versions','ordres_fabrication','ventes','clotures',
    'cakes','releve_temperatures','nettoyages','non_conformites','transferts','taches_planning'
  ] loop
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists "%I_tenant_isolation" on %I;', t, t);
    execute format('drop policy if exists %I on %I;', t || '_tenant_read', t);
    execute format('create policy %I on %I for select to authenticated using (client_id in (select client_id from utilisateurs where auth_user_id = auth.uid()));', t || '_tenant_read', t);
  end loop;
end $$;

-- ===== 04-securite-lecture.sql =====
-- Restreint les tables Sprint 2 en lecture jusqu'à la validation des politiques
-- d'écriture (rôles, références inter-client et opérations transactionnelles).

drop policy if exists utilisateurs_update_own on public.utilisateurs;
do $$ declare t text; begin
  foreach t in array array['fournisseurs','articles','lots','mouvements','historique_prix','bons_commande','recette_familles','recette_versions','ordres_fabrication','ventes','clotures','cakes','releve_temperatures','nettoyages','non_conformites','transferts','taches_planning'] loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (client_id in (select client_id from public.utilisateurs where auth_user_id = auth.uid()))', t || '_tenant_read', t);
  end loop;
end $$;

-- ===== 05-ecritures-articles-lots.sql =====
-- =====================================================================
-- PâtisGest — Sprint 2 : écritures transactionnelles (articles, lots, mouvements)
-- À exécuter UNE fois dans Supabase > SQL Editor > Run.
--
-- Principes :
--   * Écritures réservées aux rôles proprietaire et labo, strictement
--     limitées au client de l'appelant (pas de cross-tenant, y compris
--     via les clés étrangères article_id / site_id / fournisseur_id).
--   * Aucune politique UPDATE/DELETE sur mouvements : journal immuable.
--   * Aucun DELETE sur articles/lots : la suppression est interdite.
--   * réception atomique (lot + mouvement) via une fonction RPC.
--   * Contraintes CHECK pour interdire les quantités négatives.
-- Idempotent : peut être relancé.
-- =====================================================================

-- ---------- Helpers (SECURITY INVOKER par défaut : voient la ligne
-- ---------- propre de l'appelant grâce à la RLS sur utilisateurs) ----------
create or replace function public.patisgest_mon_client()
returns uuid
language sql
stable
as $$
  select u.client_id from public.utilisateurs u where u.auth_user_id = auth.uid() limit 1
$$;

create or replace function public.patisgest_mon_role()
returns text
language sql
stable
as $$
  select u.role::text from public.utilisateurs u where u.auth_user_id = auth.uid() limit 1
$$;

-- ---------- Contraintes de cohérence (données existantes vérifiées : 0 négatif) ----------
alter table public.lots drop constraint if exists lots_qte_positive;
alter table public.lots add constraint lots_qte_positive check (qte_init > 0 and qte_rest >= 0);

-- ---------- Articles : création / mise à jour (propriétaire + labo) ----------
drop policy if exists articles_tenant_insert on public.articles;
create policy articles_tenant_insert on public.articles
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists articles_tenant_update on public.articles;
create policy articles_tenant_update on public.articles
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- ---------- Lots : réception / correction (propriétaire + labo) ----------
-- with_check : le lot, l'article, le site et le fournisseur appartiennent
-- tous au client de l'appelant (protection anti cross-tenant par FK).
drop policy if exists lots_tenant_insert on public.lots;
create policy lots_tenant_insert on public.lots
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and exists (select 1 from public.articles a where a.id = article_id and a.client_id = public.patisgest_mon_client())
    and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.patisgest_mon_client())
    and (fournisseur_id is null or exists (select 1 from public.fournisseurs f where f.id = fournisseur_id and f.client_id = public.patisgest_mon_client()))
  );

drop policy if exists lots_tenant_update on public.lots;
create policy lots_tenant_update on public.lots
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and exists (select 1 from public.articles a where a.id = article_id and a.client_id = public.patisgest_mon_client())
    and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.patisgest_mon_client())
    and (fournisseur_id is null or exists (select 1 from public.fournisseurs f where f.id = fournisseur_id and f.client_id = public.patisgest_mon_client()))
  );

-- ---------- Mouvements : INSERT seul (journal immuable, pas d'UPDATE/DELETE) ----------
drop policy if exists mouvements_tenant_insert on public.mouvements;
create policy mouvements_tenant_insert on public.mouvements
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and exists (select 1 from public.articles a where a.id = article_id and a.client_id = public.patisgest_mon_client())
    and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.patisgest_mon_client())
    and (lot_id is null or exists (select 1 from public.lots l where l.id = lot_id and l.client_id = public.patisgest_mon_client()))
  );

-- ---------- RPC : réception atomique lot + mouvement ----------
create or replace function public.receptionner_lot(
  p_article_id uuid,
  p_site_id uuid,
  p_numero text,
  p_qte numeric,
  p_pu numeric,
  p_dlc date default null,
  p_fournisseur_id uuid default null,
  p_ref text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client uuid;
  v_lot uuid;
  v_numero text;
begin
  v_numero := trim(coalesce(p_numero, ''));
  if p_article_id is null or p_site_id is null then
    raise exception 'Article et site sont obligatoires.';
  end if;
  if length(v_numero) < 1 or length(v_numero) > 80 then
    raise exception 'Numéro de lot invalide (1 à 80 caractères).';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantité invalide.';
  end if;
  if p_pu is null or p_pu < 0 or p_pu > 100000000 then
    raise exception 'Prix unitaire invalide.';
  end if;
  if p_ref is not null and length(trim(p_ref)) > 80 then
    raise exception 'Référence trop longue.';
  end if;

  select u.client_id into v_client from public.utilisateurs u where u.auth_user_id = auth.uid() limit 1;
  if v_client is null then
    raise exception 'Non authentifié.';
  end if;

  -- La RLS (lots_tenant_insert) vérifie à nouveau tenant + rôle + FK.
  insert into public.lots (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, ref)
  values (v_client, p_article_id, p_site_id, p_fournisseur_id, v_numero, p_qte, p_qte, p_pu, p_dlc, nullif(trim(coalesce(p_ref, '')), ''))
  returning id into v_lot;

  insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
  values (v_client, p_article_id, v_lot, p_site_id, 'reception', p_qte, p_pu, v_numero, 'Réception');

  return v_lot;
end;
$$;

-- L'appelant doit être authentifié : anon ne peut pas appeler la réception.
revoke execute on function public.receptionner_lot(uuid, uuid, text, numeric, numeric, date, uuid, text) from public, anon;
grant execute on function public.receptionner_lot(uuid, uuid, text, numeric, numeric, date, uuid, text) to authenticated, service_role;

-- ===== 06-ventes-caisse-fefo.sql =====
-- =====================================================================
-- PatisGest - Sprint 2 : ventes caisse avec consommation FEFO atomique
-- A executer UNE fois dans Supabase > SQL Editor > Run.
--
-- Principes :
--   * Les ventes passent UNIQUEMENT par la fonction vendre_article()
--     (SECURITY DEFINER avec frontiere d'autorisation testee) qui cree
--     la vente, decremente les lots FEFO et ecrit les mouvements dans
--     UNE transaction ; aucune politique INSERT sur ventes.
--   * Tous les gestes internes sont revalide : appelant authentifie,
--     role autorise, article/site/lot du MEME client, quantite valide.
--   * Idempotence : unique (client_id, ticket) + rejeu du meme ticket.
--   * Les lots sont verrouilles (FOR UPDATE) : pas de survente.
--   * Aucun DELETE/UPDATE sur mouvements (journal immuable).
-- Idempotent : peut etre relance.
-- =====================================================================

-- Index d'idempotence (2 ventes existantes, tickets deja distincts).
create unique index if not exists ventes_client_ticket_key
  on public.ventes (client_id, ticket);

create or replace function public.vendre_article(
  p_article_id uuid,
  p_site_id uuid,
  p_qte numeric,
  p_ticket text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_article_client uuid;
  v_article_tva numeric;
  v_article_pv numeric;
  v_site_client uuid;
  v_existing uuid;
  v_sale_id uuid;
  v_numero text;
  v_ticket text;
  v_remaining numeric;
  v_missing numeric := 0;
  v_take numeric;
  v_total_ht numeric;
  v_total_ttc numeric;
  v_consumed jsonb := '[]'::jsonb;
  v_lignes jsonb;
  v_manquants jsonb := '[]'::jsonb;
  r record;
begin
  -- ---- validation des entrees ----
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_article_id is null or p_site_id is null then
    raise exception 'Article et site obligatoires.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;
  v_ticket := trim(coalesce(p_ticket, ''));
  if length(v_ticket) < 1 or length(v_ticket) > 80 then
    raise exception 'Ticket invalide.';
  end if;

  -- ---- appelant : tenant + role (definer => controles explicites) ----
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a vendre.';
  end if;

  -- ---- idempotence : meme ticket => meme vente ----
  select id into v_existing
    from public.ventes
   where client_id = v_client and ticket = v_ticket
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('sale_id', v_existing, 'duplicate', true, 'missing', 0, 'totalHT', 0, 'totalTTC', 0, 'lots', '[]'::jsonb);
  end if;

  -- ---- perimetre tenant : article et site ----
  select a.client_id, a.tva, a.pv_ht into v_article_client, v_article_tva, v_article_pv
    from public.articles a where a.id = p_article_id;
  if v_article_client is null then
    raise exception 'Article introuvable.';
  end if;
  if v_article_client <> v_client then
    raise exception 'Article hors perimetre.';
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then
    raise exception 'Site introuvable.';
  end if;
  if v_site_client <> v_client then
    raise exception 'Site hors perimetre.';
  end if;

  if v_article_pv is null or v_article_pv < 0 or v_article_tva is null or v_article_tva < 0 or v_article_tva > 100 then
    raise exception ' Prix ou TVA article invalide.';
  end if;

  v_remaining := round(p_qte, 4);
  v_numero := 'V-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);

  -- ---- insertion d'abord (garantit l'atomicite de l'idempotence) ----
  begin
    insert into public.ventes (client_id, site_id, numero, ticket, date_vente, source, lignes, manquants, total_ht, total_ttc)
    values (v_client, p_site_id, v_numero, v_ticket, current_date, 'caisse', '[]'::jsonb, '[]'::jsonb, 0, 0)
    returning id into v_sale_id;
  exception when unique_violation then
    select id into v_existing
      from public.ventes
     where client_id = v_client and ticket = v_ticket
     limit 1;
    return jsonb_build_object('sale_id', coalesce(v_existing, v_sale_id), 'duplicate', true, 'missing', 0, 'totalHT', 0, 'totalTTC', 0, 'lots', '[]'::jsonb);
  end;

  -- ---- consommation FEFO (lots verrouilles, perimetre tenant) ----
  for r in
    select l.id, l.qte_rest, l.numero
      from public.lots l
     where l.client_id = v_client
       and l.article_id = p_article_id
       and l.site_id = p_site_id
       and not l.bloque
       and l.qte_rest > 0
     order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
       for update
  loop
    exit when v_remaining <= 0;
    v_take := least(r.qte_rest, v_remaining);
    update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
    v_remaining := round(v_remaining - v_take, 4);
    v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, r.id, p_site_id, 'vente', -v_take, v_article_pv, v_ticket, 'Vente');
  end loop;

  -- ---- manque : ecart sans lot, jamais de stock negatif ----
  if v_remaining > 0 then
    v_missing := v_remaining;
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, null, p_site_id, 'vente', -v_remaining, v_article_pv, v_ticket, 'Vente sans stock');
    v_manquants := jsonb_build_array(jsonb_build_object('articleId', p_article_id, 'qty', v_remaining));
  end if;

  -- ---- totaux en centimes coherents (somme arrondie) ----
  v_total_ht := round(p_qte * v_article_pv, 2);
  v_total_ttc := round(p_qte * v_article_pv * (1 + v_article_tva / 100), 2);
  v_lignes := jsonb_build_array(jsonb_build_object(
    'articleId', p_article_id,
    'qty', p_qte,
    'pu', v_article_pv,
    'tva', v_article_tva,
    'totalHT', v_total_ht,
    'totalTTC', v_total_ttc,
    'lots', v_consumed,
    'missing', v_missing
  ));

  update public.ventes v
     set lignes = v_lignes,
         manquants = v_manquants,
         total_ht = v_total_ht,
         total_ttc = v_total_ttc
   where v.id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'duplicate', false,
    'missing', v_missing,
    'totalHT', v_total_ht,
    'totalTTC', v_total_ttc,
    'lots', v_consumed
  );
end;
$$;

-- Frontiere d'autorisation : execution uniquement pour les roles applicatifs.
revoke execute on function public.vendre_article(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.vendre_article(uuid, uuid, numeric, text) to authenticated, service_role;

-- ===== 07-of-production.sql =====
-- =====================================================================
-- PatisGest - Sprint 2 : ordres de fabrication
--   * creer_of      : cree l'OF avec les besoins figes (recette versionnee)
--   * demarrer_of   : consomme les besoins en FEFO sur le site de l'OF,
--                     journalise manquants et mouvements (une transaction)
--   * terminer_of   : recoit le lot produit au cout connu, avance le statut
-- Toutes les ecritures passent par ces fonctions (SECURITY DEFINER,
-- frontiere d'autorisation testee) : aucune politique INSERT/UPDATE
-- sur ordres_fabrication. Rejouable (idempotent au niveau DDL).
-- =====================================================================

-- Contrainte de statut (valeurs existantes conformes).
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ordres_fabrication_statut_valid'
      and conrelid = 'public.ordres_fabrication'::regclass
  ) then
    alter table public.ordres_fabrication
      add constraint ordres_fabrication_statut_valid
      check (statut in ('planifie', 'encours', 'partiel', 'termine'));
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Creation d'OF : les besoins sont recalcules COTE SERVEUR a partir de
-- la version de recette figee (le client ne fournit jamais les besoins).
-- ---------------------------------------------------------------------
create or replace function public.creer_of(
  p_version_id uuid,
  p_site_id uuid,
  p_qte_prevue numeric,
  p_date_prevue date,
  p_client_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_famille uuid;
  v_fam_client_check uuid;
  v_produit uuid;
  v_fam_nom text;
  v_ver_client uuid;
  v_version integer;
  v_rendement numeric;
  v_ingredients jsonb;
  v_site_client uuid;
  v_scale numeric;
  v_besoins jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_numero text;
  v_of_id uuid;
  v_code text;
  v_qty numeric;
  v_article uuid;
  b jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_version_id is null or p_site_id is null then
    raise exception 'Recette et site obligatoires.';
  end if;
  if p_qte_prevue is null or p_qte_prevue <= 0 or p_qte_prevue > 100000000 then
    raise exception 'Quantite prevue invalide.';
  end if;
  if p_date_prevue is null then
    raise exception 'Date prevue obligatoire.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a creer des OF.';
  end if;

  -- Idempotence hors-ligne : un meme client_ref ne cre jamais2 OF
  -- (resynchronisation de la file sans reseau ->0 doublon).
  if p_client_ref is not null and length(p_client_ref) between 1 and 64 then
    select o.id, o.numero, o.besoins into v_of_id, v_numero, v_besoins
      from public.ordres_fabrication o
     where o.client_id = v_client and o.client_ref = p_client_ref
     limit 1;
    if v_of_id is not null then
      return jsonb_build_object('of_id', v_of_id, 'numero', v_numero,
        'besoins', coalesce(v_besoins, '[]'::jsonb), 'duplicate', true);
    end if;
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then
    raise exception 'Site introuvable.';
  end if;
  if v_site_client <> v_client then
    raise exception 'Site hors perimetre.';
  end if;

  select rv.client_id, rv.famille_id, rv.version, rv.rendement_qte, rv.ingredients
    into v_ver_client, v_famille, v_version, v_rendement, v_ingredients
    from public.recette_versions rv where rv.id = p_version_id;
  if v_ver_client is null then
    raise exception 'Version de recette introuvable.';
  end if;
  if v_ver_client <> v_client then
    raise exception 'Version hors perimetre.';
  end if;

  select rf.client_id, rf.produit_id, rf.nom into v_fam_client_check, v_produit, v_fam_nom
    from public.recette_familles rf where rf.id = v_famille;
  if not found then
    raise exception 'Famille de recette introuvable.';
  end if;
  if v_fam_client_check <> v_client then
    raise exception 'Famille hors perimetre.';
  end if;
  if v_ingredients is null or jsonb_typeof(v_ingredients) <> 'array'
     or jsonb_array_length(v_ingredients) = 0 then
    raise exception 'Recette sans ingredients.';
  end if;
  if v_produit is null then
    raise exception 'Produit de la famille introuvable.';
  end if;

  v_scale := case when coalesce(v_rendement, 0) > 0 then p_qte_prevue / v_rendement else 1 end;

  -- Besoins etendus cote serveur : articles (avec parage + conversions
  -- d'unites) OU sous-recettes en version figee (profondeur max3), doublons
  -- fusionnes. Le client ne fournit jamais les besoins.
  v_besoins := public.patisgest_besoins_de_version(v_client, p_version_id, v_scale, 0);

  v_numero := 'OF-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_snapshot := jsonb_build_object(
    'recette', v_fam_nom,
    'version', v_version,
    'produitId', v_produit,
    'scale', v_scale
  );

  insert into public.ordres_fabrication
    (client_id, famille_id, version_id, site_id, numero, qte_prevue,
     qte_realisee, date_prevue, date_lancement, statut, snapshot, besoins,
     consommations, manquants, lots_produits, cout_reel, client_ref)
  values
    (v_client, v_famille, p_version_id, p_site_id, v_numero, p_qte_prevue,
     0, p_date_prevue, null, 'planifie', v_snapshot, v_besoins,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0,
     nullif(trim(coalesce(p_client_ref, '')), ''))
  returning id into v_of_id;

  return jsonb_build_object('of_id', v_of_id, 'numero', v_numero,
    'besoins', v_besoins, 'duplicate', false);
end;
$$;

-- ---------------------------------------------------------------------
-- Lancement : consommation FEFO des besoins sur le site de l'OF.
-- Les lots sont verrouilles (FOR UPDATE) : pas de double consommation.
-- Les manques sont journalises (mouvement sans lot), jamais bloquants.
-- ---------------------------------------------------------------------
create or replace function public.demarrer_of(p_of_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_of record;
  v_consommations jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  v_article uuid;
  v_code text;
  v_remaining numeric;
  v_take numeric;
  v_lot record;
  b jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_of_id is null then
    raise exception 'OF obligatoire.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise.';
  end if;

  select o.* into v_of from public.ordres_fabrication o
   where o.id = p_of_id
     for update;
  if not found then
    raise exception 'OF introuvable.';
  end if;
  if v_of.client_id <> v_client then
    raise exception 'OF hors perimetre.';
  end if;
  if v_of.statut <> 'planifie' then
    raise exception 'OF non planifie.';
  end if;
  if v_of.besoins is null or jsonb_typeof(v_of.besoins) <> 'array'
     or jsonb_array_length(v_of.besoins) = 0 then
    raise exception 'OF sans besoins.';
  end if;

  for b in select value from jsonb_array_elements(v_of.besoins) loop
    begin
      v_article := (b->>'articleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Article ingredient invalide.';
    end;
    if v_article is null then
      raise exception 'Article ingredient manquant.';
    end if;
    select a.id, a.code into v_article, v_code from public.articles a
     where a.id = v_article and a.client_id = v_client
     limit 1;
    if not found then
      raise exception 'Article ingredient introuvable.';
    end if;

    v_remaining := (b->>'qty')::numeric;
    if v_remaining is null or v_remaining <= 0 then
      raise exception 'Besoin invalide.';
    end if;

    for v_lot in
      select l.id, l.numero, l.qte_rest, l.pu
        from public.lots l
       where l.client_id = v_client
         and l.article_id = v_article
         and l.site_id = v_of.site_id
         and not l.bloque
         and l.qte_rest > 0
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = v_lot.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consommations := v_consommations || jsonb_build_object(
        'articleId', v_article,
        'code', v_code,
        'lotId', v_lot.id,
        'numero', v_lot.numero,
        'qty', v_take,
        'pu', coalesce(v_lot.pu, 0),
        'puEstime', coalesce(v_lot.pu, 0) <= 0
      );
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_article, v_lot.id, v_of.site_id, 'production', -v_take, coalesce(v_lot.pu, 0), v_of.numero, 'Production');
    end loop;

    if v_remaining > 0 then
      v_manquants := v_manquants || jsonb_build_object(
        'articleId', v_article,
        'code', v_code,
        'qty', v_remaining
      );
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_article, null, v_of.site_id, 'production', -v_remaining, 0, v_of.numero, 'Production sans stock');
    end if;
  end loop;

  update public.ordres_fabrication o
     set statut = 'encours',
         date_lancement = coalesce(o.date_lancement, current_date),
         consommations = v_consommations,
         manquants = v_manquants
   where o.id = p_of_id;

  return jsonb_build_object(
    'of_id', p_of_id,
    'numero', v_of.numero,
    'consommations', jsonb_array_length(v_consommations),
    'manquants', jsonb_array_length(v_manquants)
  );
end;
$$;

-- ---------------------------------------------------------------------
-- Cloture partielle ou totale : recoit le lot produit au cout connu
-- (matiere consommee + hors-œuvre par unite ; la main-d'oeuvre n'est pas
-- calculable sans taux horaire -> cout des couts connus uniquement).
-- ---------------------------------------------------------------------
create or replace function public.terminer_of(
  p_of_id uuid,
  p_qte numeric,
  p_numero_lot text,
  p_dlc date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_of record;
  v_produit uuid;
  v_rendement numeric;
  v_energie numeric;
  v_emballage numeric;
  v_frais numeric;
  v_numero text;
  v_rest numeric;
  v_known numeric := 0;
  v_pu_estime boolean := false;
  v_overhead_unit numeric := 0;
  v_per_unit numeric;
  v_lot_id uuid;
  v_block boolean := false;
  v_cout_estime boolean := false;
  v_new_statut text;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_of_id is null then
    raise exception 'OF obligatoire.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite realisee invalide.';
  end if;
  v_numero := trim(coalesce(p_numero_lot, ''));
  if length(v_numero) < 1 or length(v_numero) > 80 then
    raise exception 'Numero de lot invalide.';
  end if;
  if p_dlc is null or p_dlc < current_date then
    raise exception 'DLC invalide (doit etre au moins au jour).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise.';
  end if;

  select o.* into v_of from public.ordres_fabrication o
   where o.id = p_of_id
     for update;
  if not found then
    raise exception 'OF introuvable.';
  end if;
  if v_of.client_id <> v_client then
    raise exception 'OF hors perimetre.';
  end if;
  if v_of.statut not in ('encours', 'partiel') then
    raise exception 'OF non lance.';
  end if;

  v_rest := v_of.qte_prevue - v_of.qte_realisee;
  if p_qte > v_rest then
    raise exception 'Quantite superieure au reste a produire.';
  end if;

  select rf.produit_id, rv.rendement_qte, rv.energie, rv.emballage, rv.frais_generaux
    into v_produit, v_rendement, v_energie, v_emballage, v_frais
    from public.recette_familles rf
    join public.recette_versions rv on rv.id = v_of.version_id
   where rf.id = v_of.famille_id
     and rf.client_id = v_client;
  if not found or v_produit is null then
    raise exception 'Recette introuvable.';
  end if;

  select coalesce(sum((t.val->>'qty')::numeric * coalesce((t.val->>'pu')::numeric, 0)), 0),
         coalesce(bool_or(coalesce((t.val->>'pu')::numeric, 0) <= 0), false)
    into v_known, v_pu_estime
    from jsonb_array_elements(coalesce(v_of.consommations, '[]'::jsonb)) as t(val);

  v_overhead_unit := case when coalesce(v_rendement, 0) > 0
    then (coalesce(v_energie, 0) + coalesce(v_emballage, 0) + coalesce(v_frais, 0)) / v_rendement
    else 0 end;
  v_per_unit := round(v_known / p_qte + v_overhead_unit, 2);
  if v_per_unit < 0 then
    v_per_unit := 0;
  end if;

  select exists(
    select 1
      from jsonb_array_elements(coalesce(v_of.consommations, '[]'::jsonb)) as t(val)
      join public.lots l on l.id = (t.val->>'lotId')::uuid
     where l.bloque
  ) into v_block;

  v_cout_estime := jsonb_array_length(coalesce(v_of.manquants, '[]'::jsonb)) > 0 or v_pu_estime;

  insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, dlc, date_reception, ref, bloque)
  values (v_client, v_produit, v_of.site_id, v_numero, p_qte, p_qte, v_per_unit, p_dlc, current_date, v_of.numero, v_block)
  returning id into v_lot_id;

  insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
  values (v_client, v_produit, v_lot_id, v_of.site_id, 'production', p_qte, v_per_unit, v_of.numero, 'Production');

  v_new_statut := case when v_of.qte_realisee + p_qte >= v_of.qte_prevue
    then 'termine' else 'partiel' end;

  update public.ordres_fabrication o
     set qte_realisee = o.qte_realisee + p_qte,
         statut = v_new_statut,
         lots_produits = o.lots_produits || jsonb_build_object(
           'lotId', v_lot_id, 'numero', v_numero, 'qty', p_qte),
         cout_reel = o.cout_reel + round(v_per_unit * p_qte, 2)
   where o.id = p_of_id;

  return jsonb_build_object(
    'of_id', p_of_id,
    'numero', v_of.numero,
    'lot_id', v_lot_id,
    'qte', p_qte,
    'cout_unitaire', v_per_unit,
    'cout_estime', v_cout_estime,
    'statut', v_new_statut,
    'lot_bloque', v_block
  );
end;
$$;

-- Frontiere d'autorisation : execution uniquement roles applicatifs.
-- rejeu: surcharge 4 args absente
-- rejeu: droits portes par la signature 5 args
revoke execute on function public.demarrer_of(uuid) from public, anon;
grant execute on function public.demarrer_of(uuid) to authenticated, service_role;
revoke execute on function public.terminer_of(uuid, numeric, text, date) from public, anon;
grant execute on function public.terminer_of(uuid, numeric, text, date) to authenticated, service_role;

-- ===== 08-transferts.sql =====
-- =====================================================================
-- PatisGest - Sprint 2 : transferts de stock entre sites
--   * transferer_article : consomme en FEFO sur le site de depart et
--     recree les lots miroirs (meme numero, DLC, PU, congele) sur le
--     site d'arrivee, avec les deux mouvements, en UNE transaction.
-- Contrairement aux ventes et aux OF, un transfert ne peut PAS creer
-- de manque : le stock disponible (hors lots bloques) doit couvrir la
-- quantite. Toutes les ecritures passent par la fonction (SECURITY
-- DEFINER, frontiere d'autorisation testee) : aucune politique
-- INSERT/UPDATE sur transferts. Rejouable (idempotent au niveau DDL).
-- =====================================================================

create or replace function public.transferer_article(
  p_article_id uuid,
  p_from_site_id uuid,
  p_to_site_id uuid,
  p_qte numeric,
  p_motif text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_article_client uuid;
  v_from_client uuid;
  v_to_client uuid;
  v_available numeric;
  v_remaining numeric;
  v_take numeric;
  v_transfert_id uuid;
  v_ref text;
  v_lignes jsonb := '[]'::jsonb;
  v_ligne jsonb;
  v_lot record;
  v_dest_id uuid;
  v_motif text;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_article_id is null or p_from_site_id is null or p_to_site_id is null then
    raise exception 'Article et sites obligatoires.';
  end if;
  if p_from_site_id = p_to_site_id then
    raise exception 'Sites de depart et d arrivee distincts requis.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;
  v_motif := nullif(trim(coalesce(p_motif, '')), '');
  if v_motif is not null and length(v_motif) > 120 then
    raise exception 'Motif trop long (120 caractères maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a transférer.';
  end if;

  select a.client_id into v_article_client from public.articles a where a.id = p_article_id;
  if v_article_client is null then
    raise exception 'Article introuvable.';
  end if;
  if v_article_client <> v_client then
    raise exception 'Article hors perimetre.';
  end if;

  select s.client_id into v_from_client from public.sites s where s.id = p_from_site_id;
  if v_from_client is null then
    raise exception 'Site de depart introuvable.';
  end if;
  if v_from_client <> v_client then
    raise exception 'Site de depart hors perimetre.';
  end if;

  select s.client_id into v_to_client from public.sites s where s.id = p_to_site_id;
  if v_to_client is null then
    raise exception 'Site d arrivee introuvable.';
  end if;
  if v_to_client <> v_client then
    raise exception 'Site d arrivee hors perimetre.';
  end if;

  -- Stock disponible au depart (hors lots bloques) : pas de manque autorisé.
  select coalesce(sum(l.qte_rest), 0) into v_available
    from public.lots l
   where l.client_id = v_client
     and l.article_id = p_article_id
     and l.site_id = p_from_site_id
     and not l.bloque
     and l.qte_rest > 0;
  if p_qte > v_available then
    raise exception '%', 'Stock disponible insuffisant pour ce transfert (disponible : ' || v_available || ').';
  end if;

  v_remaining := round(p_qte, 4);
  v_ref := 'TR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  for v_lot in
    select l.id, l.numero, l.qte_rest, l.pu, l.dlc, l.congele, l.date_reception, l.fournisseur_id
      from public.lots l
     where l.client_id = v_client
       and l.article_id = p_article_id
       and l.site_id = p_from_site_id
       and not l.bloque
       and l.qte_rest > 0
     order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
       for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.qte_rest, v_remaining);
    update public.lots l set qte_rest = l.qte_rest - v_take where l.id = v_lot.id;
    v_remaining := round(v_remaining - v_take, 4);

    insert into public.lots
      (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, date_reception, ref, congele, bloque)
    values
      (v_client, p_article_id, p_to_site_id, v_lot.fournisseur_id, v_lot.numero, v_take, v_take,
       v_lot.pu, v_lot.dlc, v_lot.date_reception, v_ref, v_lot.congele, false)
    returning id into v_dest_id;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, v_lot.id, p_from_site_id, 'transfert', -v_take, v_lot.pu, v_ref, 'Transfert');
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, v_dest_id, p_to_site_id, 'transfert', v_take, v_lot.pu, v_ref, 'Transfert');

    v_ligne := jsonb_build_object(
      'articleId', p_article_id,
      'fromLotId', v_lot.id,
      'toLotId', v_dest_id,
      'numero', v_lot.numero,
      'qty', v_take
    );
    v_lignes := v_lignes || v_ligne;
  end loop;

  if v_remaining > 0 then
    raise exception 'Stock disponible insuffisant pour ce transfert.';
  end if;

  insert into public.transferts
    (client_id, date_transfert, from_site_id, to_site_id, motif, lignes)
  values
    (v_client, current_date, p_from_site_id, p_to_site_id, v_motif, v_lignes)
  returning id into v_transfert_id;

  return jsonb_build_object(
    'transfert_id', v_transfert_id,
    'ref', v_ref,
    'lots', jsonb_array_length(v_lignes),
    'qte', p_qte
  );
end;
$$;

revoke execute on function public.transferer_article(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transferer_article(uuid, uuid, uuid, numeric, text) to authenticated, service_role;

-- ===== 09-journaux-ecritures.sql =====
-- =====================================================================
-- Migration 09 — Journaux : clôture (six flux), qualité/HACCP,
-- planning, Cake Design. Écritures RLS + RPC sécurisées.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
-- =====================================================================

-- ------------------------------------------------- colonnes & contraintes
ALTER TABLE public.clotures ADD COLUMN IF NOT EXISTS revision integer DEFAULT 1; ALTER TABLE public.clotures ADD COLUMN IF NOT EXISTS agent_id uuid; ALTER TABLE public.clotures ALTER COLUMN revision SET DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS clotures_revision_unique
  ON public.clotures (client_id, date_cloture, site_id, revision);

ALTER TABLE public.non_conformites ADD COLUMN IF NOT EXISTS historique jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.cakes ADD COLUMN IF NOT EXISTS paiements jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Statuts NC : valeurs seed 'Ouverte'/'Clôturée' + minuscules (sans accent)
ALTER TABLE public.non_conformites DROP CONSTRAINT IF EXISTS non_conformites_statut_valid;
ALTER TABLE public.non_conformites ADD CONSTRAINT non_conformites_statut_valid
  CHECK (statut IN ('ouverte','cloturee','Ouverte','Clôturée'));

-- Statuts cakes alignés sur les transitions (devis/acompte/confirme/produit/livre/annule)
ALTER TABLE public.cakes DROP CONSTRAINT IF EXISTS cakes_statut_valid;
ALTER TABLE public.cakes ADD CONSTRAINT cakes_statut_valid
  CHECK (statut IN ('devis','acompte','confirme','produit','livre','annule'));

ALTER TABLE public.bons_commande DROP CONSTRAINT IF EXISTS bons_commande_statut_valid;
ALTER TABLE public.bons_commande ADD CONSTRAINT bons_commande_statut_valid
  CHECK (statut IN ('commande','partiel','recu'));

-- ------------------------------------------------- politiques RLS
CREATE POLICY insert_temp ON public.releve_temperatures
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

CREATE POLICY insert_nettoyage ON public.nettoyages
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

-- Mise à jour du pointeur « fait » (bascule de tâche/nettoyage)
CREATE POLICY update_nettoyage ON public.nettoyages
  FOR UPDATE TO authenticated USING (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'))
  WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

-- NC : le statut est imposé 'ouverte' à l'ouverture (passer par la RPC pour clôturer)
CREATE POLICY insert_non_conformite ON public.non_conformites
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo')
    AND statut IN ('ouverte','Ouverte'));

CREATE POLICY insert_tache ON public.taches_planning
  FOR INSERT TO authenticated WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

CREATE POLICY update_tache ON public.taches_planning
  FOR UPDATE TO authenticated USING (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'))
  WITH CHECK (
    client_id = public.patisgest_mon_client()
    AND public.patisgest_mon_role() IN ('proprietaire','labo'));

-- clotures / cakes / bons_commande / historique_prix : AUCUNE policy d'écriture
-- → écritures uniquement via les RPC security definer (clôture, cakes, commandes).

-- =====================================================================
-- RPC : saisir_cloture — clôture déclarative six flux avec révisions
-- =====================================================================
create or replace function public.saisir_cloture(
  p_date date, p_site_id uuid, p_lignes jsonb, p_revise boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_existing int;
  v_revision int := 1;
  l jsonb;
  v_article uuid;
  v_count int := 0;
  v_enriched jsonb := '[]'::jsonb;
  v_art record;
  v_produit numeric;
  v_out jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then
    raise exception 'Role non autorise.';
  end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Liste de produits invalide (1 a 100).';
  end if;

  select count(*) into v_existing from public.clotures c
    where c.client_id = v_client and c.date_cloture = p_date and c.site_id = p_site_id;
  if v_existing > 0 then
    if coalesce(p_revise, false) = false then
      raise exception 'Une cloture existe deja pour ce site et cette date. Cochez correction pour creer une nouvelle revision.';
    end if;
    select coalesce(max(c.revision), 0) + 1 into v_revision from public.clotures c
      where c.client_id = v_client and c.date_cloture = p_date and c.site_id = p_site_id;
  end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    begin
      v_article := (l->>'articleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Article de cloture invalide.';
    end;
    if v_count >= 100 then raise exception 'Trop de produits (100 maximum).'; end if;

    select a.id, a.code, a.nom, a.unite, a.pu_ht, a.niveau into v_art
      from public.articles a where a.id = v_article and a.client_id = v_client;
    if not found then raise exception 'Article introuvable ou hors perimetre.'; end if;
    if v_art.niveau <> 'produit' then raise exception 'Seuls les produits finis se cloturent.'; end if;

    v_produit := (l->>'produit')::numeric;
    if v_produit is null or v_produit < 0 or v_produit > 1000000000
       or v_produit <> round(v_produit, 4) then
      raise exception 'Quantite produite invalide.';
    end if;
    if coalesce((l->>'vendu')::numeric, -1) < 0 or coalesce((l->>'reporte')::numeric, -1) < 0
       or coalesce((l->>'jete')::numeric, -1) < 0 or coalesce((l->>'casse')::numeric, -1) < 0
       or coalesce((l->>'offert')::numeric, -1) < 0 then
      raise exception 'Flux negatif interdit.';
    end if;

    v_enriched := v_enriched || jsonb_build_object(
      'articleId', v_article,
      'code', v_art.code,
      'name', v_art.nom,
      'unit', v_art.unite,
      'priceHT', coalesce(v_art.pu_ht, 0),
      'produit', v_produit,
      'vendu', coalesce((l->>'vendu')::numeric, 0),
      'reporte', coalesce((l->>'reporte')::numeric, 0),
      'jete', coalesce((l->>'jete')::numeric, 0),
      'casse', coalesce((l->>'casse')::numeric, 0),
      'offert', coalesce((l->>'offert')::numeric, 0));
    v_count := v_count + 1;
  end loop;

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, agent_id)
  values (v_client, p_date, p_site_id, v_revision, v_enriched, v_auth)
  returning id into v_out;

  return jsonb_build_object(
    'cloture_id', v_out,
    'revision', v_revision,
    'lignes', v_count);
end;
$$;

revoke execute on function public.saisir_cloture(date, uuid, jsonb, boolean) from public, anon;
grant execute on function public.saisir_cloture(date, uuid, jsonb, boolean) to authenticated, service_role;

-- =====================================================================
-- RPC : maj_non_conformite — ouverture historisée / clôture avec action
-- =====================================================================
create or replace function public.maj_non_conformite(p_id uuid, p_statut text, p_action text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  nc record;
  v_new text;
  v_hist jsonb;
  v_action text := nullif(trim(coalesce(p_action, '')), '');
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  if p_statut not in ('ouverte','cloturee') then raise exception 'Statut invalide.'; end if;
  if length(coalesce(p_action, '')) > 500 then raise exception 'Action corrective trop longue (500 max).'; end if;

  select c.* into nc from public.non_conformites c where c.id = p_id for update;
  if not found then raise exception 'Non-conformite introuvable.'; end if;
  if nc.client_id <> v_client then raise exception 'Non-conformite hors perimetre.'; end if;

  if p_statut = 'cloturee' and v_action is null then
    raise exception 'Renseignez une action corrective avant de cloturer.';
  end if;

  v_new := case when lower(nc.statut) in ('ouverte') then 'ouverte' else 'cloturee' end;
  if p_statut = v_new then
    raise exception 'Statut deja applique.';
  end if;

  v_hist := coalesce(nc.historique, '[]'::jsonb) || jsonb_build_object(
    'at', now(), 'statut', p_statut, 'action', coalesce(v_action, ''));

  update public.non_conformites c
    set statut = p_statut,
        action = coalesce(nullif(trim(v_action), ''), c.action),
        historique = v_hist
   where c.id = p_id
   returning c.id, c.statut into nc;

  return jsonb_build_object('id', nc.id, 'statut', nc.statut);
end;
$$;

revoke execute on function public.maj_non_conformite(uuid, text, text) from public, anon;
grant execute on function public.maj_non_conformite(uuid, text, text) to authenticated, service_role;

-- =====================================================================
-- RPC : creer_cake — devis Cake Design (rétroplanning J-3/J-1/J)
-- =====================================================================
create or replace function public.creer_cake(
  p_client_nom text, p_telephone text, p_date_event date, p_nb_parts int,
  p_prix_ht numeric, p_options jsonb, p_notes text, p_cgv boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_id uuid;
  v_numero text;
  v_retro jsonb;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
  v_cout numeric;
  v_min int;
  v_nom text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;

  if p_client_nom is null or length(trim(p_client_nom)) < 1 or length(trim(p_client_nom)) > 100 then
    raise exception 'Nom du client requis (1 a 100 caracteres).';
  end if;
  if p_telephone is not null and length(p_telephone) > 40 then
    raise exception 'Telephone trop long (40 max).';
  end if;
  if p_date_event is null or p_date_event < DATE '2000-01-04' then
    raise exception 'Date d''evenement invalide.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 a 10000).';
  end if;
  if p_prix_ht is null or p_prix_ht <= 0 or p_prix_ht > 100000000000 then
    raise exception 'Prix HT invalide.';
  end if;
  if coalesce(p_notes, '') <> '' and length(p_notes) > 500 then
    raise exception 'Notes trop longues (500 max).';
  end if;

  if p_options is not null and jsonb_typeof(p_options) = 'array' then
    if jsonb_array_length(p_options) > 50 then
      raise exception 'Trop d''options (50 max).';
    end if;
    for o in select value from jsonb_array_elements(p_options) loop
      v_nom := trim(coalesce(o->>'name', ''));
      v_cout := (o->>'cout')::numeric;
      v_min := (o->>'minutes')::integer;
      if v_nom = '' or length(v_nom) > 100 then raise exception 'Option : nom requis (100 max).'; end if;
      if v_cout is null or v_cout < 0 or v_cout > 1000000000 then
        raise exception 'Option : cout invalide.'; end if;
      if v_min is null or v_min < 0 or v_min > 100000 then
        raise exception 'Option : duree invalide.'; end if;
      v_opts := v_opts || jsonb_build_object('name', v_nom, 'cout', v_cout, 'minutes', v_min);
    end loop;
  end if;

  v_numero := 'DEV-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_retro := jsonb_build_array(
    jsonb_build_object('date', p_date_event - 3, 'task', 'Valider le devis', 'done', false),
    jsonb_build_object('date', p_date_event - 1, 'task', 'Préparer structure + crémage', 'done', false),
    jsonb_build_object('date', p_date_event, 'task', 'Décorer + livrer', 'done', false));

  insert into public.cakes (
    client_id, numero, client_nom, telephone, date_event, retro, nb_parts,
    options, prix_ht, acompte, statut, notes, cgv, agent_id)
  values (
    v_client, v_numero, trim(p_client_nom), nullif(trim(coalesce(p_telephone, '')), ''),
    p_date_event, v_retro, p_nb_parts, v_opts, p_prix_ht, 0, 'devis',
    nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_cgv, false), v_auth)
  returning id into v_id;

  return jsonb_build_object('cake_id', v_id, 'numero', v_numero);
end;
$$;

revoke execute on function public.creer_cake(text, text, date, integer, numeric, jsonb, text, boolean) from public, anon;
grant execute on function public.creer_cake(text, text, date, integer, numeric, jsonb, text, boolean) to authenticated, service_role;

-- =====================================================================
-- RPC : evoluer_cake — paiements et transitions verrouillées
-- =====================================================================
create or replace function public.evoluer_cake(p_id uuid, p_transition text, p_montant numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  c record;
  v_paid numeric;
  v_new text;
  v_type text;
  v_montant numeric := nullif(p_montant, 0);
  v_req numeric;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_transition not in ('payer','confirme','produit','livre','annule') then
    raise exception 'Transition invalide.';
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;

  v_paid := coalesce(c.acompte, 0);

  if p_transition = 'payer' then
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Paiement impossible depuis le statut %.', c.statut;
    end if;
    if v_montant is null or v_montant <= 0 or v_montant > (c.prix_ht - v_paid) then
      raise exception 'Montant de paiement invalide.';
    end if;
    v_type := case when c.statut in ('devis','acompte') then 'acompte' else 'solde' end;
    update public.cakes k
      set acompte = v_paid + v_montant,
          paiements = coalesce(k.paiements, '[]'::jsonb) || jsonb_build_object(
            'at', now(), 'type', v_type, 'montant', v_montant, 'by', v_auth),
          statut = case when k.statut = 'devis' then 'acompte' else k.statut end
     where k.id = p_id
     returning k.statut into c;
    v_new := c.statut;

  elsif p_transition = 'confirme' then
    if c.statut <> 'acompte' then
      raise exception 'Confirmation possible uniquement depuis l''acompte (statut actuel : %).', c.statut;
    end if;
    v_req := ceil(c.prix_ht * 30)::numeric / 100;
    if v_paid < v_req then
      raise exception 'Acompte insuffisant : au moins % HT requis (30 %%).', v_req;
    end if;
    update public.cakes k set statut = 'confirme' where k.id = p_id returning k.statut into c;
    v_new := c.statut;

  elsif p_transition = 'produit' then
    if c.statut <> 'confirme' then
      raise exception 'Production possible uniquement depuis confirmé (statut actuel : %).', c.statut;
    end if;
    update public.cakes k set statut = 'produit' where k.id = p_id returning k.statut into c;
    v_new := c.statut;

  elsif p_transition = 'livre' then
    if c.statut <> 'produit' then
      raise exception 'Livraison possible uniquement depuis produit (statut actuel : %).', c.statut;
    end if;
    if v_paid < c.prix_ht then
      raise exception 'Le solde doit etre entierement enregistre avant livraison.';
    end if;
    update public.cakes k set statut = 'livre' where k.id = p_id returning k.statut into c;
    v_new := c.statut;

  else -- annule
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Annulation impossible depuis le statut %.', c.statut;
    end if;
    update public.cakes k set statut = 'annule' where k.id = p_id returning k.statut into c;
    v_new := c.statut;
  end if;

  return jsonb_build_object(
    'statut', v_new,
    'paid', v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0),
    'balance', c.prix_ht - (v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0)));
end;
$$;

revoke execute on function public.evoluer_cake(uuid, text, numeric) from public, anon;
grant execute on function public.evoluer_cake(uuid, text, numeric) to authenticated, service_role;

-- ===== 10-achats-commandes.sql =====
-- =====================================================================
-- Migration 10 — Achats : bons de commande multi-lignes + réceptions.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
-- (colonnes statut/lignes/notes déjà présentes ; contrôles ici)
-- =====================================================================

-- =====================================================================
-- RPC : creer_commande — BC multi-lignes (1..100), sans écriture RLS
-- =====================================================================
create or replace function public.creer_commande(
  p_fournisseur_id uuid,
  p_lignes jsonb,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_four_client uuid;
  v_numero text;
  v_id uuid;
  v_lignes jsonb := '[]'::jsonb;
  v_article uuid;
  v_qte numeric;
  v_pu numeric;
  l jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_fournisseur_id is null then raise exception 'Fournisseur obligatoire.'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) < 1
     or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Ajoutez au moins une ligne (100 maximum).';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Notes trop longues (500 caracteres maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  select f.client_id into v_four_client from public.fournisseurs f where f.id = p_fournisseur_id;
  if v_four_client is null then raise exception 'Fournisseur introuvable.'; end if;
  if v_four_client <> v_client then raise exception 'Fournisseur hors perimetre.'; end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    begin
      v_article := (l->>'articleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Article de ligne invalide.';
    end;
    v_qte := (l->>'qte')::numeric;
    v_pu := (l->>'pu')::numeric;
    if v_qte is null or v_qte <= 0 or v_qte > 100000000 then
      raise exception 'Quantite de ligne invalide.';
    end if;
    if v_pu is null or v_pu < 0 or v_pu > 100000000 then
      raise exception 'Prix unitaire de ligne invalide.';
    end if;
    if not exists (select 1 from public.articles a where a.id = v_article and a.client_id = v_client) then
      raise exception 'Article introuvable ou hors perimetre.';
    end if;
    v_lignes := v_lignes || jsonb_build_object('articleId', v_article, 'qte', v_qte, 'pu', v_pu, 'recu', 0);
  end loop;

  v_numero := 'BC-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  insert into public.bons_commande (client_id, fournisseur_id, numero, date_bc, statut, lignes, notes)
  values (v_client, p_fournisseur_id, v_numero, current_date, 'commande', v_lignes, nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;

  return jsonb_build_object('commande_id', v_id, 'numero', v_numero, 'lignes', jsonb_array_length(v_lignes));
end;
$$;

revoke execute on function public.creer_commande(uuid, jsonb, text) from public, anon;
grant execute on function public.creer_commande(uuid, jsonb, text) to authenticated, service_role;

-- =====================================================================
-- RPC : recevoir_commande — réception partielle/totale → lots + mouvements
-- + historique des prix (alerte >10 %) ; statut partiel/recu
-- =====================================================================
create or replace function public.recevoir_commande(
  p_commande_id uuid,
  p_site_id uuid,
  p_receptions jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_bc record;
  v_site_client uuid;
  v_lignes jsonb;
  v_idx integer;
  v_qte numeric;
  v_numero text;
  v_dlc date;
  v_line jsonb;
  v_rest numeric;
  v_lot_id uuid;
  v_n_lots integer := 0;
  v_all_done boolean := true;
  r jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_commande_id is null or p_site_id is null then raise exception 'Commande et site obligatoires.'; end if;
  if p_receptions is null or jsonb_typeof(p_receptions) <> 'array' or jsonb_array_length(p_receptions) < 1
     or jsonb_array_length(p_receptions) > 100 then
    raise exception 'Reception invalide (1 a 100 lignes).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  select b.* into v_bc from public.bons_commande b where b.id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_bc.client_id <> v_client then raise exception 'Commande hors perimetre.'; end if;
  if v_bc.statut = 'recu' then raise exception 'Commande deja entierement recue.'; end if;

  v_lignes := coalesce(v_bc.lignes, '[]'::jsonb);
  if jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
    raise exception 'Commande sans lignes.';
  end if;

  for r in select value from jsonb_array_elements(p_receptions) loop
    v_idx := (r->>'index')::integer;
    v_qte := (r->>'qte')::numeric;
    v_numero := trim(coalesce(r->>'numero',''));
    begin
      v_dlc := (r->>'dlc')::date;
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'DLC invalide.';
    end;
    if v_idx is null or v_idx < 0 or v_idx >= jsonb_array_length(v_lignes) then
      raise exception 'Ligne de commande inexistante.';
    end if;
    if v_qte is null or v_qte <= 0 or v_qte > 100000000 then
      raise exception 'Quantite recue invalide.';
    end if;
    if length(v_numero) < 1 or length(v_numero) > 80 then
      raise exception 'Numero de lot invalide.';
    end if;
    if v_dlc is null or v_dlc < current_date then
      raise exception 'DLC invalide (doit etre au moins au jour).';
    end if;

    v_line := v_lignes->v_idx;
    v_rest := (v_line->>'qte')::numeric - coalesce((v_line->>'recu')::numeric, 0);
    if v_qte > v_rest then
      raise exception '%', 'Quantite superieure au reste a recevoir (reste : ' || v_rest || ').';
    end if;

    insert into public.lots
      (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, date_reception, ref)
    values
      (v_client, (v_line->>'articleId')::uuid, p_site_id, v_bc.fournisseur_id, v_numero, v_qte, v_qte,
       (v_line->>'pu')::numeric, v_dlc, current_date, v_bc.numero)
    returning id into v_lot_id;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, (v_line->>'articleId')::uuid, v_lot_id, p_site_id, 'reception', v_qte,
            (v_line->>'pu')::numeric, v_bc.numero, 'Reception');

    insert into public.historique_prix (client_id, article_id, fournisseur_id, date_prix, pu)
    values (v_client, (v_line->>'articleId')::uuid, v_bc.fournisseur_id, current_date, (v_line->>'pu')::numeric);

    v_lignes := jsonb_set(v_lignes, array[v_idx::text, 'recu'],
      to_jsonb(coalesce((v_lignes->v_idx->>'recu')::numeric, 0) + v_qte));
    v_n_lots := v_n_lots + 1;
  end loop;

  for v_idx in 0 .. jsonb_array_length(v_lignes) - 1 loop
    if coalesce((v_lignes->v_idx->>'recu')::numeric, 0) < (v_lignes->v_idx->>'qte')::numeric then
      v_all_done := false;
      exit;
    end if;
  end loop;

  update public.bons_commande b
     set lignes = v_lignes,
         statut = case when v_all_done then 'recu' else 'partiel' end
   where b.id = p_commande_id;

  return jsonb_build_object(
    'commande_id', p_commande_id,
    'numero', v_bc.numero,
    'statut', case when v_all_done then 'recu' else 'partiel' end,
    'lots', v_n_lots
  );
end;
$$;

revoke execute on function public.recevoir_commande(uuid, uuid, jsonb) from public, anon;
grant execute on function public.recevoir_commande(uuid, uuid, jsonb) to authenticated, service_role;

-- ===== 11-import-z.sql =====
-- =====================================================================
-- Migration 11 — Import Z sécurisé : journal des imports + RPC
-- (format strict, codes résolus côté serveur, FEFO, idempotence,
--  confirmation si même total HT le même jour).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
-- =====================================================================

create table if not exists public.z_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  date_z date not null,
  caisse text not null,
  numero_z text not null,
  lignes jsonb not null default '[]'::jsonb,
  total_ht numeric not null default 0,
  total_ttc numeric not null default 0,
  vente_id uuid references public.ventes(id) on delete set null,
  imported_by uuid,
  imported_at timestamptz not null default now()
);
alter table public.z_imports enable row level security;
create unique index if not exists z_imports_unique
  on public.z_imports (client_id, date_z, site_id, caisse, numero_z);
-- Lecture tenant uniquement : aucune policy d'écriture → tout passe par la RPC.
create policy select_z_imports on public.z_imports
  for select using (client_id = public.patisgest_mon_client());

-- =====================================================================
-- RPC : importer_z — aperçu revérifié, résolution des codes, FEFO,
-- idempotence (date + caisse + n° Z), total similaire → confirmation.
-- =====================================================================
create or replace function public.importer_z(
  p_date date,
  p_site_id uuid,
  p_caisse text,
  p_numero_z text,
  p_csv text,
  p_confirm boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_caisse text;
  v_numero text;
  v_rows text[];
  v_row text;
  v_parts text[];
  v_idx int := 0;
  v_code text;
  v_qty numeric;
  v_pu numeric;
  v_tva numeric;
  v_cnt int;
  v_article record;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_z_id uuid;
  v_similar int;
  v_ticket text;
  v_numero_vente text;
  v_sale_id uuid;
  v_lignes_out jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  v_missing_total numeric := 0;
  v_remaining numeric;
  v_take numeric;
  v_consumed jsonb;
  v_line_missing numeric;
  r record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  if p_date is null or p_date > current_date then raise exception 'Date de Z invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;
  v_caisse := upper(trim(coalesce(p_caisse, '')));
  v_numero := upper(trim(coalesce(p_numero_z, '')));
  if length(v_caisse) < 1 or length(v_caisse) > 80 then raise exception 'Caisse requise (80 max).'; end if;
  if length(v_numero) < 1 or length(v_numero) > 80 then raise exception 'Numero Z requis (80 max).'; end if;
  if p_csv is null or length(trim(p_csv)) < 1 or length(p_csv) > 50000 then
    raise exception 'Donnees Z requises (50000 max).';
  end if;

  v_rows := regexp_split_to_array(trim(p_csv), E'\\r?\\n');
  foreach v_row in array v_rows loop
    v_row := trim(v_row);
    if v_row = '' then continue; end if;
    v_idx := v_idx + 1;
    if v_idx > 100 then raise exception 'Trop de lignes (100 maximum).'; end if;
    v_parts := regexp_split_to_array(v_row, ';');
    if coalesce(array_length(v_parts, 1), 0) <> 3 then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : utilisez code;quantite;prix HT (sans en-tete).';
    end if;
    v_code := trim(v_parts[1]);
    if v_code = '' or v_code !~ '^[0-9A-Za-z._-]+$' then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : code produit.';
    end if;
    if v_parts[2] !~ '^[0-9]+([.,][0-9]{1,4})?$' or v_parts[3] !~ '^[0-9]+([.,][0-9]{1,2})?$' then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : utilisez code;quantite;prix HT (sans en-tete).';
    end if;
    v_qty := replace(v_parts[2], ',', '.')::numeric;
    v_pu := replace(v_parts[3], ',', '.')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000
       or v_pu is null or v_pu < 0 or v_pu > 1000000000 then
      raise exception '%', 'Quantite ou prix invalide a la ligne ' || v_idx || '.';
    end if;

    select count(*) into v_cnt from public.articles a
     where a.client_id = v_client and upper(a.code) = upper(v_code) and a.niveau = 'produit';
    if v_cnt = 0 then
      raise exception '%', 'Code produit inconnu a la ligne ' || v_idx || ' : ' || v_code || '. Aucun import n''a ete effectue.';
    end if;
    if v_cnt > 1 then
      raise exception '%', 'Code produit ambigu a la ligne ' || v_idx || ' : ' || v_code || '.';
    end if;
    select a.id, a.code, a.tva into v_article from public.articles a
     where a.client_id = v_client and upper(a.code) = upper(v_code) and a.niveau = 'produit';
    if v_article.tva is null or v_article.tva < 0 or v_article.tva > 100 then
      raise exception '%', 'TVA invalide pour ' || v_article.code || '.';
    end if;

    v_line_ht := round(v_qty * v_pu, 2);
    v_line_ttc := round(v_qty * v_pu * (1 + v_article.tva / 100), 2);
    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;
    v_lines := v_lines || jsonb_build_object(
      'articleId', v_article.id, 'code', v_article.code, 'qty', v_qty, 'pu', v_pu,
      'tva', v_article.tva, 'totalHT', v_line_ht, 'totalTTC', v_line_ttc);
  end loop;
  if v_idx < 1 then raise exception 'Ajoutez entre 1 et 100 lignes.'; end if;

  begin
    insert into public.z_imports (client_id, site_id, date_z, caisse, numero_z, lignes, total_ht, total_ttc, imported_by)
    values (v_client, p_site_id, p_date, v_caisse, v_numero, v_lines, v_total_ht, v_total_ttc, v_auth)
    returning id into v_z_id;
  exception when unique_violation then
    select z.id into v_z_id from public.z_imports z
     where z.client_id = v_client and z.date_z = p_date and z.site_id = p_site_id
       and z.caisse = v_caisse and z.numero_z = v_numero;
    return jsonb_build_object('z_import_id', v_z_id, 'sale_id', null, 'duplicate', true,
      'lines', jsonb_array_length(v_lines), 'totalHT', v_total_ht, 'totalTTC', v_total_ttc, 'missing', 0);
  end;

  select count(*) into v_similar from public.z_imports z
   where z.client_id = v_client and z.date_z = p_date and z.site_id = p_site_id
     and z.id <> v_z_id and abs(z.total_ht - v_total_ht) < 0.005;
  if v_similar > 0 and not coalesce(p_confirm, false) then
    raise exception 'Un autre Z du meme jour a le meme total HT. Verifiez et confirmez cet import distinct.';
  end if;

  v_ticket := 'Z-' || v_numero || '-' || to_char(p_date, 'YYMMDD') || '-' || substr(md5(v_caisse), 1, 4);
  v_numero_vente := 'Z-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
  insert into public.ventes (client_id, site_id, numero, ticket, date_vente, source, lignes, manquants, total_ht, total_ttc)
  values (v_client, p_site_id, v_numero_vente, v_ticket, p_date, 'z-import', '[]'::jsonb, '[]'::jsonb, 0, 0)
  returning id into v_sale_id;

  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_remaining := (v_lines->i->>'qty')::numeric;
    v_consumed := '[]'::jsonb;
    v_line_missing := 0;
    for r in
      select l.id, l.qte_rest, l.numero from public.lots l
       where l.client_id = v_client
         and l.article_id = (v_lines->i->>'articleId')::uuid
         and l.site_id = p_site_id
         and not l.bloque
         and l.qte_rest > 0
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(r.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, (v_lines->i->>'articleId')::uuid, r.id, p_site_id, 'vente', -v_take,
              (v_lines->i->>'pu')::numeric, v_ticket, 'Vente Z');
    end loop;
    if v_remaining > 0 then
      v_line_missing := v_remaining;
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, (v_lines->i->>'articleId')::uuid, null, p_site_id, 'vente', -v_remaining,
              (v_lines->i->>'pu')::numeric, v_ticket, 'Vente Z sans stock');
      v_manquants := v_manquants || jsonb_build_object('articleId', (v_lines->i->>'articleId')::uuid, 'qty', v_remaining);
      v_missing_total := v_missing_total + v_remaining;
    end if;
    v_lignes_out := v_lignes_out || (v_lines->i) || jsonb_build_object('lots', v_consumed, 'missing', v_line_missing);
  end loop;

  update public.ventes v
     set lignes = v_lignes_out, manquants = v_manquants,
         total_ht = v_total_ht, total_ttc = v_total_ttc
   where v.id = v_sale_id;
  update public.z_imports z set vente_id = v_sale_id where z.id = v_z_id;

  return jsonb_build_object(
    'z_import_id', v_z_id, 'sale_id', v_sale_id, 'duplicate', false,
    'lines', jsonb_array_length(v_lines), 'totalHT', v_total_ht,
    'totalTTC', v_total_ttc, 'missing', v_missing_total);
end;
$$;

revoke execute on function public.importer_z(date, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.importer_z(date, uuid, text, text, text, boolean) to authenticated, service_role;

-- ===== 12-sous-recettes-conversions.sql =====
-- =====================================================================
-- Migration 12 — Sous-recettes & conversions d'unités (MOD-04 / D2).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * conversions     : facteurs par tenant (RLS complet, rôles labo)
--   * creer_famille   : famille liée à un article (produit/semifini)
--   * creer_version   : version immuable — lignes article OU sous-recette
--                       (pointeur vers version figée, anti-cycle BFS
--                       max3, conversions exigées à la création)
--   * activer_version : une seule active par famille
--   * creer_of        : besoins via patisgest_besoins_de_version
--                       (expansion récursive + parage + conversions,
--                       doublons fusionnés)
-- Rejouable (idempotent au niveau DDL sauf insertions de données).
-- =====================================================================

-- ------------------------------------------------------------ conversions
create table if not exists public.conversions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  unite_from text not null,
  unite_to text not null,
  facteur numeric not null,
  created_at timestamptz not null default now(),
  constraint conversions_paires_differentes check (unite_from <> unite_to),
  constraint conversions_facteur_positif check (facteur > 0 and facteur <= 1000000000),
  constraint conversions_unites_len check (length(unite_from) between 1 and 10 and length(unite_to) between 1 and 10),
  constraint conversions_unique unique (client_id, unite_from, unite_to)
);
alter table public.conversions enable row level security;
create policy select_conversions on public.conversions
  for select using (client_id = public.patisgest_mon_client());
create policy insert_conversions on public.conversions
  for insert to authenticated with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy update_conversions on public.conversions
  for update to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'))
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy delete_conversions on public.conversions
  for delete to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'));

-- Convertit qte de p_from vers p_to : identité, facteur direct ou inverse.
-- Interne uniquement (aucun grant) : appelé par les RPC SECURITY DEFINER.
create or replace function public.patisgest_convertir(
  p_client uuid, p_qte numeric, p_from text, p_to text
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_f numeric;
begin
  if p_from = p_to then return p_qte; end if;
  select c.facteur into v_f from public.conversions c
   where c.client_id = p_client and c.unite_from = p_from and c.unite_to = p_to;
  if v_f is not null then return round(p_qte * v_f, 6); end if;
  select c.facteur into v_f from public.conversions c
   where c.client_id = p_client and c.unite_from = p_to and c.unite_to = p_from;
  if v_f is not null and v_f <> 0 then return round(p_qte / v_f, 6); end if;
  return null;
end;
$fn$;
revoke execute on function public.patisgest_convertir(uuid, numeric, text, text) from public, anon, authenticated;
-- ------------------------------------------------------------ creer_famille
create or replace function public.creer_famille(p_code text, p_nom text, p_produit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_prod record;
  v_id uuid;
  v_code text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  v_code := upper(trim(coalesce(p_code, '')));
  if length(v_code) < 1 or length(v_code) > 20 then raise exception 'Code requis (20 max).'; end if;
  if p_nom is null or length(trim(p_nom)) < 1 or length(trim(p_nom)) > 100 then
    raise exception 'Nom requis (100 max).';
  end if;
  if p_produit_id is null then raise exception 'Produit obligatoire.'; end if;
  select a.id, a.client_id into v_prod from public.articles a where a.id = p_produit_id;
  if not found then raise exception 'Article introuvable.'; end if;
  if v_prod.client_id <> v_client then raise exception 'Article hors perimetre.'; end if;
  if exists (select 1 from public.recette_familles rf where rf.client_id = v_client and rf.code = v_code) then
    raise exception 'Code de recette deja utilise.';
  end if;
  insert into public.recette_familles (client_id, code, nom, produit_id)
  values (v_client, v_code, trim(p_nom), p_produit_id)
  returning id into v_id;
  return jsonb_build_object('famille_id', v_id, 'code', v_code);
end;
$fn$;
revoke execute on function public.creer_famille(text, text, uuid) from public, anon;
grant execute on function public.creer_famille(text, text, uuid) to authenticated, service_role;
-- ------------------------------------------------------------ creer_version
create or replace function public.creer_version(
  p_famille_id uuid,
  p_rendement_qte numeric,
  p_rendement_unite text,
  p_lignes jsonb,
  p_notes text,
  p_mo_min numeric,
  p_energie numeric,
  p_emballage numeric,
  p_frais_generaux numeric,
  p_cuisson_perte_pct numeric,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_fam record;
  v_version int;
  v_lignes jsonb := '[]'::jsonb;
  l jsonb;
  v_article uuid;
  v_sub uuid;
  v_art record;
  v_sub_rec record;
  v_q numeric;
  v_u text;
  v_conv numeric;
  v_id uuid;
  v_active boolean := coalesce(p_active, false);
  v_queue uuid[] := '{}';
  v_dqueue int[] := '{}';
  v_cur uuid;
  v_cur_d int;
  v_cur_fam uuid;
  v_cur_ing jsonb;
  v_next uuid;
  v_seen uuid[];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  if p_famille_id is null then raise exception 'Famille obligatoire.'; end if;
  if p_rendement_qte is null or p_rendement_qte <= 0 or p_rendement_qte > 100000000 then
    raise exception 'Rendement invalide.';
  end if;
  if p_rendement_unite is null or length(trim(p_rendement_unite)) < 1 or length(trim(p_rendement_unite)) > 10 then
    raise exception 'Unite de rendement requise (10 max).';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) < 1
     or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Ajoutez1 a 100 lignes d ingredients.';
  end if;
  if coalesce(p_notes,'') <> '' and length(p_notes) > 500 then raise exception 'Notes trop longues.'; end if;
  if coalesce(p_mo_min,0) < 0 or coalesce(p_energie,0) < 0 or coalesce(p_emballage,0) < 0
     or coalesce(p_frais_generaux,0) < 0 or coalesce(p_cuisson_perte_pct,0) < 0
     or coalesce(p_cuisson_perte_pct,0) > 100 then
    raise exception 'Cout ou perte invalide.';
  end if;

  select rf.id, rf.client_id, rf.nom, rf.produit_id into v_fam
    from public.recette_familles rf where rf.id = p_famille_id;
  if not found then raise exception 'Famille introuvable.'; end if;
  if v_fam.client_id <> v_client then raise exception 'Famille hors perimetre.'; end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    v_q := (l->>'q')::numeric;
    v_u := nullif(trim(coalesce(l->>'u','')), '');
    if v_q is null or v_q <= 0 or v_q > 100000000 then
      raise exception 'Quantite de ligne invalide.';
    end if;
    if v_u is null or length(v_u) > 10 then
      raise exception 'Unite de ligne requise (10 max).';
    end if;

    begin
      v_article := nullif(l->>'articleId','')::uuid;
      v_sub := nullif(l->>'subVersionId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'Ligne invalide : identifiant non valide.';
    end;
    if v_article is not null and v_sub is not null then
      raise exception 'Ligne ambiguë : article OU sous-recette, pas les deux.';
    end if;

    if v_article is not null then
      select a.id, a.unite, a.nom, a.code into v_art from public.articles a
       where a.id = v_article and a.client_id = v_client;
      if not found then raise exception 'Article introuvable ou hors perimetre.'; end if;
      if v_u <> v_art.unite then
        v_conv := public.patisgest_convertir(v_client, 1, v_u, v_art.unite);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_art.unite || ' (' || v_art.code || ').';
        end if;
      end if;
      v_lignes := v_lignes || jsonb_build_object(
        'articleId', v_article, 'code', v_art.code, 'nom', v_art.nom,
        'q', v_q, 'u', v_u, 'parage', coalesce((l->>'parage')::numeric, 0));

    elsif v_sub is not null then
      select rv.id, rv.client_id, rv.famille_id, rv.rendement_qte, rv.rendement_unite, rf.nom
        into v_sub_rec
        from public.recette_versions rv
        join public.recette_familles rf on rf.id = rv.famille_id
       where rv.id = v_sub;
      if not found then raise exception 'Sous-recette introuvable.'; end if;
      if v_sub_rec.client_id <> v_client then raise exception 'Sous-recette hors perimetre.'; end if;
      if v_sub_rec.famille_id = v_fam.id then raise exception 'Auto-reference de sous-recette interdite.'; end if;
      if v_u <> v_sub_rec.rendement_unite then
        v_conv := public.patisgest_convertir(v_client, 1, v_u, v_sub_rec.rendement_unite);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_sub_rec.rendement_unite || ' (sous-recette).';
        end if;
      end if;
      -- anti-cycle + profondeur : parcours BFS des sous-recettes (max3 generations)
      v_queue := array[v_sub];
      v_dqueue := array[1];
      v_seen := array[v_fam.id];
      while coalesce(array_length(v_queue, 1), 0) > 0 loop
        v_cur := v_queue[1];
        v_cur_d := v_dqueue[1];
        v_queue := v_queue[2:];
        v_dqueue := v_dqueue[2:];
        if v_cur_d > 3 then
          raise exception 'Sous-recettes trop profondes (3 generations maximum).';
        end if;
        select rv.famille_id, rv.ingredients into v_cur_fam, v_cur_ing
          from public.recette_versions rv where rv.id = v_cur;
        if not found then continue; end if;
        if v_cur_fam = v_fam.id then
          raise exception 'Cycle de sous-recettes detecte.';
        end if;
        if v_cur_fam = any(v_seen) then continue; end if;
        v_seen := array_append(v_seen, v_cur_fam);
        for v_next in
          select (x->>'subVersionId')::uuid from jsonb_array_elements(coalesce(v_cur_ing,'[]'::jsonb)) x
           where nullif(x->>'subVersionId','') is not null
        loop
          v_queue := array_append(v_queue, v_next);
          v_dqueue := array_append(v_dqueue, v_cur_d + 1);
        end loop;
      end loop;

      v_lignes := v_lignes || jsonb_build_object(
        'subVersionId', v_sub, 'subFamilleId', v_sub_rec.famille_id,
        'nom', v_sub_rec.nom, 'q', v_q, 'u', v_u);
    else
      raise exception 'Ligne sans article ni sous-recette.';
    end if;
  end loop;

  select coalesce(max(rv.version), 0) + 1 into v_version
    from public.recette_versions rv where rv.famille_id = p_famille_id;

  if v_active then
    update public.recette_versions rv set active = false
     where rv.famille_id = p_famille_id and rv.active = true;
  end if;

  insert into public.recette_versions
    (client_id, famille_id, version, rendement_qte, rendement_unite,
     cuisson_perte_pct, mo_min, energie, emballage, frais_generaux,
     ingredients, notes, active)
  values
    (v_client, p_famille_id, v_version, p_rendement_qte, trim(p_rendement_unite),
     coalesce(p_cuisson_perte_pct, 0), coalesce(p_mo_min, 0), coalesce(p_energie, 0),
     coalesce(p_emballage, 0), coalesce(p_frais_generaux, 0),
     v_lignes, nullif(trim(coalesce(p_notes,'')), ''), v_active)
  returning id into v_id;

  return jsonb_build_object('version_id', v_id, 'version', v_version, 'active', v_active);
end;
$fn$;
revoke execute on function public.creer_version(uuid, numeric, text, jsonb, text, numeric, numeric, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.creer_version(uuid, numeric, text, jsonb, text, numeric, numeric, numeric, numeric, numeric, boolean) to authenticated, service_role;

-- ------------------------------------------------------------ activer_version
create or replace function public.activer_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_rec record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  if p_version_id is null then raise exception 'Version obligatoire.'; end if;
  select rv.id, rv.client_id, rv.famille_id, rv.version into v_rec
    from public.recette_versions rv where rv.id = p_version_id;
  if not found then raise exception 'Version introuvable.'; end if;
  if v_rec.client_id <> v_client then raise exception 'Version hors perimetre.'; end if;
  update public.recette_versions rv set active = false
   where rv.famille_id = v_rec.famille_id and rv.active = true and rv.id <> v_rec.id;
  update public.recette_versions rv set active = true where rv.id = v_rec.id;
  return jsonb_build_object('famille_id', v_rec.famille_id, 'version', v_rec.version);
end;
$fn$;
revoke execute on function public.activer_version(uuid) from public, anon;
grant execute on function public.activer_version(uuid) to authenticated, service_role;

-- ------------------------------------------- patisgest_besoins_de_version
-- Expansion des besoins d'une version : articles (parage + conversions
-- d'unités) OU sous-recettes (récursion, profondeur max3), puis fusion
-- des doublons. Interne uniquement (aucun grant).
create or replace function public.patisgest_besoins_de_version(
  p_client uuid, p_version_id uuid, p_scale numeric, p_depth int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_rec record;
  v_out jsonb := '[]'::jsonb;
  l jsonb;
  v_q numeric;
  v_u text;
  v_art record;
  v_conv numeric;
  v_qty numeric;
  v_sr numeric;
  v_su text;
  v_child_scale numeric;
  v_child jsonb;
  c jsonb;
begin
  if p_depth > 3 then
    raise exception 'Sous-recettes trop profondes (3 generations maximum).';
  end if;
  select rv.rendement_qte, rv.rendement_unite, rv.ingredients into v_rec
    from public.recette_versions rv
   where rv.id = p_version_id and rv.client_id = p_client;
  if not found then raise exception 'Version de recette introuvable.'; end if;
  if v_rec.ingredients is null or jsonb_typeof(v_rec.ingredients) <> 'array'
     or jsonb_array_length(v_rec.ingredients) = 0 then
    raise exception 'Recette sans ingredients.';
  end if;

  for l in select value from jsonb_array_elements(v_rec.ingredients) loop
    v_q := coalesce((l->>'q')::numeric, 0);
    v_u := nullif(l->>'u', '');
    if l->>'articleId' is not null or nullif(l->>'code','') is not null then
      if l->>'articleId' is not null then
        select a.id, a.code, a.nom, a.unite into v_art from public.articles a
         where a.id = (l->>'articleId')::uuid and a.client_id = p_client;
      else
        select a.id, a.code, a.nom, a.unite into v_art from public.articles a
         where a.client_id = p_client and a.code = nullif(l->>'code','')
         limit 1;
      end if;
      if not found then
        raise exception '%', 'Article ingredient introuvable : ' || coalesce(l->>'code', '?');
      end if;
      v_qty := v_q * (1 + coalesce((l->>'parage')::numeric, 0) / 100);
      if v_u is not null and v_u <> v_art.unite then
        v_conv := public.patisgest_convertir(p_client, v_qty, v_u, v_art.unite);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_art.unite || ' (' || v_art.code || ').';
        end if;
        v_qty := v_conv;
      end if;
      v_qty := round(v_qty * p_scale, 4);
      v_out := v_out || jsonb_build_object(
        'articleId', v_art.id, 'code', v_art.code, 'nom', v_art.nom,
        'qty', v_qty, 'unit', v_art.unite);

    elsif l->>'subVersionId' is not null then
      select rv.rendement_qte, rv.rendement_unite into v_sr, v_su
        from public.recette_versions rv
       where rv.id = (l->>'subVersionId')::uuid and rv.client_id = p_client;
      if not found then raise exception 'Sous-recette introuvable.'; end if;
      v_qty := v_q;
      if v_u is not null and v_u <> v_su then
        v_conv := public.patisgest_convertir(p_client, v_qty, v_u, v_su);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_su || ' (sous-recette).';
        end if;
        v_qty := v_conv;
      end if;
      if v_sr is null or v_sr <= 0 then raise exception 'Rendement de sous-recette invalide.'; end if;
      v_child_scale := (v_qty / v_sr) * p_scale;
      v_child := public.patisgest_besoins_de_version(p_client, (l->>'subVersionId')::uuid, v_child_scale, p_depth + 1);
      for c in select value from jsonb_array_elements(v_child) loop
        v_out := v_out || c;
      end loop;
    else
      raise exception 'Ingredient sans article ni sous-recette.';
    end if;
  end loop;

  select coalesce(jsonb_agg(sub.x), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'articleId', x->>'articleId', 'code', x->>'code', 'nom', x->>'nom',
      'qty', round(sum((x->>'qty')::numeric), 4), 'unit', x->>'unit') as x
      from jsonb_array_elements(v_out) x
     group by x->>'articleId', x->>'code', x->>'nom', x->>'unit'
  ) sub;
  return coalesce(v_out, '[]'::jsonb);
end;
$fn$;
revoke execute on function public.patisgest_besoins_de_version(uuid, uuid, numeric, int) from public, anon, authenticated;

-- ------------------------------------------------------------ creer_of (mis à jour)
-- La boucle d'ingrédients est remplacée par l'appel ci-dessous (voir le
-- corps complet de creer_of dans07-of-production.sql ; seul ce fragment
-- change) :
--
--   v_scale := case when coalesce(v_rendement, 0) > 0 then p_qte_prevue / v_rendement else 1 end;
--   v_besoins := public.patisgest_besoins_de_version(v_client, p_version_id, v_scale, 0);
--
-- Compatibilité : les lignes seed à `code` (sans articleId) restent prises
-- en charge par le helper.

-- ===== 13-rappel-blocage-lots.sql =====
-- =====================================================================
-- Migration 13 — Traçabilité : rapport de rappel & blocage en cascade.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * lots.bloque_motif  : motif du blocage
--   * rappel_lot         : rapport en cascade (ventes, OFs consommateurs,
--                          transferts départ/arrivée, lots descendants
--                          produits ou transférés, profondeur max3,
--                          ventes des descendants) — lecture tous rôles
--   * bloquer_lot        : blocage avec motif, propagation facultative
--                          aux descendants ; déblocage jamais propagé
--                          (propriétaire + labo)
-- Rejouable.
-- =====================================================================

alter table public.lots add column if not exists bloque_motif text;

create or replace function public.bloquer_lot(
  p_lot_id uuid,
  p_bloque boolean,
  p_motif text,
  p_descendants boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_lot record;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
  v_frontier uuid[] := array[p_lot_id];
  v_next uuid[];
  v_visited uuid[] := '{}';
  v_outer uuid;
  v_hit uuid;
  v_m record;
  v_depth int := 0;
  v_touches uuid[] := '{}';
  v_of record;
  v_p jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  if p_lot_id is null then raise exception 'Lot obligatoire.'; end if;
  if coalesce(p_bloque, false) then
    if v_motif is null or length(v_motif) < 1 or length(v_motif) > 200 then
      raise exception 'Motif de blocage requis (200 max).';
    end if;
  end if;

  select l.id, l.client_id into v_lot from public.lots l where l.id = p_lot_id;
  if not found then raise exception 'Lot introuvable.'; end if;
  if v_lot.client_id <> v_client then raise exception 'Lot hors perimetre.'; end if;

  if coalesce(p_bloque, false) and coalesce(p_descendants, false) then
    -- BFS : miroirs de transfert (source qte<0) + lots produits par les OF
    -- consommateurs, profondeur max3.
    while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < 3 loop
      v_next := '{}';
      for v_outer in select unnest(v_frontier) loop
        if v_outer = any(v_visited) then continue; end if;
        v_visited := array_append(v_visited, v_outer);
        v_touches := array_append(v_touches, v_outer);
        for v_m in
          select m.type, m.qte, m.ref from public.mouvements m
           where m.client_id = v_client and m.lot_id = v_outer
        loop
          if v_m.type = 'transfert' and v_m.qte < 0 then
            for v_hit in
              select distinct m2.lot_id from public.mouvements m2
               where m2.client_id = v_client and m2.ref = v_m.ref
                 and m2.type = 'transfert' and m2.lot_id is not null and m2.lot_id <> v_outer
            loop
              if not (v_hit = any(v_visited)) then v_next := array_append(v_next, v_hit); end if;
            end loop;
          elsif v_m.type = 'production' and v_m.qte < 0 then
            select o.id, o.lots_produits into v_of from public.ordres_fabrication o
             where o.client_id = v_client and o.numero = v_m.ref;
            if found and v_of.lots_produits is not null then
              for v_p in select value from jsonb_array_elements(v_of.lots_produits) loop
                begin
                  v_hit := (v_p->>'lotId')::uuid;
                exception when invalid_text_representation then continue;
                end;
                if v_hit is not null and not (v_hit = any(v_visited)) then
                  v_next := array_append(v_next, v_hit);
                end if;
              end loop;
            end if;
          end if;
        end loop;
      end loop;
      v_frontier := v_next;
      v_depth := v_depth + 1;
    end loop;
  else
    v_touches := array[p_lot_id];
  end if;

  if coalesce(p_bloque, false) then
    update public.lots l set bloque = true, bloque_motif = v_motif
     where l.id = any(v_touches) and l.client_id = v_client;
  else
    -- Déblocage : uniquement le lot choisi (jamais propagé).
    update public.lots l set bloque = false, bloque_motif = null
     where l.id = p_lot_id and l.client_id = v_client;
    v_touches := array[p_lot_id];
  end if;

  return jsonb_build_object(
    'lot_id', p_lot_id,
    'bloque', coalesce(p_bloque, false),
    'touches', coalesce(array_length(v_touches, 1), 0));
end;
$$;
revoke execute on function public.bloquer_lot(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.bloquer_lot(uuid, boolean, text, boolean) to authenticated, service_role;

create or replace function public.rappel_lot(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_lot record;
  v_frontier uuid[] := array[p_lot_id];
  v_next uuid[];
  v_visited uuid[] := '{}';
  v_outer uuid;
  v_hit uuid;
  v_m record;
  v_depth int := 0;
  v_ventes jsonb := '[]'::jsonb;
  v_of_cons jsonb := '[]'::jsonb;
  v_transferts jsonb := '[]'::jsonb;
  v_desc jsonb := '[]'::jsonb;
  v_of_prod jsonb := null;
  v_of record;
  v_t record;
  v_p jsonb;
  v_dir text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if p_lot_id is null then raise exception 'Lot obligatoire.'; end if;

  select l.id, l.numero, l.article_id, l.site_id, l.dlc, l.bloque, l.bloque_motif,
         a.code, a.nom
    into v_lot
    from public.lots l join public.articles a on a.id = l.article_id
   where l.id = p_lot_id and l.client_id = v_client;
  if not found then raise exception 'Lot introuvable.'; end if;

  -- OF producteur du lot (contexte)
  select jsonb_build_object('numero', o.numero, 'statut', o.statut) into v_of_prod
    from public.ordres_fabrication o
   where o.client_id = v_client
     and o.lots_produits @> jsonb_build_array(jsonb_build_object('lotId', p_lot_id::text))
   limit 1;

  while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < 3 loop
    v_next := '{}';
    for v_outer in select unnest(v_frontier) loop
      if v_outer = any(v_visited) then continue; end if;
      v_visited := array_append(v_visited, v_outer);
      if v_outer <> p_lot_id then
        v_desc := v_desc || (select coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'numero', l.numero, 'code', a.code, 'nom', a.nom,
            'dlc', l.dlc, 'site_id', l.site_id, 'bloque', l.bloque)), '[]'::jsonb)
          from public.lots l join public.articles a on a.id = l.article_id
         where l.id = v_outer and l.client_id = v_client);
      end if;
      for v_m in
        select m.type, m.qte, m.ref from public.mouvements m
         where m.client_id = v_client and m.lot_id = v_outer
      loop
        if v_m.type = 'vente' then
          v_ventes := v_ventes || (select coalesce(jsonb_agg(jsonb_build_object(
              'ticket', vt.ticket, 'date_vente', vt.date_vente, 'total_ht', vt.total_ht,
              'site_id', vt.site_id)), '[]'::jsonb)
            from public.ventes vt
           where vt.client_id = v_client and vt.ticket = v_m.ref);
        elsif v_m.type = 'production' and v_m.qte < 0 then
          select jsonb_build_object('numero', o.numero, 'statut', o.statut) into v_t
            from public.ordres_fabrication o
           where o.client_id = v_client and o.numero = v_m.ref;
          if found then v_of_cons := v_of_cons || to_jsonb(v_t); end if;
          select o.id, o.lots_produits into v_of from public.ordres_fabrication o
           where o.client_id = v_client and o.numero = v_m.ref;
          if found and v_of.lots_produits is not null then
            for v_p in select value from jsonb_array_elements(v_of.lots_produits) loop
              begin
                v_hit := (v_p->>'lotId')::uuid;
              exception when invalid_text_representation then continue;
              end;
              if v_hit is not null and not (v_hit = any(v_visited)) then
                v_next := array_append(v_next, v_hit);
              end if;
            end loop;
          end if;
        elsif v_m.type = 'transfert' then
          v_dir := case when v_m.qte < 0 then 'depart' else 'arrivee' end;
          if not exists (select 1 from jsonb_array_elements(v_transferts) e
                          where e->>'ref' = v_m.ref and e->>'direction' = v_dir) then
            v_transferts := v_transferts || jsonb_build_object('ref', v_m.ref, 'direction', v_dir);
          end if;
          if v_m.qte < 0 then
            for v_hit in
              select distinct m2.lot_id from public.mouvements m2
               where m2.client_id = v_client and m2.ref = v_m.ref
                 and m2.type = 'transfert' and m2.lot_id is not null and m2.lot_id <> v_outer
            loop
              if not (v_hit = any(v_visited)) then v_next := array_append(v_next, v_hit); end if;
            end loop;
          end if;
        end if;
      end loop;
    end loop;
    v_frontier := v_next;
    v_depth := v_depth + 1;
  end loop;

  -- Ventes des lots descendants (via leurs mouvements de vente)
  declare
    v_desc_ventes jsonb := '[]'::jsonb;
    v_d uuid;
  begin
    for v_d in select unnest(v_visited) loop
      if v_d = p_lot_id then continue; end if;
      v_desc_ventes := v_desc_ventes || (select coalesce(jsonb_agg(jsonb_build_object(
          'ticket', vt.ticket, 'date_vente', vt.date_vente, 'total_ht', vt.total_ht,
          'code', a.code, 'nom', a.nom)), '[]'::jsonb)
        from public.mouvements m
        join public.ventes vt on vt.client_id = m.client_id and vt.ticket = m.ref
        join public.articles a on a.id = m.article_id
       where m.client_id = v_client and m.lot_id = v_d and m.type = 'vente');
    end loop;
    return jsonb_build_object(
      'lot', jsonb_build_object(
        'id', v_lot.id, 'numero', v_lot.numero, 'code', v_lot.code, 'nom', v_lot.nom,
        'dlc', v_lot.dlc, 'site_id', v_lot.site_id,
        'bloque', v_lot.bloque, 'bloque_motif', v_lot.bloque_motif),
      'of_producteur', v_of_prod,
      'ventes', coalesce(v_ventes, '[]'::jsonb),
      'of_consigneurs', coalesce(v_of_cons, '[]'::jsonb),
      'transferts', coalesce(v_transferts, '[]'::jsonb),
      'descendants', coalesce(v_desc, '[]'::jsonb),
      'ventes_descendants', coalesce(v_desc_ventes, '[]'::jsonb));
  end;
end;
$$;
revoke execute on function public.rappel_lot(uuid) from public, anon;
grant execute on function public.rappel_lot(uuid) to authenticated, service_role;

-- ===== 14-cake-edition-cgv-ticket.sql =====
-- =====================================================================
-- Migration 14 — Cake Design complet : édition, preuve CGV, TVA, ticket.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * cakes.tva_pct / cgv_accepted_at / cgv_version : TVA configurable et
--     preuve d'acceptation des CGV horodatée + version
--   * editer_cake  : édition d'un devis (statut 'devis' uniquement —
--                    verrouillé ensuite), régénère le rétroplanning
--   * accepter_cgv : enregistre l'acceptation (tous les rôles, comme
--                    creer_cake)
--   * Paiements/transitions : déjà couverts par evoluer_cake (09).
--   * Ticket imprimable : UI (cake-ticket.tsx, format80 mm).
-- Rejouable.
-- =====================================================================

alter table public.cakes add column if not exists tva_pct numeric not null default 0;
alter table public.cakes add column if not exists cgv_accepted_at timestamptz;
alter table public.cakes add column if not exists cgv_version text;

create or replace function public.editer_cake(
  p_id uuid,
  p_client_nom text,
  p_telephone text,
  p_date_event date,
  p_nb_parts int,
  p_prix_ht numeric,
  p_tva_pct numeric,
  p_notes text,
  p_options jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  c record;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
  v_nom text;
  v_cout numeric;
  v_min int;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_client_nom is null or length(trim(p_client_nom)) < 1 or length(trim(p_client_nom)) > 100 then
    raise exception 'Nom du client requis (1 a 100 caracteres).';
  end if;
  if p_telephone is not null and length(p_telephone) > 40 then
    raise exception 'Telephone trop long (40 max).';
  end if;
  if p_date_event is null or p_date_event < DATE '2000-01-04' then
    raise exception 'Date d''evenement invalide.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 a 10000).';
  end if;
  if p_prix_ht is null or p_prix_ht <= 0 or p_prix_ht > 100000000000 then
    raise exception 'Prix HT invalide.';
  end if;
  if p_tva_pct is null or p_tva_pct < 0 or p_tva_pct > 100 then
    raise exception 'TVA invalide (0 a 100).';
  end if;
  if coalesce(p_notes, '') <> '' and length(p_notes) > 500 then
    raise exception 'Notes trop longues (500 max).';
  end if;
  if p_options is not null and jsonb_typeof(p_options) = 'array' then
    if jsonb_array_length(p_options) > 50 then
      raise exception 'Trop d''options (50 max).';
    end if;
    for o in select value from jsonb_array_elements(p_options) loop
      v_nom := trim(coalesce(o->>'name', ''));
      v_cout := (o->>'cout')::numeric;
      v_min := (o->>'minutes')::integer;
      if v_nom = '' or length(v_nom) > 100 then raise exception 'Option : nom requis (100 max).'; end if;
      if v_cout is null or v_cout < 0 or v_cout > 1000000000 then
        raise exception 'Option : cout invalide.';
      end if;
      if v_min is null or v_min < 0 or v_min > 100000 then
        raise exception 'Option : duree invalide.';
      end if;
      v_opts := v_opts || jsonb_build_object('name', v_nom, 'cout', v_cout, 'minutes', v_min);
    end loop;
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;
  if c.statut <> 'devis' then
    raise exception 'Edition possible uniquement depuis le devis (statut actuel : %).', c.statut;
  end if;

  update public.cakes k set
    client_nom = trim(p_client_nom),
    telephone = nullif(trim(coalesce(p_telephone, '')), ''),
    date_event = p_date_event,
    retro = jsonb_build_array(
      jsonb_build_object('date', p_date_event - 3, 'task', 'Valider le devis', 'done', false),
      jsonb_build_object('date', p_date_event - 1, 'task', 'Préparer structure + crémage', 'done', false),
      jsonb_build_object('date', p_date_event, 'task', 'Décorer + livrer', 'done', false)),
    nb_parts = p_nb_parts,
    prix_ht = p_prix_ht,
    tva_pct = p_tva_pct,
    options = coalesce(nullif(v_opts, '[]'::jsonb), k.options),
    notes = nullif(trim(coalesce(p_notes, '')), '')
   where k.id = p_id
   returning k.numero, k.prix_ht, k.tva_pct into c;

  return jsonb_build_object('cake_id', p_id, 'numero', c.numero, 'prix_ht', c.prix_ht, 'tva_pct', c.tva_pct);
end;
$$;
revoke execute on function public.editer_cake(uuid, text, text, date, int, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.editer_cake(uuid, text, text, date, int, numeric, numeric, text, jsonb) to authenticated, service_role;

create or replace function public.accepter_cgv(p_id uuid, p_version text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  c record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_version is null or length(trim(p_version)) < 1 or length(trim(p_version)) > 50 then
    raise exception 'Version des CGV requise (50 max).';
  end if;
  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;
  update public.cakes k set
    cgv = true,
    cgv_accepted_at = now(),
    cgv_version = trim(p_version)
   where k.id = p_id;
  return jsonb_build_object('cake_id', p_id, 'cgv', true, 'version', trim(p_version));
end;
$$;
revoke execute on function public.accepter_cgv(uuid, text) from public, anon;
grant execute on function public.accepter_cgv(uuid, text) to authenticated, service_role;

-- ===== 15-parametres-couts.sql =====
-- =====================================================================
-- Migration 15 — Paramètres de coûts (Sprint3, RC-04).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * parametres_couts :1 ligne par tenant — taux horaire + charges %,
--     entrées de la MO chargée RC-04 = (min ÷ 60) × taux × (1 + charges %).
--   * Fiche de coût RC-01..RC-10 : lib cost-sheet.ts + tests (10 recettes
--     de référence au centime) — calcul côté app, aucune RPC.
--   * Caisse hors-ligne : file localStorage + idempotence par ticket
--     (vendre_article, migration06) — pas de DDL.
-- Rejouable.
-- =====================================================================

create table if not exists public.parametres_couts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  taux_horaire numeric not null default 0,
  charges_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint pc_taux_positif check (taux_horaire >= 0 and taux_horaire <= 1000000),
  constraint pc_charges_positif check (charges_pct >= 0 and charges_pct <= 1000)
);
alter table public.parametres_couts enable row level security;
create policy select_pc on public.parametres_couts for select using (client_id = public.patisgest_mon_client());
create policy insert_pc on public.parametres_couts for insert to authenticated with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy update_pc on public.parametres_couts for update to authenticated using (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo')) with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo'));

-- ===== 16-creer-of-idempotent.sql =====
-- =====================================================================
-- Migration 16 — Idempotence de creer_of (Sprint4 : file OF hors-ligne).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * ordres_fabrication.client_ref : référence fournie par le client
--     (file hors-ligne) — index unique partiel par tenant : resynchroniser
--     la file ne crée jamais2 OF (réponse duplicate:true).
--   * creer_of(..., p_client_ref) : avant insertion, retourne l'OF
--     existant si le client_ref est déjà connu.
-- Rejouable. Le corps complet ci-dessous =07-of-production.sql mis à jour.
-- =====================================================================

alter table public.ordres_fabrication add column if not exists client_ref text;
create unique index if not exists ofs_client_ref_uniq
  on public.ordres_fabrication (client_id, client_ref) where client_ref is not null;

create or replace function public.creer_of(
  p_version_id uuid,
  p_site_id uuid,
  p_qte_prevue numeric,
  p_date_prevue date,
  p_client_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_famille uuid;
  v_fam_client_check uuid;
  v_produit uuid;
  v_fam_nom text;
  v_ver_client uuid;
  v_version integer;
  v_rendement numeric;
  v_ingredients jsonb;
  v_site_client uuid;
  v_scale numeric;
  v_besoins jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_numero text;
  v_of_id uuid;
  v_code text;
  v_qty numeric;
  v_article uuid;
  b jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_version_id is null or p_site_id is null then
    raise exception 'Recette et site obligatoires.';
  end if;
  if p_qte_prevue is null or p_qte_prevue <= 0 or p_qte_prevue > 100000000 then
    raise exception 'Quantite prevue invalide.';
  end if;
  if p_date_prevue is null then
    raise exception 'Date prevue obligatoire.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a creer des OF.';
  end if;

  -- Idempotence hors-ligne : un meme client_ref ne cre jamais2 OF
  -- (resynchronisation de la file sans reseau ->0 doublon).
  if p_client_ref is not null and length(p_client_ref) between 1 and 64 then
    select o.id, o.numero, o.besoins into v_of_id, v_numero, v_besoins
      from public.ordres_fabrication o
     where o.client_id = v_client and o.client_ref = p_client_ref
     limit 1;
    if v_of_id is not null then
      return jsonb_build_object('of_id', v_of_id, 'numero', v_numero,
        'besoins', coalesce(v_besoins, '[]'::jsonb), 'duplicate', true);
    end if;
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then
    raise exception 'Site introuvable.';
  end if;
  if v_site_client <> v_client then
    raise exception 'Site hors perimetre.';
  end if;

  select rv.client_id, rv.famille_id, rv.version, rv.rendement_qte, rv.ingredients
    into v_ver_client, v_famille, v_version, v_rendement, v_ingredients
    from public.recette_versions rv where rv.id = p_version_id;
  if v_ver_client is null then
    raise exception 'Version de recette introuvable.';
  end if;
  if v_ver_client <> v_client then
    raise exception 'Version hors perimetre.';
  end if;

  select rf.client_id, rf.produit_id, rf.nom into v_fam_client_check, v_produit, v_fam_nom
    from public.recette_familles rf where rf.id = v_famille;
  if not found then
    raise exception 'Famille de recette introuvable.';
  end if;
  if v_fam_client_check <> v_client then
    raise exception 'Famille hors perimetre.';
  end if;
  if v_ingredients is null or jsonb_typeof(v_ingredients) <> 'array'
     or jsonb_array_length(v_ingredients) = 0 then
    raise exception 'Recette sans ingredients.';
  end if;
  if v_produit is null then
    raise exception 'Produit de la famille introuvable.';
  end if;

  v_scale := case when coalesce(v_rendement, 0) > 0 then p_qte_prevue / v_rendement else 1 end;

  -- Besoins etendus cote serveur : articles (avec parage + conversions
  -- d'unites) OU sous-recettes en version figee (profondeur max3), doublons
  -- fusionnes. Le client ne fournit jamais les besoins.
  v_besoins := public.patisgest_besoins_de_version(v_client, p_version_id, v_scale, 0);

  v_numero := 'OF-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_snapshot := jsonb_build_object(
    'recette', v_fam_nom,
    'version', v_version,
    'produitId', v_produit,
    'scale', v_scale
  );

  insert into public.ordres_fabrication
    (client_id, famille_id, version_id, site_id, numero, qte_prevue,
     qte_realisee, date_prevue, date_lancement, statut, snapshot, besoins,
     consommations, manquants, lots_produits, cout_reel, client_ref)
  values
    (v_client, v_famille, p_version_id, p_site_id, v_numero, p_qte_prevue,
     0, p_date_prevue, null, 'planifie', v_snapshot, v_besoins,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0,
     nullif(trim(coalesce(p_client_ref, '')), ''))
  returning id into v_of_id;

  return jsonb_build_object('of_id', v_of_id, 'numero', v_numero,
    'besoins', v_besoins, 'duplicate', false);
end;
$$;

-- ===== 17-confidentialite-couts-rls.sql =====
-- =====================================================================
-- Migration 17 — Confidentialité des coûts (revue indépendante 2026-11-17).
--
-- Problème mesuré avant cette migration, avec le JWT d'un compte VENDEUR :
--   select count(*) from public.parametres_couts;   -- 1  (taux horaire + charges)
--   select mo_min from public.recette_versions;     -- 30.00, energie, frais generaux
-- Les policies SELECT ne filtraient que le TENANT, jamais le ROLE : la
-- structure de coût (RC-01..RC-10) était lisible via l'API REST.
-- SPRINT2.md le signalait déjà ; « RLS3 » dans SPRINT3.md désignait
-- seulement 3 policies, pas une restriction par rôle.
--
-- Décision (cahier RG-15.2) : propriétaire + labo lisent les coûts ;
-- le vendeur encaisse et ne voit que des prix de vente.
--
-- Effets de bord traités ici :
--   * creer_of(uuid,uuid,numeric,date) — 4 args, surcharge historique
--     encore exécutable par `anon` et contournant l'idempotence client_ref
--     de la migration 16 : supprimée (l'app n'appelle que la version 5 args).
--   * rls_auto_enable() — utilitaire de DDL exposé à anon/authenticated :
--     révoqué.
-- Principe : `revoke all on function` d'abord, pour ne laisser aucun droit
-- résiduel hérité de PUBLIC.
-- Rejouable (drop policy if exists / create or replace).
-- =====================================================================

-- ---------------------------------------------------------------- RLS coûts
-- parametres_couts : taux horaire + charges % (RC-04)
drop policy if exists select_pc on public.parametres_couts;
create policy select_pc on public.parametres_couts
  for select to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo'));

-- recette_versions : mo_min, energie, emballage, frais_generaux, cuisson_perte_pct
drop policy if exists recette_versions_tenant_read on public.recette_versions;
create policy recette_versions_cost_read on public.recette_versions
  for select to authenticated using (
    client_id in (select u.client_id from public.utilisateurs u
                   where u.auth_user_id = auth.uid())
    and public.patisgest_mon_role() in ('proprietaire', 'labo'));

-- ------------------------------------------------- RPC simuler_recette
-- SECURITY DEFINER : elle contourne la RLS, donc elle doit vérifier le rôle
-- elle-même. Corps inchangé (relevé sur la base le 2026-11-17), + garde rôle.
create or replace function public.simuler_recette(p_produit_id uuid, p_qte numeric)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_fam record;
  v_ver record;
  v_scale numeric;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  -- Simuler une recette, c'est lire sa structure de coût.
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise : simulation reservee aux roles proprietaire et labo.';
  end if;
  if p_produit_id is null then raise exception 'Produit obligatoire.'; end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;

  select rf.id, rf.code, rf.nom into v_fam
    from public.recette_familles rf
   where rf.client_id = v_client and rf.produit_id = p_produit_id
   limit 1;
  if not found then raise exception 'Aucune recette pour ce produit.'; end if;

  select rv.id, rv.version, rv.rendement_qte, rv.rendement_unite, rv.ingredients into v_ver
    from public.recette_versions rv
   where rv.famille_id = v_fam.id and rv.active = true
   limit 1;
  if not found then raise exception 'Aucune version active pour ce produit.'; end if;
  if v_ver.rendement_qte is null or v_ver.rendement_qte <= 0 then
    raise exception 'Rendement invalide.';
  end if;

  v_scale := p_qte / v_ver.rendement_qte;
  return jsonb_build_object(
    'famille', jsonb_build_object('code', v_fam.code, 'nom', v_fam.nom),
    'version', v_ver.version,
    'rendement_qte', v_ver.rendement_qte,
    'rendement_unite', v_ver.rendement_unite,
    'scale', round(v_scale, 6),
    'besoins', public.patisgest_besoins_de_version(v_client, v_ver.id, v_scale, 0));
end;
$fn$;
revoke all on function public.simuler_recette(uuid, numeric) from public, anon, authenticated;
grant execute on function public.simuler_recette(uuid, numeric) to authenticated, service_role;

-- ---------------------------------------- Surcharge creer_of obsolète (4 args)
-- La migration 16 a livré creer_of(...,p_client_ref). L'ancienne signature
-- restait joignable (y compris par `anon`) et créait un OF sans idempotence.
-- rejeu: surcharge 4 args absente
-- rejeu: surcharge 4 args absente

-- creer_of 5 args : n'était accordée qu'à authenticated, mais l'ACL portait
-- aussi le droit par défaut `=X` (PUBLIC), que `anon` héritait -> révoqué.
revoke execute on function public.creer_of(uuid, uuid, numeric, date, text) from public;

-- --------------------------------------------------- outil DDL non exposé
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- ===== 18-restauration-sauvegarde.sql =====
-- =====================================================================
-- Migration 18 — US-15.2 : restauration d'une sauvegarde complète.
--
-- Constat mesuré sur la base (2026-11-17), policies par table :
--   ventes, clotures, recette_versions, recette_familles,
--   ordres_fabrication, transferts, bons_commande, cakes,
--   historique_prix, fournisseurs, z_imports  → SELECT seulement.
-- Ces tables s'écrivent par des RPC SECURITY DEFINER, jamais en direct.
-- Conséquence : une restauration faite par un simple INSERT côté client
-- échouerait au milieu et laisserait une base à moitié restaurée, en
-- annonçant un succès partiel. C'est exactement le « données identiques »
-- de CA-15 que l'on veut pouvoir prouver.
--
-- Cette migration fournit public.restaurer_sauvegarde(jsonb) :
--   * SECURITY DEFINER + garde de rôle explicite (proprietaire seulement),
--     même principe que simuler_recette / creer_of en migration 17 ;
--   * une seule transaction : tout ou rien ;
--   * client_id forcé à celui de l'appelant, TOUTE autre valeur est refusée
--     (empêche un dump forgé d'écrire chez un autre tenant) ;
--   * ordre topologique imposé, insertion colonne par colonne via jsonb_populate_record ;
--   * les lignes déjà présentes (même PK) sont comptées, pas fatales.
--
-- Rejouable (create or replace + revoke/grant).
-- =====================================================================

create or replace function public.restaurer_sauvegarde(p_dump jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth   uuid := auth.uid();
  v_client uuid;
  v_role   text;
  v_tbl    text;
  v_lignes jsonb;
  v_n      int;
  v_insere jsonb := '{}'::jsonb;
  v_ignore jsonb := '{}'::jsonb;
  -- Ordre topologique : une table n'apparaît qu'après celles qu'elle référence.
  v_ordre  text[] := array[
    'sites','fournisseurs','articles','conversions','parametres_couts',
    'recette_familles','recette_versions','lots','mouvements','historique_prix',
    'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
    'transferts','cakes','releve_temperatures','nettoyages','non_conformites',
    'taches_planning'
  ];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  -- Restaurer, c'est réécrire toutes les données de l'établissement.
  if v_role is distinct from 'proprietaire' then
    raise exception 'Role non autorise : restauration reservee au proprietaire.';
  end if;

  if p_dump is null or jsonb_typeof(p_dump) <> 'object' then
    raise exception 'Sauvegarde illisible.';
  end if;
  if p_dump->>'client_id' is distinct from v_client::text then
    raise exception 'Cette sauvegarde appartient a un autre etablissement.';
  end if;
  if jsonb_typeof(p_dump->'tables') <> 'array' then
    raise exception 'Sauvegarde sans tables.';
  end if;

  -- La racine doit exister : 21 cles etrangeres pointent vers clients.id.
  -- Une base vierge sans la ligne clients ne peut pas etre restauree ; on le
  -- dit explicitement au lieu d'echouer sur une violation de FK a mi-parcours.
  if not exists (select 1 from public.clients where id = v_client) then
    raise exception 'Etablissement introuvable : creez la fiche client avant de restaurer.';
  end if;

  foreach v_tbl in array v_ordre loop
    select t->'lignes' into v_lignes
      from jsonb_array_elements(p_dump->'tables') t
     where t->>'table' = v_tbl;
    if v_lignes is null or jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
      continue;
    end if;

    -- Garde multi-tenant : toute ligne portant un client_id étranger fait
    -- échouer la restauration AVANT d'écrire quoi que ce soit.
    if exists (
      select 1 from jsonb_array_elements(v_lignes) l
       where l ? 'client_id' and l->>'client_id' is distinct from v_client::text
    ) then
      raise exception 'Ligne etrangere detectee dans la table % : restauration refusee.', v_tbl;
    end if;

    begin
      if v_tbl = 'sites' then
        insert into public.sites select r.* from jsonb_populate_recordset(null::public.sites, v_lignes) r;
      elsif v_tbl = 'fournisseurs' then
        insert into public.fournisseurs select r.* from jsonb_populate_recordset(null::public.fournisseurs, v_lignes) r;
      elsif v_tbl = 'articles' then
        insert into public.articles select r.* from jsonb_populate_recordset(null::public.articles, v_lignes) r;
      elsif v_tbl = 'conversions' then
        insert into public.conversions select r.* from jsonb_populate_recordset(null::public.conversions, v_lignes) r;
      elsif v_tbl = 'parametres_couts' then
        insert into public.parametres_couts select r.* from jsonb_populate_recordset(null::public.parametres_couts, v_lignes) r;
      elsif v_tbl = 'recette_familles' then
        insert into public.recette_familles select r.* from jsonb_populate_recordset(null::public.recette_familles, v_lignes) r;
      elsif v_tbl = 'recette_versions' then
        insert into public.recette_versions select r.* from jsonb_populate_recordset(null::public.recette_versions, v_lignes) r;
      elsif v_tbl = 'lots' then
        insert into public.lots select r.* from jsonb_populate_recordset(null::public.lots, v_lignes) r;
      elsif v_tbl = 'mouvements' then
        insert into public.mouvements select r.* from jsonb_populate_recordset(null::public.mouvements, v_lignes) r;
      elsif v_tbl = 'historique_prix' then
        insert into public.historique_prix select r.* from jsonb_populate_recordset(null::public.historique_prix, v_lignes) r;
      elsif v_tbl = 'bons_commande' then
        insert into public.bons_commande select r.* from jsonb_populate_recordset(null::public.bons_commande, v_lignes) r;
      elsif v_tbl = 'ordres_fabrication' then
        insert into public.ordres_fabrication select r.* from jsonb_populate_recordset(null::public.ordres_fabrication, v_lignes) r;
      elsif v_tbl = 'ventes' then
        insert into public.ventes select r.* from jsonb_populate_recordset(null::public.ventes, v_lignes) r;
      elsif v_tbl = 'z_imports' then
        insert into public.z_imports select r.* from jsonb_populate_recordset(null::public.z_imports, v_lignes) r;
      elsif v_tbl = 'clotures' then
        insert into public.clotures select r.* from jsonb_populate_recordset(null::public.clotures, v_lignes) r;
      elsif v_tbl = 'transferts' then
        insert into public.transferts select r.* from jsonb_populate_recordset(null::public.transferts, v_lignes) r;
      elsif v_tbl = 'cakes' then
        insert into public.cakes select r.* from jsonb_populate_recordset(null::public.cakes, v_lignes) r;
      elsif v_tbl = 'releve_temperatures' then
        insert into public.releve_temperatures select r.* from jsonb_populate_recordset(null::public.releve_temperatures, v_lignes) r;
      elsif v_tbl = 'nettoyages' then
        insert into public.nettoyages select r.* from jsonb_populate_recordset(null::public.nettoyages, v_lignes) r;
      elsif v_tbl = 'non_conformites' then
        insert into public.non_conformites select r.* from jsonb_populate_recordset(null::public.non_conformites, v_lignes) r;
      elsif v_tbl = 'taches_planning' then
        insert into public.taches_planning select r.* from jsonb_populate_recordset(null::public.taches_planning, v_lignes) r;
      end if;
      get diagnostics v_n = row_count;
      v_insere := v_insere || jsonb_build_object(v_tbl, v_n);
    exception
      when unique_violation then
        -- Lignes déjà présentes : on ne double pas, on le signale.
        v_ignore := v_ignore || jsonb_build_object(v_tbl, jsonb_array_length(v_lignes));
    end;
  end loop;

  return jsonb_build_object('insere', v_insere, 'ignore', v_ignore);
end;
$fn$;

-- Aucun droit hérité de PUBLIC, puis exécution limitée aux comptes connectés.
revoke all on function public.restaurer_sauvegarde(jsonb) from public, anon, authenticated;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated, service_role;

-- ===== 19-confidentialite-familles-recettes.sql =====
-- Les familles de recettes exposent la structure de gamme, même en l'absence
-- de versions. Aligner leur lecture (y compris via PostgREST) sur la migration
-- 17 : uniquement le propriétaire et le laboratoire du même établissement.

drop policy if exists recette_familles_tenant_read on public.recette_familles;
drop policy if exists recette_familles_cost_read on public.recette_familles;
create policy recette_familles_cost_read on public.recette_familles
  for select to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- ===== 20-creation-fournisseur.sql =====
-- US-15.3 — ajout d'une fiche fournisseur depuis Achats / le guide.
-- Pas d'UPDATE ni de DELETE : accès en insertion au seul établissement du rôle autorisé.

-- Remplacer les grants INSERT par défaut de Supabase par les deux colonnes utiles.
revoke insert on public.fournisseurs from public, anon, authenticated;
grant insert (client_id, nom) on public.fournisseurs to authenticated;

drop policy if exists fournisseurs_tenant_insert on public.fournisseurs;
create policy fournisseurs_tenant_insert on public.fournisseurs
  for insert to authenticated with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and char_length(btrim(nom)) between 1 and 120
  );

-- ===== 21-prix-demain-panier.sql =====
-- =====================================================================
-- Migration 21 — Volets A & B :
--   * Confidentialité RLS sur `historique_prix` et `bons_commande`
--     (prix d'achat fournisseurs réservés à proprietaire et labo).
--   * `receptionner_lot` alimente `historique_prix` dès que p_pu > 0
--     (mercuriale vérifiée sans ressaisie, sans OCR).
--   * Éligibilité FEFO explicite : exclusion des lots bloqués ET des lots
--     périmés (`l.dlc is null or l.dlc >= current_date` / `p_date`) dans
--     `vendre_panier`, `vendre_article`, `demarrer_of`, `transferer_article`
--     et `importer_z` — traçabilité, blocage et rappel intégralement conservés.
--   * Panier de caisse multiproduit atomique & idempotent (`vendre_panier`),
--     verrouillage ordonné anti-interblocage, arrondi exact au centime par
--     ligne, mode de règlement enregistré (`ventes.mode_paiement`, nullable
--     pour compatibilité sauvegarde v1).
--   * Table `demandes_reassort` + RPC `creer_demande_reassort` et
--     `traiter_demandes_reassort` (« Demain au labo » : boutique → labo).
--   * Transferts tracés avec `ref` et `responsable` (nullables).
--   * `saisir_cloture` enrichi d'un `p_caisse_bilan` facultatif séparé des
--     6 flux quantités produits (`clotures.caisse_bilan`, nullable).
--   * `restaurer_sauvegarde` mis à jour avec `demandes_reassort` tout en
--     acceptant les sauvegardes v1 antérieures (22 tables).
--
-- Migration 100 % idempotente et rejouable. Aucun reseed de données.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Confidentialité des prix d'achat fournisseurs (RLS)
-- ---------------------------------------------------------------------
drop policy if exists historique_prix_tenant_read on public.historique_prix;
drop policy if exists historique_prix_cout_read on public.historique_prix;
create policy historique_prix_cout_read on public.historique_prix
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists bons_commande_tenant_read on public.bons_commande;
drop policy if exists bons_commande_cout_read on public.bons_commande;
create policy bons_commande_cout_read on public.bons_commande
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- ---------------------------------------------------------------------
-- 2. Colonnes nullables (100 % compatibles jsonb_populate_recordset v1)
-- ---------------------------------------------------------------------
alter table public.ventes
  add column if not exists mode_paiement text null;

alter table public.ventes
  drop constraint if exists ventes_mode_paiement_valid;
alter table public.ventes
  add constraint ventes_mode_paiement_valid
  check (mode_paiement is null or mode_paiement in ('especes', 'carte', 'cheque_virement'));

alter table public.transferts
  add column if not exists ref text null;
alter table public.transferts
  add column if not exists responsable text null;

alter table public.clotures
  add column if not exists caisse_bilan jsonb null;

-- ---------------------------------------------------------------------
-- 3. Table `demandes_reassort` (« Demain au labo » : boutique -> labo)
-- ---------------------------------------------------------------------
create table if not exists public.demandes_reassort (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  article_id uuid not null references public.articles(id) on delete cascade,
  date_cible date not null,
  qte numeric(14,4) not null check (qte > 0 and qte <= 100000000),
  motif text not null default '',
  demandeur text not null default '',
  statut text not null default 'ouverte'
    check (statut in ('ouverte', 'planifiee', 'transferee', 'annulee')),
  of_id uuid null references public.ordres_fabrication(id) on delete set null,
  transfert_id uuid null references public.transferts(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists demandes_reassort_client_date_idx
  on public.demandes_reassort (client_id, date_cible, statut);

alter table public.demandes_reassort enable row level security;

revoke all on table public.demandes_reassort from public, anon;
grant select on table public.demandes_reassort to authenticated, service_role;

drop policy if exists demandes_reassort_tenant_read on public.demandes_reassort;
create policy demandes_reassort_tenant_read on public.demandes_reassort
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

create or replace function public.creer_demande_reassort(
  p_site_id uuid,
  p_article_id uuid,
  p_date_cible date,
  p_qte numeric,
  p_motif text default '',
  p_demandeur text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_art record;
  v_motif text := trim(coalesce(p_motif, ''));
  v_demandeur text := trim(coalesce(p_demandeur, ''));
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise.';
  end if;

  if p_site_id is null or p_article_id is null or p_date_cible is null then
    raise exception 'Boutique, produit et date cible sont obligatoires.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite demandee invalide.';
  end if;
  if length(v_motif) > 200 then
    raise exception 'Motif trop long (200 caracteres maximum).';
  end if;
  if length(v_demandeur) > 80 then
    raise exception 'Demandeur trop long (80 caracteres maximum).';
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then
    raise exception 'Boutique introuvable ou hors perimetre.';
  end if;

  select a.id, a.client_id, a.niveau, a.nom into v_art
    from public.articles a where a.id = p_article_id;
  if v_art.client_id is distinct from v_client or v_art.niveau <> 'produit' then
    raise exception 'Produit fini introuvable ou hors perimetre.';
  end if;

  insert into public.demandes_reassort
    (client_id, site_id, article_id, date_cible, qte, motif, demandeur, statut)
  values
    (v_client, p_site_id, p_article_id, p_date_cible, round(p_qte, 4), v_motif, v_demandeur, 'ouverte')
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'produit', v_art.nom, 'qte', round(p_qte, 4), 'date_cible', p_date_cible);
end;
$$;

revoke all on function public.creer_demande_reassort(uuid, uuid, date, numeric, text, text) from public, anon, authenticated;
grant execute on function public.creer_demande_reassort(uuid, uuid, date, numeric, text, text) to authenticated, service_role;

create or replace function public.traiter_demandes_reassort(
  p_ids uuid[],
  p_statut text,
  p_of_id uuid default null,
  p_transfert_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_count int := 0;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise : validation reservee au laboratoire ou au proprietaire.';
  end if;
  if p_statut not in ('ouverte', 'planifiee', 'transferee', 'annulee') then
    raise exception 'Statut de demande invalide.';
  end if;
  if p_ids is null or coalesce(array_length(p_ids, 1), 0) = 0 then
    return jsonb_build_object('updated', 0);
  end if;
  if p_of_id is not null and not exists (
    select 1 from public.ordres_fabrication o where o.id = p_of_id and o.client_id = v_client
  ) then
    raise exception 'OF hors perimetre.';
  end if;
  if p_transfert_id is not null and not exists (
    select 1 from public.transferts t where t.id = p_transfert_id and t.client_id = v_client
  ) then
    raise exception 'Transfert hors perimetre.';
  end if;

  update public.demandes_reassort d
     set statut = p_statut,
         of_id = coalesce(p_of_id, d.of_id),
         transfert_id = coalesce(p_transfert_id, d.transfert_id)
   where d.client_id = v_client
     and d.id = any(p_ids);
  get diagnostics v_count = row_count;

  return jsonb_build_object('updated', v_count, 'statut', p_statut);
end;
$$;

revoke all on function public.traiter_demandes_reassort(uuid[], text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.traiter_demandes_reassort(uuid[], text, uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 4. Réception de lot : alimente aussi `historique_prix` quand p_pu > 0
-- ---------------------------------------------------------------------
create or replace function public.receptionner_lot(
  p_article_id uuid,
  p_site_id uuid,
  p_numero text,
  p_qte numeric,
  p_pu numeric,
  p_dlc date default null,
  p_fournisseur_id uuid default null,
  p_ref text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_lot uuid;
  v_numero text := trim(coalesce(p_numero, ''));
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a receptionner.';
  end if;

  if p_article_id is null or p_site_id is null then
    raise exception 'Article et site sont obligatoires.';
  end if;
  if length(v_numero) < 1 or length(v_numero) > 80 then
    raise exception 'Numéro de lot invalide (1 à 80 caractères).';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantité invalide.';
  end if;
  if p_pu is null or p_pu < 0 or p_pu > 100000000 then
    raise exception 'Prix unitaire invalide.';
  end if;
  if p_ref is not null and length(trim(p_ref)) > 80 then
    raise exception 'Référence trop longue.';
  end if;

  if not exists (select 1 from public.articles a where a.id = p_article_id and a.client_id = v_client) then
    raise exception 'Article introuvable ou hors perimetre.';
  end if;
  if not exists (select 1 from public.sites s where s.id = p_site_id and s.client_id = v_client) then
    raise exception 'Site introuvable ou hors perimetre.';
  end if;
  if p_fournisseur_id is not null and not exists (
    select 1 from public.fournisseurs f where f.id = p_fournisseur_id and f.client_id = v_client
  ) then
    raise exception 'Fournisseur introuvable ou hors perimetre.';
  end if;

  insert into public.lots (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, ref)
  values (v_client, p_article_id, p_site_id, p_fournisseur_id, v_numero, p_qte, p_qte, p_pu, p_dlc, nullif(trim(coalesce(p_ref, '')), ''))
  returning id into v_lot;

  insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
  values (v_client, p_article_id, v_lot, p_site_id, 'reception', p_qte, p_pu, v_numero, 'Réception');

  if p_pu > 0 then
    insert into public.historique_prix (client_id, article_id, fournisseur_id, date_prix, pu)
    values (v_client, p_article_id, p_fournisseur_id, current_date, p_pu);
  end if;

  return v_lot;
end;
$$;

revoke all on function public.receptionner_lot(uuid, uuid, text, numeric, numeric, date, uuid, text) from public, anon, authenticated;
grant execute on function public.receptionner_lot(uuid, uuid, text, numeric, numeric, date, uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 5. Panier caisse multiproduit atomique & FEFO éligible (`vendre_panier`)
-- ---------------------------------------------------------------------
create or replace function public.vendre_panier(
  p_site_id uuid,
  p_lignes jsonb,
  p_ticket text,
  p_mode_paiement text default 'especes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_ticket text := trim(coalesce(p_ticket, ''));
  v_mode text := coalesce(nullif(trim(coalesce(p_mode_paiement, '')), ''), 'especes');
  v_existing record;
  v_sale_id uuid;
  v_numero text;
  v_item record;
  v_art record;
  v_remaining numeric;
  v_line_missing numeric;
  v_missing_total numeric := 0;
  v_take numeric;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_consumed jsonb;
  v_all_lots jsonb := '[]'::jsonb;
  v_lignes_out jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  r record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if length(v_ticket) < 1 or length(v_ticket) > 80 then
    raise exception 'Ticket invalide.';
  end if;
  if v_mode not in ('especes', 'carte', 'cheque_virement') then
    raise exception 'Mode de reglement invalide.';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 50 then
    raise exception 'Le panier doit contenir entre 1 et 50 produits.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a vendre.';
  end if;

  -- Idempotence : le rejeu d'un ticket déjà enregistré ne déduit jamais deux fois le stock.
  select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement
    into v_existing
    from public.ventes v
   where v.client_id = v_client and v.ticket = v_ticket
   limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'numero', v_existing.numero,
      'duplicate', true,
      'missing', 0,
      'totalHT', v_existing.total_ht,
      'totalTTC', v_existing.total_ttc,
      'modePaiement', v_existing.mode_paiement,
      'lots', '[]'::jsonb
    );
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  v_numero := 'V-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);

  begin
    insert into public.ventes
      (client_id, site_id, numero, ticket, date_vente, source, mode_paiement, lignes, manquants, total_ht, total_ttc)
    values
      (v_client, p_site_id, v_numero, v_ticket, current_date, 'caisse', v_mode, '[]'::jsonb, '[]'::jsonb, 0, 0)
    returning id into v_sale_id;
  exception when unique_violation then
    select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement
      into v_existing
      from public.ventes v
     where v.client_id = v_client and v.ticket = v_ticket
     limit 1;
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'numero', v_existing.numero,
      'duplicate', true,
      'missing', 0,
      'totalHT', coalesce(v_existing.total_ht, 0),
      'totalTTC', coalesce(v_existing.total_ttc, 0),
      'modePaiement', v_existing.mode_paiement,
      'lots', '[]'::jsonb
    );
  end;

  -- Fusion des doublons et tri déterministe par article_id (zéro interblocage FOR UPDATE).
  for v_item in
    select
      (coalesce(x->>'articleId', x->>'article_id'))::uuid as article_id,
      round(sum((x->>'qte')::numeric), 4) as qte
    from jsonb_array_elements(p_lignes) x
    group by (coalesce(x->>'articleId', x->>'article_id'))::uuid
    order by (coalesce(x->>'articleId', x->>'article_id'))::uuid asc
  loop
    if v_item.article_id is null or v_item.qte is null or v_item.qte <= 0 or v_item.qte > 100000000 then
      raise exception 'Ligne de panier invalide (produit ou quantite).';
    end if;

    select a.id, a.client_id, a.niveau, a.nom, a.code, a.pv_ht, a.tva
      into v_art
      from public.articles a where a.id = v_item.article_id;
    if v_art.client_id is null then raise exception 'Article introuvable.'; end if;
    if v_art.client_id <> v_client then raise exception 'Article hors perimetre.'; end if;
    if v_art.niveau <> 'produit' then raise exception 'Seuls les produits finis peuvent etre vendus en caisse.'; end if;
    if v_art.pv_ht is null or v_art.pv_ht < 0 or v_art.tva is null or v_art.tva < 0 or v_art.tva > 100 then
      raise exception 'Prix ou TVA article invalide.';
    end if;

    v_remaining := v_item.qte;
    v_line_missing := 0;
    v_consumed := '[]'::jsonb;

    -- FEFO éligible : ni lot bloqué, ni lot périmé (dlc < current_date).
    for r in
      select l.id, l.qte_rest, l.numero
        from public.lots l
       where l.client_id = v_client
         and l.article_id = v_art.id
         and l.site_id = p_site_id
         and not l.bloque
         and l.qte_rest > 0
         and (l.dlc is null or l.dlc >= current_date)
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(r.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
      v_all_lots := v_all_lots || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take, 'articleId', v_art.id);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_art.id, r.id, p_site_id, 'vente', -v_take, v_art.pv_ht, v_ticket, 'Vente');
    end loop;

    if v_remaining > 0 then
      v_line_missing := v_remaining;
      v_missing_total := round(v_missing_total + v_remaining, 4);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_art.id, null, p_site_id, 'vente', -v_remaining, v_art.pv_ht, v_ticket, 'Vente sans stock');
      v_manquants := v_manquants || jsonb_build_object('articleId', v_art.id, 'qty', v_remaining);
    end if;

    v_line_ht := round(v_item.qte * v_art.pv_ht, 2);
    v_line_ttc := round(v_item.qte * v_art.pv_ht * (1 + v_art.tva / 100), 2);
    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;

    v_lignes_out := v_lignes_out || jsonb_build_object(
      'articleId', v_art.id,
      'code', v_art.code,
      'nom', v_art.nom,
      'qty', v_item.qte,
      'pu', v_art.pv_ht,
      'tva', v_art.tva,
      'totalHT', v_line_ht,
      'totalTTC', v_line_ttc,
      'lots', v_consumed,
      'missing', v_line_missing
    );
  end loop;

  update public.ventes v
     set lignes = v_lignes_out,
         manquants = v_manquants,
         total_ht = round(v_total_ht, 2),
         total_ttc = round(v_total_ttc, 2)
   where v.id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'numero', v_numero,
    'duplicate', false,
    'missing', v_missing_total,
    'totalHT', round(v_total_ht, 2),
    'totalTTC', round(v_total_ttc, 2),
    'modePaiement', v_mode,
    'lines', jsonb_array_length(v_lignes_out),
    'lots', v_all_lots
  );
end;
$$;

revoke all on function public.vendre_panier(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.vendre_panier(uuid, jsonb, text, text) to authenticated, service_role;

-- Compatibilité ascendante : `vendre_article` délègue à `vendre_panier` (FEFO éligible).
create or replace function public.vendre_article(
  p_article_id uuid,
  p_site_id uuid,
  p_qte numeric,
  p_ticket text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_article_id is null or p_site_id is null then
    raise exception 'Article et site obligatoires.';
  end if;
  return public.vendre_panier(
    p_site_id,
    jsonb_build_array(jsonb_build_object('articleId', p_article_id, 'qte', p_qte)),
    p_ticket,
    'especes'
  );
end;
$$;

revoke all on function public.vendre_article(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.vendre_article(uuid, uuid, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 6. FEFO éligible en production (`demarrer_of`) et en transfert (`transferer_article`)
-- ---------------------------------------------------------------------
create or replace function public.demarrer_of(p_of_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_of record;
  b jsonb;
  v_article uuid;
  v_code text;
  v_remaining numeric;
  v_take numeric;
  v_lot record;
  v_consommations jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_of_id is null then raise exception 'OF obligatoire.'; end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then raise exception 'Role non autorise.'; end if;

  select o.* into v_of from public.ordres_fabrication o where o.id = p_of_id for update;
  if not found then raise exception 'OF introuvable.'; end if;
  if v_of.client_id <> v_client then raise exception 'OF hors perimetre.'; end if;
  if v_of.statut <> 'planifie' then raise exception 'OF non planifie.'; end if;
  if v_of.besoins is null or jsonb_typeof(v_of.besoins) <> 'array'
     or jsonb_array_length(v_of.besoins) = 0 then
    raise exception 'OF sans besoins.';
  end if;

  for b in select value from jsonb_array_elements(v_of.besoins) loop
    begin
      v_article := (b->>'articleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Article ingredient invalide.';
    end;
    if v_article is null then raise exception 'Article ingredient manquant.'; end if;
    select a.id, a.code into v_article, v_code from public.articles a
     where a.id = v_article and a.client_id = v_client limit 1;
    if not found then raise exception 'Article ingredient introuvable.'; end if;

    v_remaining := (b->>'qty')::numeric;
    if v_remaining is null or v_remaining <= 0 then raise exception 'Besoin invalide.'; end if;

    -- FEFO éligible : exclut les lots bloqués ET les lots dont la DLC est dépassée.
    for v_lot in
      select l.id, l.numero, l.qte_rest, l.pu
        from public.lots l
       where l.client_id = v_client
         and l.article_id = v_article
         and l.site_id = v_of.site_id
         and not l.bloque
         and l.qte_rest > 0
         and (l.dlc is null or l.dlc >= current_date)
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(v_lot.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = v_lot.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consommations := v_consommations || jsonb_build_object(
        'articleId', v_article,
        'code', v_code,
        'lotId', v_lot.id,
        'numero', v_lot.numero,
        'qty', v_take,
        'pu', coalesce(v_lot.pu, 0),
        'puEstime', coalesce(v_lot.pu, 0) <= 0
      );
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_article, v_lot.id, v_of.site_id, 'production', -v_take, coalesce(v_lot.pu, 0), v_of.numero, 'Production');
    end loop;

    if v_remaining > 0 then
      v_manquants := v_manquants || jsonb_build_object('articleId', v_article, 'code', v_code, 'qty', v_remaining);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_article, null, v_of.site_id, 'production', -v_remaining, 0, v_of.numero, 'Production sans stock');
    end if;
  end loop;

  update public.ordres_fabrication o
     set statut = 'encours',
         date_lancement = coalesce(o.date_lancement, current_date),
         consommations = v_consommations,
         manquants = v_manquants
   where o.id = p_of_id;

  return jsonb_build_object(
    'of_id', p_of_id,
    'numero', v_of.numero,
    'consommations', jsonb_array_length(v_consommations),
    'manquants', jsonb_array_length(v_manquants)
  );
end;
$$;

revoke all on function public.demarrer_of(uuid) from public, anon, authenticated;
grant execute on function public.demarrer_of(uuid) to authenticated, service_role;

drop function if exists public.transferer_article(uuid, uuid, uuid, numeric, text);

create or replace function public.transferer_article(
  p_article_id uuid,
  p_from_site_id uuid,
  p_to_site_id uuid,
  p_qte numeric,
  p_motif text,
  p_responsable text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_article_client uuid;
  v_from_client uuid;
  v_to_client uuid;
  v_available numeric;
  v_expired numeric;
  v_remaining numeric;
  v_take numeric;
  v_transfert_id uuid;
  v_ref text;
  v_lignes jsonb := '[]'::jsonb;
  v_lot record;
  v_dest_id uuid;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
  v_resp text := nullif(trim(coalesce(p_responsable, '')), '');
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_article_id is null or p_from_site_id is null or p_to_site_id is null then
    raise exception 'Article et sites obligatoires.';
  end if;
  if p_from_site_id = p_to_site_id then
    raise exception 'Sites de depart et d arrivee distincts requis.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;
  if v_motif is not null and length(v_motif) > 120 then
    raise exception 'Motif trop long (120 caractères maximum).';
  end if;
  if v_resp is not null and length(v_resp) > 80 then
    raise exception 'Responsable trop long (80 caractères maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a transférer.';
  end if;

  select a.client_id into v_article_client from public.articles a where a.id = p_article_id;
  if v_article_client is distinct from v_client then raise exception 'Article introuvable ou hors perimetre.'; end if;
  select s.client_id into v_from_client from public.sites s where s.id = p_from_site_id;
  if v_from_client is distinct from v_client then raise exception 'Site de depart introuvable ou hors perimetre.'; end if;
  select s.client_id into v_to_client from public.sites s where s.id = p_to_site_id;
  if v_to_client is distinct from v_client then raise exception 'Site d arrivee introuvable ou hors perimetre.'; end if;

  -- Stock éligible au départ : ni lot bloqué, ni lot périmé.
  select
    coalesce(sum(l.qte_rest) filter (where l.dlc is null or l.dlc >= current_date), 0),
    coalesce(sum(l.qte_rest) filter (where l.dlc is not null and l.dlc < current_date), 0)
    into v_available, v_expired
    from public.lots l
   where l.client_id = v_client
     and l.article_id = p_article_id
     and l.site_id = p_from_site_id
     and not l.bloque
     and l.qte_rest > 0;

  if p_qte > v_available then
    raise exception '%',
      'Stock eligible insuffisant pour ce transfert (disponible : ' || v_available
      || case when v_expired > 0 then ', dont ' || v_expired || ' exclu(s) pour DLC depassee' else '' end || ').';
  end if;

  v_remaining := round(p_qte, 4);
  v_ref := 'TR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  for v_lot in
    select l.id, l.numero, l.qte_rest, l.pu, l.dlc, l.congele, l.date_reception, l.fournisseur_id
      from public.lots l
     where l.client_id = v_client
       and l.article_id = p_article_id
       and l.site_id = p_from_site_id
       and not l.bloque
       and l.qte_rest > 0
       and (l.dlc is null or l.dlc >= current_date)
     order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
       for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.qte_rest, v_remaining);
    update public.lots l set qte_rest = l.qte_rest - v_take where l.id = v_lot.id;
    v_remaining := round(v_remaining - v_take, 4);

    insert into public.lots
      (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, date_reception, ref, congele, bloque)
    values
      (v_client, p_article_id, p_to_site_id, v_lot.fournisseur_id, v_lot.numero, v_take, v_take,
       v_lot.pu, v_lot.dlc, v_lot.date_reception, v_ref, v_lot.congele, false)
    returning id into v_dest_id;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, v_lot.id, p_from_site_id, 'transfert', -v_take, v_lot.pu, v_ref,
            coalesce('Transfert · ' || v_resp, 'Transfert'));
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, v_dest_id, p_to_site_id, 'transfert', v_take, v_lot.pu, v_ref,
            coalesce('Transfert · ' || v_resp, 'Transfert'));

    v_lignes := v_lignes || jsonb_build_object(
      'articleId', p_article_id,
      'fromLotId', v_lot.id,
      'toLotId', v_dest_id,
      'numero', v_lot.numero,
      'dlc', v_lot.dlc,
      'qty', v_take
    );
  end loop;

  if v_remaining > 0 then
    raise exception 'Stock eligible insuffisant pour ce transfert.';
  end if;

  insert into public.transferts
    (client_id, date_transfert, from_site_id, to_site_id, ref, responsable, motif, lignes)
  values
    (v_client, current_date, p_from_site_id, p_to_site_id, v_ref, v_resp, v_motif, v_lignes)
  returning id into v_transfert_id;

  return jsonb_build_object(
    'transfert_id', v_transfert_id,
    'ref', v_ref,
    'responsable', v_resp,
    'lots', jsonb_array_length(v_lignes),
    'qte', p_qte
  );
end;
$$;

revoke all on function public.transferer_article(uuid, uuid, uuid, numeric, text, text) from public, anon, authenticated;
grant execute on function public.transferer_article(uuid, uuid, uuid, numeric, text, text) to authenticated, service_role;

-- Import Z : applique la même exclusion des lots périmés à `p_date`.
create or replace function public.importer_z(
  p_date date,
  p_site_id uuid,
  p_caisse text,
  p_numero_z text,
  p_csv text,
  p_confirm boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_caisse text := trim(coalesce(p_caisse, ''));
  v_numero text := trim(coalesce(p_numero_z, ''));
  v_rows text[];
  v_row text;
  v_parts text[];
  v_idx int := 0;
  v_code text;
  v_qty numeric;
  v_pu numeric;
  v_cnt int;
  v_article record;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_z_id uuid;
  v_similar int;
  v_ticket text;
  v_numero_vente text;
  v_sale_id uuid;
  v_remaining numeric;
  v_take numeric;
  v_consumed jsonb;
  v_line_missing numeric;
  v_missing_total numeric := 0;
  v_lignes_out jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  r record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then raise exception 'Role non autorise.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Date Z invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site introuvable ou hors perimetre.'; end if;
  if length(v_caisse) < 1 or length(v_caisse) > 80 or length(v_numero) < 1 or length(v_numero) > 80 then
    raise exception 'Caisse et numero Z obligatoires (80 caracteres max).';
  end if;
  if p_csv is null or length(trim(p_csv)) < 1 or length(p_csv) > 50000 then
    raise exception 'Contenu Z invalide.';
  end if;

  v_rows := regexp_split_to_array(trim(p_csv), E'\\r?\\n');
  foreach v_row in array v_rows loop
    v_row := trim(v_row);
    if v_row = '' then continue; end if;
    v_idx := v_idx + 1;
    if v_idx > 100 then raise exception 'Trop de lignes (100 maximum).'; end if;
    v_parts := regexp_split_to_array(v_row, ';');
    if coalesce(array_length(v_parts, 1), 0) <> 3 then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : utilisez code;quantite;prix HT (sans en-tete).';
    end if;
    v_code := trim(v_parts[1]);
    if v_code = '' or v_code !~ '^[0-9A-Za-z._-]+$' then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : code produit.';
    end if;
    if v_parts[2] !~ '^[0-9]+([.,][0-9]{1,4})?$' or v_parts[3] !~ '^[0-9]+([.,][0-9]{1,2})?$' then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : utilisez code;quantite;prix HT (sans en-tete).';
    end if;
    v_qty := replace(v_parts[2], ',', '.')::numeric;
    v_pu := replace(v_parts[3], ',', '.')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 or v_pu is null or v_pu < 0 or v_pu > 1000000000 then
      raise exception '%', 'Quantite ou prix invalide a la ligne ' || v_idx || '.';
    end if;

    select count(*) into v_cnt from public.articles a
     where a.client_id = v_client and upper(a.code) = upper(v_code) and a.niveau = 'produit';
    if v_cnt = 0 then
      raise exception '%', 'Code produit inconnu a la ligne ' || v_idx || ' : ' || v_code || '. Aucun import n''a ete effectue.';
    end if;
    if v_cnt > 1 then
      raise exception '%', 'Code produit ambigu a la ligne ' || v_idx || ' : ' || v_code || '.';
    end if;
    select a.id, a.code, a.tva into v_article from public.articles a
     where a.client_id = v_client and upper(a.code) = upper(v_code) and a.niveau = 'produit';
    if v_article.tva is null or v_article.tva < 0 or v_article.tva > 100 then
      raise exception '%', 'TVA invalide pour ' || v_article.code || '.';
    end if;

    v_line_ht := round(v_qty * v_pu, 2);
    v_line_ttc := round(v_qty * v_pu * (1 + v_article.tva / 100), 2);
    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;
    v_lines := v_lines || jsonb_build_object(
      'articleId', v_article.id, 'code', v_article.code, 'qty', v_qty, 'pu', v_pu,
      'tva', v_article.tva, 'totalHT', v_line_ht, 'totalTTC', v_line_ttc);
  end loop;
  if v_idx < 1 then raise exception 'Ajoutez entre 1 et 100 lignes.'; end if;

  begin
    insert into public.z_imports (client_id, site_id, date_z, caisse, numero_z, lignes, total_ht, total_ttc, imported_by)
    values (v_client, p_site_id, p_date, v_caisse, v_numero, v_lines, v_total_ht, v_total_ttc, v_auth)
    returning id into v_z_id;
  exception when unique_violation then
    select z.id into v_z_id from public.z_imports z
     where z.client_id = v_client and z.date_z = p_date and z.site_id = p_site_id
       and z.caisse = v_caisse and z.numero_z = v_numero;
    return jsonb_build_object('z_import_id', v_z_id, 'sale_id', null, 'duplicate', true,
      'lines', jsonb_array_length(v_lines), 'totalHT', v_total_ht, 'totalTTC', v_total_ttc, 'missing', 0);
  end;

  select count(*) into v_similar from public.z_imports z
   where z.client_id = v_client and z.date_z = p_date and z.site_id = p_site_id
     and z.id <> v_z_id and abs(z.total_ht - v_total_ht) < 0.005;
  if v_similar > 0 and not coalesce(p_confirm, false) then
    raise exception 'Un autre Z du meme jour a le meme total HT. Verifiez et confirmez cet import distinct.';
  end if;

  v_ticket := 'Z-' || v_numero || '-' || to_char(p_date, 'YYMMDD') || '-' || substr(md5(v_caisse), 1, 4);
  v_numero_vente := 'Z-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
  insert into public.ventes (client_id, site_id, numero, ticket, date_vente, source, lignes, manquants, total_ht, total_ttc)
  values (v_client, p_site_id, v_numero_vente, v_ticket, p_date, 'z-import', '[]'::jsonb, '[]'::jsonb, 0, 0)
  returning id into v_sale_id;

  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_remaining := (v_lines->i->>'qty')::numeric;
    v_consumed := '[]'::jsonb;
    v_line_missing := 0;
    for r in
      select l.id, l.qte_rest, l.numero from public.lots l
       where l.client_id = v_client
         and l.article_id = (v_lines->i->>'articleId')::uuid
         and l.site_id = p_site_id
         and not l.bloque
         and l.qte_rest > 0
         and (l.dlc is null or l.dlc >= p_date)
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(r.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, (v_lines->i->>'articleId')::uuid, r.id, p_site_id, 'vente', -v_take,
              (v_lines->i->>'pu')::numeric, v_ticket, 'Vente Z');
    end loop;
    if v_remaining > 0 then
      v_line_missing := v_remaining;
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, (v_lines->i->>'articleId')::uuid, null, p_site_id, 'vente', -v_remaining,
              (v_lines->i->>'pu')::numeric, v_ticket, 'Vente Z sans stock');
      v_manquants := v_manquants || jsonb_build_object('articleId', (v_lines->i->>'articleId')::uuid, 'qty', v_remaining);
      v_missing_total := v_missing_total + v_remaining;
    end if;
    v_lignes_out := v_lignes_out || ((v_lines->i) || jsonb_build_object('lots', v_consumed, 'missing', v_line_missing));
  end loop;

  update public.ventes v
     set lignes = v_lignes_out, manquants = v_manquants,
         total_ht = v_total_ht, total_ttc = v_total_ttc
   where v.id = v_sale_id;
  update public.z_imports z set vente_id = v_sale_id where z.id = v_z_id;

  return jsonb_build_object(
    'z_import_id', v_z_id, 'sale_id', v_sale_id, 'duplicate', false,
    'lines', jsonb_array_length(v_lines), 'totalHT', v_total_ht,
    'totalTTC', v_total_ttc, 'missing', v_missing_total);
end;
$$;

revoke all on function public.importer_z(date, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.importer_z(date, uuid, text, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Clôture : flux produits + bilan espèces facultatif séparé
-- ---------------------------------------------------------------------
drop function if exists public.saisir_cloture(date, uuid, jsonb, boolean);

create or replace function public.saisir_cloture(
  p_date date,
  p_site_id uuid,
  p_lignes jsonb,
  p_revise boolean default false,
  p_caisse_bilan jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_existing int;
  v_revision int := 1;
  l jsonb;
  v_article uuid;
  v_seen uuid[] := '{}';
  v_enriched jsonb := '[]'::jsonb;
  v_art record;
  v_produit numeric;
  v_vendu numeric;
  v_reporte numeric;
  v_jete numeric;
  v_casse numeric;
  v_offert numeric;
  v_caisse jsonb := null;
  v_fond numeric;
  v_sorties numeric;
  v_comptees numeric;
  v_motif_s text;
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then raise exception 'Role non autorise.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site introuvable ou hors perimetre.'; end if;

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Liste de produits invalide (1 a 100).';
  end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  if v_existing > 0 and not coalesce(p_revise, false) then
    raise exception 'Une cloture existe deja pour ce site et cette date. Cochez la correction pour creer une nouvelle revision.';
  end if;
  v_revision := v_existing + 1;

  for l in select value from jsonb_array_elements(p_lignes) loop
    v_article := (l->>'articleId')::uuid;
    if v_article is null or v_article = any(v_seen) then
      raise exception 'Produit invalide ou en double.';
    end if;
    v_seen := array_append(v_seen, v_article);

    select a.id, a.code, a.nom, a.unite, a.pv_ht, a.niveau into v_art
      from public.articles a where a.id = v_article and a.client_id = v_client;
    if not found or v_art.niveau <> 'produit' then
      raise exception 'Produit fini introuvable ou hors perimetre.';
    end if;

    v_produit := round(coalesce((l->>'produit')::numeric, 0), 4);
    v_vendu   := round(coalesce((l->>'vendu')::numeric, 0), 4);
    v_reporte := round(coalesce((l->>'reporte')::numeric, 0), 4);
    v_jete    := round(coalesce((l->>'jete')::numeric, 0), 4);
    v_casse   := round(coalesce((l->>'casse')::numeric, 0), 4);
    v_offert  := round(coalesce((l->>'offert')::numeric, 0), 4);
    if least(v_produit, v_vendu, v_reporte, v_jete, v_casse, v_offert) < 0 then
      raise exception 'Quantite negative interdite en cloture.';
    end if;

    v_enriched := v_enriched || jsonb_build_object(
      'articleId', v_art.id,
      'code', v_art.code,
      'name', v_art.nom,
      'unit', v_art.unite,
      'priceHT', coalesce(v_art.pv_ht, 0),
      'produit', v_produit,
      'vendu', v_vendu,
      'reporte', v_reporte,
      'jete', v_jete,
      'casse', v_casse,
      'offert', v_offert
    );
  end loop;

  if p_caisse_bilan is not null and jsonb_typeof(p_caisse_bilan) = 'object'
     and (p_caisse_bilan ? 'especesComptees') then
    v_fond     := round(coalesce((p_caisse_bilan->>'fondInitial')::numeric, 0), 2);
    v_sorties  := round(coalesce((p_caisse_bilan->>'sortiesEspeces')::numeric, 0), 2);
    v_comptees := round((p_caisse_bilan->>'especesComptees')::numeric, 2);
    v_motif_s  := trim(coalesce(p_caisse_bilan->>'motifSortie', ''));
    if v_comptees is null or least(v_fond, v_sorties, v_comptees) < 0
       or greatest(v_fond, v_sorties, v_comptees) > 1000000000 then
      raise exception 'Bilan especes : montant invalide.';
    end if;
    if length(v_motif_s) > 160 then
      raise exception 'Motif de sortie trop long (160 caracteres maximum).';
    end if;
    v_caisse := jsonb_build_object(
      'fondInitial', v_fond,
      'sortiesEspeces', v_sorties,
      'especesComptees', v_comptees,
      'motifSortie', v_motif_s
    );
  end if;

  insert into public.clotures (client_id, site_id, date_cloture, revision, lignes, caisse_bilan)
  values (v_client, p_site_id, p_date, v_revision, v_enriched, v_caisse)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_caisse is not null);
end;
$$;

revoke all on function public.saisir_cloture(date, uuid, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.saisir_cloture(date, uuid, jsonb, boolean, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Restauration de sauvegarde : inclut `demandes_reassort` (compatible v1)
-- ---------------------------------------------------------------------
create or replace function public.restaurer_sauvegarde(p_dump jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth   uuid := auth.uid();
  v_client uuid;
  v_role   text;
  v_tbl    text;
  v_lignes jsonb;
  v_n      int;
  v_insere jsonb := '{}'::jsonb;
  v_ignore jsonb := '{}'::jsonb;
  v_ordre  text[] := array[
    'sites','fournisseurs','articles','conversions','parametres_couts',
    'recette_familles','recette_versions','lots','mouvements','historique_prix',
    'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
    'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
    'non_conformites','taches_planning'
  ];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role is distinct from 'proprietaire' then
    raise exception 'Role non autorise : restauration reservee au proprietaire.';
  end if;
  if p_dump is null or jsonb_typeof(p_dump) <> 'object' then
    raise exception 'Sauvegarde illisible.';
  end if;
  if p_dump->>'client_id' is distinct from v_client::text then
    raise exception 'Cette sauvegarde appartient a un autre etablissement.';
  end if;
  if jsonb_typeof(p_dump->'tables') <> 'array' then
    raise exception 'Sauvegarde sans tables.';
  end if;
  if not exists (select 1 from public.clients where id = v_client) then
    raise exception 'Etablissement introuvable : creez la fiche client avant de restaurer.';
  end if;

  foreach v_tbl in array v_ordre loop
    select t->'lignes' into v_lignes
      from jsonb_array_elements(p_dump->'tables') t
     where t->>'table' = v_tbl;
    if v_lignes is null or jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
      continue;
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_lignes) l
       where l ? 'client_id' and l->>'client_id' is distinct from v_client::text
    ) then
      raise exception 'Ligne etrangere detectee dans la table % : restauration refusee.', v_tbl;
    end if;

    begin
      if v_tbl = 'sites' then
        insert into public.sites select r.* from jsonb_populate_recordset(null::public.sites, v_lignes) r;
      elsif v_tbl = 'fournisseurs' then
        insert into public.fournisseurs select r.* from jsonb_populate_recordset(null::public.fournisseurs, v_lignes) r;
      elsif v_tbl = 'articles' then
        insert into public.articles select r.* from jsonb_populate_recordset(null::public.articles, v_lignes) r;
      elsif v_tbl = 'conversions' then
        insert into public.conversions select r.* from jsonb_populate_recordset(null::public.conversions, v_lignes) r;
      elsif v_tbl = 'parametres_couts' then
        insert into public.parametres_couts select r.* from jsonb_populate_recordset(null::public.parametres_couts, v_lignes) r;
      elsif v_tbl = 'recette_familles' then
        insert into public.recette_familles select r.* from jsonb_populate_recordset(null::public.recette_familles, v_lignes) r;
      elsif v_tbl = 'recette_versions' then
        insert into public.recette_versions select r.* from jsonb_populate_recordset(null::public.recette_versions, v_lignes) r;
      elsif v_tbl = 'lots' then
        insert into public.lots select r.* from jsonb_populate_recordset(null::public.lots, v_lignes) r;
      elsif v_tbl = 'mouvements' then
        insert into public.mouvements select r.* from jsonb_populate_recordset(null::public.mouvements, v_lignes) r;
      elsif v_tbl = 'historique_prix' then
        insert into public.historique_prix select r.* from jsonb_populate_recordset(null::public.historique_prix, v_lignes) r;
      elsif v_tbl = 'bons_commande' then
        insert into public.bons_commande select r.* from jsonb_populate_recordset(null::public.bons_commande, v_lignes) r;
      elsif v_tbl = 'ordres_fabrication' then
        insert into public.ordres_fabrication select r.* from jsonb_populate_recordset(null::public.ordres_fabrication, v_lignes) r;
      elsif v_tbl = 'ventes' then
        insert into public.ventes select r.* from jsonb_populate_recordset(null::public.ventes, v_lignes) r;
      elsif v_tbl = 'z_imports' then
        insert into public.z_imports select r.* from jsonb_populate_recordset(null::public.z_imports, v_lignes) r;
      elsif v_tbl = 'clotures' then
        insert into public.clotures select r.* from jsonb_populate_recordset(null::public.clotures, v_lignes) r;
      elsif v_tbl = 'transferts' then
        insert into public.transferts select r.* from jsonb_populate_recordset(null::public.transferts, v_lignes) r;
      elsif v_tbl = 'demandes_reassort' then
        insert into public.demandes_reassort select r.* from jsonb_populate_recordset(null::public.demandes_reassort, v_lignes) r;
      elsif v_tbl = 'cakes' then
        insert into public.cakes select r.* from jsonb_populate_recordset(null::public.cakes, v_lignes) r;
      elsif v_tbl = 'releve_temperatures' then
        insert into public.releve_temperatures select r.* from jsonb_populate_recordset(null::public.releve_temperatures, v_lignes) r;
      elsif v_tbl = 'nettoyages' then
        insert into public.nettoyages select r.* from jsonb_populate_recordset(null::public.nettoyages, v_lignes) r;
      elsif v_tbl = 'non_conformites' then
        insert into public.non_conformites select r.* from jsonb_populate_recordset(null::public.non_conformites, v_lignes) r;
      elsif v_tbl = 'taches_planning' then
        insert into public.taches_planning select r.* from jsonb_populate_recordset(null::public.taches_planning, v_lignes) r;
      end if;
      get diagnostics v_n = row_count;
      v_insere := v_insere || jsonb_build_object(v_tbl, v_n);
    exception
      when unique_violation then
        v_ignore := v_ignore || jsonb_build_object(v_tbl, jsonb_array_length(v_lignes));
    end;
  end loop;

  return jsonb_build_object('insere', v_insere, 'ignore', v_ignore);
end;
$fn$;

revoke all on function public.restaurer_sauvegarde(jsonb) from public, anon, authenticated;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated, service_role;

-- ===== 22-cake-production.sql =====
-- Dossier gâteau : association explicite et création atomique d'un OF.
-- Les anciennes commandes ne sont pas modifiées automatiquement.

alter table public.cakes add column if not exists version_id uuid references public.recette_versions(id);
alter table public.cakes add column if not exists site_id uuid references public.sites(id);
alter table public.cakes add column if not exists qte_fabrication numeric(12,3);
alter table public.cakes add column if not exists of_id uuid references public.ordres_fabrication(id);
-- Empêche les références inter-établissements, y compris lors d'une restauration.
create unique index if not exists cake_version_tenant_unique on public.recette_versions(client_id,id);
create unique index if not exists cake_site_tenant_unique on public.sites(client_id,id);
create unique index if not exists cake_of_tenant_unique on public.ordres_fabrication(client_id,id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='cakes_version_tenant_fk' and conrelid='public.cakes'::regclass) then
    alter table public.cakes add constraint cakes_version_tenant_fk foreign key(client_id,version_id) references public.recette_versions(client_id,id);
    alter table public.cakes add constraint cakes_site_tenant_fk foreign key(client_id,site_id) references public.sites(client_id,id);
    alter table public.cakes add constraint cakes_of_tenant_fk foreign key(client_id,of_id) references public.ordres_fabrication(client_id,id);
  end if;
end $$;
create unique index if not exists cakes_of_id_unique on public.cakes(of_id) where of_id is not null;

-- Liste minimale sans ingrédients ni coûts, accessible également au vendeur.
create or replace function public.cake_options_production()
returns table(version_id uuid, nom text, version integer, rendement_qte numeric, rendement_unite text)
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_role text;
begin
  select u.client_id, u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
  if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  return query select rv.id, rf.nom::text, rv.version, rv.rendement_qte::numeric, rv.rendement_unite::text
    from public.recette_versions rv join public.recette_familles rf on rf.id=rv.famille_id and rf.client_id=v_client
    where rv.client_id=v_client and rv.active and rf.produit_id is not null
      and case when jsonb_typeof(rv.ingredients)='array' then jsonb_array_length(rv.ingredients)>0 else false end
    order by rf.nom, rv.version desc;
end; $$;
revoke all on function public.cake_options_production() from public, anon;
grant execute on function public.cake_options_production() to authenticated, service_role;

-- Peut aussi compléter un ancien devis avant confirmation ; jamais après.
create or replace function public.affecter_production_cake(p_id uuid, p_version_id uuid, p_site_id uuid, p_qte numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_role text; c record;
begin
  select u.client_id,u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
  if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  select * into c from public.cakes where id=p_id and client_id=v_client for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.statut not in ('devis','acompte') or c.of_id is not null then raise exception 'Production deja confirmee.'; end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 or p_qte <> round(p_qte,3) then raise exception 'Quantite invalide (3 decimales maximum).'; end if;
  if not exists(select 1 from public.sites where id=p_site_id and client_id=v_client) then raise exception 'Site invalide.'; end if;
  if not exists(select 1 from public.cake_options_production() x where x.version_id=p_version_id) then raise exception 'Version de recette active invalide.'; end if;
  update public.cakes set version_id=p_version_id, site_id=p_site_id, qte_fabrication=p_qte where id=p_id;
end; $$;
revoke all on function public.affecter_production_cake(uuid,uuid,uuid,numeric) from public, anon;
grant execute on function public.affecter_production_cake(uuid,uuid,uuid,numeric) to authenticated, service_role;

create or replace function public.creer_cake_production(p_client_nom text,p_telephone text,p_date_event date,p_nb_parts int,p_prix_ht numeric,p_options jsonb,p_notes text,p_cgv boolean,p_version_id uuid,p_site_id uuid,p_qte numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public.creer_cake(p_client_nom,p_telephone,p_date_event,p_nb_parts,p_prix_ht,p_options,p_notes,p_cgv);
  perform public.affecter_production_cake((r->>'cake_id')::uuid,p_version_id,p_site_id,p_qte);
  return r;
end; $$;
revoke all on function public.creer_cake_production(text,text,date,integer,numeric,jsonb,text,boolean,uuid,uuid,numeric) from public, anon;
grant execute on function public.creer_cake_production(text,text,date,integer,numeric,jsonb,text,boolean,uuid,uuid,numeric) to authenticated, service_role;

-- Seulement les identifiants/numéros utiles à la traçabilité ; jamais les coûts.
create or replace function public.cake_liens_production()
returns table(cake_id uuid, of_id uuid, of_numero text, lots jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_role text;
begin
  select u.client_id,u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
  if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  return query select c.id,o.id,o.numero,coalesce((select jsonb_agg(jsonb_build_object('numero',l->>'numero','lotId',l->>'lotId')) from jsonb_array_elements(o.lots_produits) l),'[]'::jsonb)
    from public.cakes c join public.ordres_fabrication o on o.id=c.of_id and o.client_id=v_client where c.client_id=v_client;
end; $$;
revoke all on function public.cake_liens_production() from public, anon;
grant execute on function public.cake_liens_production() to authenticated, service_role;

create or replace function public.evoluer_cake(p_id uuid, p_transition text, p_montant numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  c record;
  v_paid numeric;
  v_new text;
  v_type text;
  v_montant numeric := nullif(p_montant, 0);
  v_req numeric;
  v_ttc numeric;
  v_version record;
  v_of uuid;
  v_numero text;
  v_besoins jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_transition is null or p_transition not in ('payer','confirme','produit','livre','annule') then
    raise exception 'Transition invalide.';
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;

  v_paid := coalesce(c.acompte, 0);
  v_ttc := round(c.prix_ht * (1 + coalesce(c.tva_pct,0) / 100), 2);

  if p_transition = 'payer' then
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Paiement impossible depuis le statut %.', c.statut;
    end if;
    if v_montant is null or v_montant <= 0 or v_montant > (v_ttc - v_paid) or v_montant <> round(v_montant,2) then
      raise exception 'Montant de paiement invalide.';
    end if;
    v_type := case when c.statut in ('devis','acompte') then 'acompte' else 'solde' end;
    update public.cakes k
      set acompte = v_paid + v_montant,
          paiements = coalesce(k.paiements, '[]'::jsonb) || jsonb_build_object(
            'at', now(), 'type', v_type, 'montant', v_montant, 'by', v_auth),
          statut = case when k.statut = 'devis' then 'acompte' else k.statut end
     where k.id = p_id
     ;
    v_new := case when c.statut = 'devis' then 'acompte' else c.statut end;

  elsif p_transition = 'confirme' then
    if c.statut in ('confirme','produit','livre') and c.of_id is not null then
      return jsonb_build_object('statut',c.statut,'paid',v_paid,'balance',v_ttc-v_paid,'of_id',c.of_id,'duplicate',true);
    end if;
    if c.statut <> 'acompte' then
      raise exception 'Confirmation possible uniquement depuis l''acompte (statut actuel : %).', c.statut;
    end if;
    v_req := ceil(c.prix_ht * 30)::numeric / 100;
    if v_paid < v_req then
      raise exception 'Acompte insuffisant : au moins % HT requis (30 %%).', v_req;
    end if;
    if c.version_id is null or c.site_id is null or c.qte_fabrication is null then
      raise exception 'Choisissez une recette, un site et une quantite avant confirmation.';
    end if;
    if not exists(select 1 from public.sites where id=c.site_id and client_id=v_client) then raise exception 'Site invalide.'; end if;
    select rv.id,rv.version,rv.famille_id,rv.rendement_qte,rv.ingredients,rf.nom,rf.produit_id
      into v_version from public.recette_versions rv join public.recette_familles rf on rf.id=rv.famille_id and rf.client_id=v_client
      where rv.id=c.version_id and rv.client_id=v_client;
    if not found or v_version.produit_id is null or coalesce(v_version.rendement_qte,0)<=0 then raise exception 'Version de recette invalide.'; end if;
    v_besoins := public.patisgest_besoins_de_version(v_client,c.version_id,c.qte_fabrication/v_version.rendement_qte,0);
    v_numero := 'OF-' || upper(substr(md5(gen_random_uuid()::text),1,8));
    insert into public.ordres_fabrication(client_id,famille_id,version_id,site_id,numero,qte_prevue,date_prevue,statut,snapshot,besoins,client_ref)
      values(v_client,v_version.famille_id,c.version_id,c.site_id,v_numero,c.qte_fabrication,c.date_event,'planifie',
        jsonb_build_object('recette',v_version.nom,'version',v_version.version,'produitId',v_version.produit_id,'scale',c.qte_fabrication/v_version.rendement_qte,'devis',c.numero),
        v_besoins,'cake:' || c.id::text) returning id into v_of;
    update public.cakes k set statut = 'confirme', of_id=v_of where k.id = p_id;
    v_new := 'confirme';

  elsif p_transition = 'produit' then
    if c.statut <> 'confirme' then
      raise exception 'Production possible uniquement depuis confirmé (statut actuel : %).', c.statut;
    end if;
    if c.of_id is not null and not exists(select 1 from public.ordres_fabrication o where o.id=c.of_id and o.client_id=v_client and o.statut='termine' and jsonb_array_length(o.lots_produits)>0) then
      raise exception 'Terminez l OF et creez le lot avant de marquer produit.';
    end if;
    update public.cakes k set statut = 'produit' where k.id = p_id;
    v_new := 'produit';

  elsif p_transition = 'livre' then
    if c.statut <> 'produit' then
      raise exception 'Livraison possible uniquement depuis produit (statut actuel : %).', c.statut;
    end if;
    if v_paid < v_ttc then
      raise exception 'Le solde doit etre entierement enregistre avant livraison.';
    end if;
    update public.cakes k set statut = 'livre' where k.id = p_id;
    v_new := 'livre';

  else -- annule
    if c.of_id is not null then raise exception 'Un OF est lie : traitez son devenir au laboratoire avant toute annulation.'; end if;
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Annulation impossible depuis le statut %.', c.statut;
    end if;
    update public.cakes k set statut = 'annule' where k.id = p_id;
    v_new := 'annule';
  end if;

  return jsonb_build_object(
    'statut', v_new,
    'paid', v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0),
    'balance', v_ttc - (v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0)));
end;
$$;

revoke execute on function public.evoluer_cake(uuid, text, numeric) from public, anon;
grant execute on function public.evoluer_cake(uuid, text, numeric) to authenticated, service_role;

-- ===== 23-controle-modules.sql =====
-- Appliquée au pilote (controle_modules_23, 20261119045242). Ne pas rejouer.
-- Couverture, compatibilité et parcours réels encore non validés.
-- Accès par compte : l'absence de ligne conserve les droits habituels du rôle.
-- Le réglage n'accorde jamais de nouveaux privilèges de rôle.

create table if not exists public.acces_modules (
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  module text not null check(module in ('stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation')),
  actif boolean not null,
  primary key(utilisateur_id,module)
);
alter table public.acces_modules enable row level security;
revoke all on public.acces_modules from public, anon, authenticated;

create or replace function public.patisgest_module_autorise(p_module text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select coalesce(a.actif,true) from public.utilisateurs u
    left join public.acces_modules a on a.utilisateur_id=u.id and a.module=p_module
    where u.auth_user_id=auth.uid() limit 1),false)
$$;
revoke all on function public.patisgest_module_autorise(text) from public,anon;
grant execute on function public.patisgest_module_autorise(text) to authenticated,service_role;

create or replace function public.patisgest_exiger_modules(p_modules text[])
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from unnest(p_modules) m where public.patisgest_module_autorise(m)) then
    raise exception 'Module desactive pour ce compte.' using errcode='42501';
  end if;
end $$;
revoke all on function public.patisgest_exiger_modules(text[]) from public,anon;
grant execute on function public.patisgest_exiger_modules(text[]) to authenticated,service_role;

create or replace function public.mes_modules_desactives()
returns text[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(a.module order by a.module),array[]::text[])
  from public.utilisateurs u join public.acces_modules a on a.utilisateur_id=u.id
  where u.auth_user_id=auth.uid() and not a.actif
$$;
revoke all on function public.mes_modules_desactives() from public,anon;
grant execute on function public.mes_modules_desactives() to authenticated,service_role;

create or replace function public.lister_acces_modules()
returns table(utilisateur_id uuid,nom text,role text,modules_desactives text[])
language plpgsql stable security definer set search_path='' as $$
declare client uuid; r text;
begin
 select u.client_id,u.role::text into client,r from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
 if client is null or r is distinct from 'proprietaire' then raise exception 'Reserve au proprietaire.' using errcode='42501'; end if;
 return query select u.id,u.nom::text,u.role::text,coalesce(array_agg(a.module order by a.module) filter(where not a.actif),array[]::text[])
  from public.utilisateurs u left join public.acces_modules a on a.utilisateur_id=u.id where u.client_id=client group by u.id,u.nom,u.role order by u.nom,u.id;
end $$;
revoke all on function public.lister_acces_modules() from public,anon;
grant execute on function public.lister_acces_modules() to authenticated,service_role;

create or replace function public.modifier_acces_module(p_utilisateur_id uuid,p_module text,p_actif boolean)
returns void language plpgsql security definer set search_path='' as $$
declare client uuid; r text;
begin
 select u.client_id,u.role::text into client,r from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
 if client is null or r is distinct from 'proprietaire' then raise exception 'Reserve au proprietaire.' using errcode='42501'; end if;
 if p_module not in ('stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation') or p_module is null or p_actif is null then raise exception 'Parametre invalide.'; end if;
 if not exists(select 1 from public.utilisateurs u where u.id=p_utilisateur_id and u.client_id=client) then raise exception 'Compte introuvable.'; end if;
 if p_actif then delete from public.acces_modules where utilisateur_id=p_utilisateur_id and module=p_module;
 else insert into public.acces_modules(utilisateur_id,module,actif) values(p_utilisateur_id,p_module,false) on conflict(utilisateur_id,module) do update set actif=false; end if;
end $$;
revoke all on function public.modifier_acces_module(uuid,text,boolean) from public,anon;
grant execute on function public.modifier_acces_module(uuid,text,boolean) to authenticated,service_role;

-- Les RPC SECURITY DEFINER contournent RLS : ajouter une garde au début de
-- chaque fonction existante, sans modifier son corps métier ni sa signature.
-- Ne jamais ignorer une fonction absente ou déjà instrumentée.
do $$
declare x record; f record; def text; injected text; n integer;
begin
 for x in select * from (values
 ('creer_famille','recettes'),('creer_version','recettes'),('activer_version','recettes'),
 ('creer_of','production'),('demarrer_of','production'),('terminer_of','production'),
 ('creer_cake','cake-design'),('creer_cake_production','cake-design'),('affecter_production_cake','cake-design'),('cake_options_production','cake-design'),('cake_liens_production','cake-design'),('evoluer_cake','cake-design'),('editer_cake','cake-design'),('accepter_cgv','cake-design'),
 ('vendre_article','caisse'),('vendre_panier','caisse'),('importer_z','caisse'),
 ('creer_commande','achats'),('recevoir_commande','achats'),('receptionner_lot','stocks|achats'),
 ('creer_demande_reassort','planning'),('traiter_demandes_reassort','planning|transferts'),('transferer_article','transferts'),
 ('saisir_cloture','cloture'),('maj_non_conformite','qualite'),('rappel_lot','tracabilite'),('bloquer_lot','tracabilite'),('simuler_recette','simulation|recettes')
 ) as t(nom,modules) loop
   select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
   if n <> 1 then raise exception 'Signature RPC ambiguë ou absente : % (%)',x.nom,n; end if;
   select p.oid, pg_get_functiondef(p.oid) as src into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=x.nom and p.prosecdef limit 1;
   if not found then raise exception 'RPC absente : %',x.nom; end if;
   def:=f.src;
   if position('patisgest_exiger_modules' in def)>0 then continue; end if;
   injected:=regexp_replace(def, E'\\mbegin\\M', format('begin perform public.patisgest_exiger_modules(string_to_array(%L, %L));', x.modules,'|'), 'i');
   if injected=def then raise exception 'Garde impossible sur RPC %',x.nom; end if;
   execute injected;
 end loop;
end $$;

-- La restauration contourne RLS et peut réécrire tous les modules. Elle ne
-- doit pas permettre de contourner un module désactivé pour le propriétaire.
alter function public.restaurer_sauvegarde(jsonb) rename to patisgest_restaurer_sauvegarde_interne;
revoke all on function public.patisgest_restaurer_sauvegarde_interne(jsonb) from public,anon,authenticated;
create function public.restaurer_sauvegarde(p_dump jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m text;
begin
 foreach m in array array['stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation'] loop
  perform public.patisgest_exiger_modules(array[m]);
 end loop;
 return public.patisgest_restaurer_sauvegarde_interne(p_dump);
end $$;
revoke all on function public.restaurer_sauvegarde(jsonb) from public,anon;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated,service_role;

-- Tables à usage exclusif et écritures directes : les policies restrictives
-- s'ajoutent aux politiques de tenant/rôle, jamais ne les remplacent.
do $$ declare x record;
begin
 for x in select * from (values
 ('releve_temperatures','qualite','all'),('nettoyages','qualite','all'),('non_conformites','qualite','all'),
 ('transferts','transferts','all'),('taches_planning','planning','all'),('demandes_reassort','planning|transferts','all'),
 ('recette_familles','recettes|production|cake-design|planning','select'),('recette_versions','recettes|production|cake-design','select'),
 ('ordres_fabrication','production|planning|cake-design','select'),('cakes','cake-design','select'),
 ('bons_commande','achats','select'),('historique_prix','achats|simulation','select'),
 ('parametres_couts','simulation','insert'),('parametres_couts','simulation','update'),
 ('ventes','caisse|cloture|planning','select'),('z_imports','caisse|cloture','select'),('clotures','cloture|planning','select'),
 ('articles','stocks','insert'),('articles','stocks','update'),('lots','stocks','insert'),('lots','stocks','update'),('mouvements','stocks','insert'),('fournisseurs','achats','insert'),
 ('conversions','recettes','insert'),('conversions','recettes','update'),('conversions','recettes','delete')
 ) as t(table_name,modules,cmd) loop
  execute format('drop policy if exists %I on public.%I','module_guard_'||x.cmd,x.table_name);
  if x.cmd='insert' then
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|');
  elsif x.cmd='update' then
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m))) with check (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|',x.modules,'|');
  elsif x.cmd='delete' then
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|');
  else
    execute format('create policy %I on public.%I as restrictive for %s to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.cmd,x.modules,'|');
  end if;
 end loop;
end $$;

-- ===== 24-index-exploitation.sql =====
-- =====================================================================
-- Migration 24 — Index d'exploitation multi-tenant.
--
-- Pourquoi maintenant : le pilote ne compte qu'un établissement et
-- 8 ventes, donc tout est instantané même sans index. Le modèle visé
-- (50 comptes · 100 boutiques · dizaines de tickets par jour) met
-- toutes les boutiques dans les MÊMES tables, séparées par client_id.
-- Relevé du 2026-11-19 sur la base pilote (evepzygucfxarpdnflzv) :
--   ventes (8 lignes)      → 2 index : pkey + (client_id, ticket)
--   mouvements (7)         → 1 index : pkey
--   lots (13)              → 1 index : pkey
--   clotures / OF / etc.   → 1 index : pkey
-- Chaque écran filtre client_id puis trie par date : sans index
-- composite, PostgreSQL balaie la table entière à chaque affichage,
-- pour toutes les boutiques à la fois.
--
-- Portée volontairement limitée : uniquement les prédicats réellement
-- écrits dans src/ (relevés fichier par fichier) et dans les RPC
-- FEFO des migrations 06 à 11. Aucun index « au cas où ».
--
-- Coût : quelques Mo pour 1,8 M tickets/an. Aucun verrou long sur des
-- tables de cette taille. Sur une base déjà volumineuse, remplacer
-- chaque `create index` par `create index concurrently` (hors
-- transaction) pour ne pas bloquer la caisse.
--
-- Idempotent : `if not exists`, rejouable sans effet.
-- =====================================================================

-- ------------------------------------------------------------- ventes
-- lireVentesJours : eq(client_id) + date_vente entre … order by id
-- Clôture / reconstitution : order by date_vente desc limit 500
create index if not exists ventes_client_date_idx
  on public.ventes (client_id, date_vente);

-- lireHistoriqueCaisse : order by created_at desc, id desc limit 40
create index if not exists ventes_client_created_idx
  on public.ventes (client_id, created_at desc, id desc);

-- --------------------------------------------------------- mouvements
-- Journal immuable : lecture d'un lot, d'un article ou d'une période.
create index if not exists mouvements_client_date_idx
  on public.mouvements (client_id, date_mvt desc);

create index if not exists mouvements_client_lot_idx
  on public.mouvements (client_id, lot_id);

-- ---------------------------------------------------------------- lots
-- Cœur du FEFO (migrations 06, 07, 08, 10, 11) : le prédicat est
--   client_id = … and article_id = … and site_id = …
--   and not bloque and qte_rest > 0
-- suivi de `order by congele, dlc nulls last, date_reception, id`.
-- Index partiel : il ne contient que les lots consommables, donc il
-- reste petit même après des années d'historique épuisé.
create index if not exists lots_fefo_idx
  on public.lots (client_id, article_id, site_id, congele, dlc, date_reception, id)
  where qte_rest > 0 and not bloque;

-- Traçabilité / rappel de lot : recherche par numéro.
create index if not exists lots_client_numero_idx
  on public.lots (client_id, numero);

-- ---------------------------------------------------------- production
-- lireProduction : eq(client_id) + order by date_prevue
create index if not exists ordres_client_date_idx
  on public.ordres_fabrication (client_id, date_prevue);

-- --------------------------------------------------------- clôtures
create index if not exists clotures_client_date_idx
  on public.clotures (client_id, date_cloture desc);

-- ----------------------------------------------------- qualité (HACCP)
create index if not exists temperatures_client_date_idx
  on public.releve_temperatures (client_id, date_releve desc);

create index if not exists nettoyages_client_date_idx
  on public.nettoyages (client_id, date_nettoyage desc);

create index if not exists non_conformites_client_date_idx
  on public.non_conformites (client_id, date_nc desc);

-- ----------------------------------------------------------- planning
create index if not exists taches_client_date_idx
  on public.taches_planning (client_id, date_tache);

-- ------------------------------------------------ achats / prix / Z
create index if not exists historique_prix_client_date_idx
  on public.historique_prix (client_id, article_id, date_prix desc);

create index if not exists z_imports_client_date_idx
  on public.z_imports (client_id, date_z desc);

-- ------------------------------------------------- cakes et transferts
create index if not exists cakes_client_event_idx
  on public.cakes (client_id, date_event);

create index if not exists transferts_client_date_idx
  on public.transferts (client_id, date_transfert desc);

-- ------------------------------------------------ listes de référence
-- Les sélecteurs trient les articles et les sites par nom (lireArticles,
-- lireSites, écrans Stocks/Caisse/Clôture).
create index if not exists articles_client_nom_idx
  on public.articles (client_id, nom);

create index if not exists sites_client_nom_idx
  on public.sites (client_id, nom);

-- -------------------------------------------- confirmation de lecture
-- À exécuter après application pour vérifier que les 14 index existent :
--
--   select tablename, indexname from pg_indexes
--    where schemaname = 'public' and indexname like '%_idx'
--    order by tablename, indexname;

-- ===== 25-domaines-boutiques.sql =====
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

-- ===== 26-vitrine-publique.sql =====
-- =====================================================================
-- Migration 26 — Vitrine publique par boutique (schéma)
--                                    (la RPC de commande est en 27)
--
-- Objectif produit : chaque site (boutique) peut publier sa vitrine. Elle
-- montre les recettes du catalogue de l'établissement, avec photos, et
-- permet au visiteur de déposer une demande de commande. Les demandes
-- arrivent dans `cakes` et le vendeur peut seulement les accepter ou les
-- refuser.
--
-- ⚠️ Ce fichier a été corrigé après lecture du schéma RÉEL de la base
--    pilote (2026-11-19). Trois erreurs du premier jet sont corrigées ici :
--
--  1. `cakes.statut` a une contrainte `cakes_statut_valid` limitée à
--     devis/acompte/confirme/produit/livre/annule. Écrire « demande »
--     aurait fait échouer toute commande de visiteur. La contrainte est
--     donc élargie explicitement, en dernier recours dans cette migration.
--
--  2. Le dédoublonnage se fait sur le NOM DE LA RECETTE (`recette_familles.nom`),
--     pas sur le produit lié. Relevé sur la base : la famille « Cake » pointe
--     sur l'article « Pâte feuilletée » et la famille « Croissant Pur Beurre »
--     sur « Croissant au beurre » — les noms divergent. Dédoublonner sur
--     l'article aurait fusionné ou scindé les mauvaises recettes.
--
--  3. « Cake » pointe sur un article à `pv_ht = 0.00`. Afficher « 0 DA » sur
--     une vitrine est un mensonge commercial : la vue publie `null` et la
--     page écrit « prix sur demande ». Aucune recette à 0 n'est publiée à 0.
--
-- Une vitrine ne doit JAMAIS exposer les coûts : les tables de coût
-- (recette_versions, parametres_couts) restent illisibles par `anon`, et la
-- vue ne sélectionne que des colonnes de vente, une par une.
--
-- Idempotent : rejouable.
-- =====================================================================

-- --------------------------------------------- 1. clé de nom normalisée
-- Supprime accents, casse, espaces et ponctuation : « Éclair au chocolat »
-- et « eclair  au  chocolat » donnent « eclair au chocolat ».
--
-- On n'utilise PAS `unaccent()` : cette fonction est STABLE et non
-- IMMUTABLE ; l'appeler depuis une fonction déclarée IMMUTABLE donnerait un
-- index silencieusement faux. `translate()` est déterministe, 1 caractère
-- vers 1 caractère, et ne demande aucune extension. Les ligatures (œ, æ)
-- sont traitées à part car elles se dédoublent en deux lettres.
create or replace function public.patisgest_cle_nom(p_nom text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    trim(regexp_replace(
      replace(replace(
        translate(
          lower(coalesce(p_nom, '')),
          'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷžźżšśșşțţ',
          'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyyzzzsssstt'
        ),
        'œ', 'oe'
      ), 'æ', 'ae'),
      '[^a-z0-9]+', ' ', 'g'
    )),
    ''
  );
$$;

comment on function public.patisgest_cle_nom(text) is
  'Clé de dédoublonnage des noms de recettes : accents, casse et ponctuation ignorés.';

-- ------------------------------------------------ 2. champs vitrine
-- `nom` reste le nom technique utilisé par la production ; `nom_vitrine`
-- est ce que le client final lit. Les deux peuvent différer.
alter table public.recette_familles
  add column if not exists cle_nom text,
  add column if not exists nom_vitrine text,
  add column if not exists description_vitrine text,
  add column if not exists photo_vitrine text,
  -- Par défaut NON publiée : aucune recette existante ne part en ligne
  -- par accident le jour de l'exécution de cette migration.
  add column if not exists visible_vitrine boolean not null default false,
  add column if not exists ordre_vitrine integer not null default 100;

-- `cle_nom` est maintenue par trigger : l'application n'a pas à y penser,
-- et une correction de nom ne peut pas laisser une clé périmée derrière elle.
create or replace function public.patisgest_maj_cle_nom()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cle_nom := public.patisgest_cle_nom(new.nom);
  return new;
end;
$$;

drop trigger if exists recette_familles_cle_nom_trg on public.recette_familles;
create trigger recette_familles_cle_nom_trg
  before insert or update of nom on public.recette_familles
  for each row execute function public.patisgest_maj_cle_nom();

-- Remplissage initial des familles existantes.
update public.recette_familles
   set cle_nom = public.patisgest_cle_nom(nom)
 where cle_nom is null;

-- Recherche du dédoublonnage (`distinct on (client_id, cle_nom)`).
-- Non unique à dessein : deux recettes homonymes peuvent exister côté
-- production ; c'est la VUE qui n'en publie qu'une.
create index if not exists recette_familles_cle_nom_idx
  on public.recette_familles (client_id, cle_nom);

-- ------------------------------------------------ 3. photos vitrine
-- Table dédiée plutôt qu'une colonne par recette : un gâteau a plusieurs
-- photos et la vitrine n'a besoin de rien d'autre.
create table if not exists public.vitrine_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  famille_id uuid not null references public.recette_familles (id) on delete cascade,
  chemin text not null,
  legende text,
  position integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists vitrine_photos_famille_idx
  on public.vitrine_photos (client_id, famille_id, position);

alter table public.vitrine_photos enable row level security;

-- Écriture des photos : propriétaire ET laboratoire (règle métier).
drop policy if exists vitrine_photos_ecriture on public.vitrine_photos;
create policy vitrine_photos_ecriture on public.vitrine_photos
  for all to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- Lecture interne : tout le personnel (le vendeur doit voir la photo en
-- caisse). La lecture PUBLIQUE passe par la vue, jamais par cette table.
drop policy if exists vitrine_photos_lecture on public.vitrine_photos;
create policy vitrine_photos_lecture on public.vitrine_photos
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

-- ------------------------------------------- 4. demandes de visiteurs
-- Une demande n'est PAS un devis : elle n'a ni prix ni acompte, et le
-- vendeur n'a pas le droit de la modifier — seulement de l'accepter
-- (elle devient un devis à chiffrer) ou de la refuser.
alter table public.cakes
  add column if not exists origine text not null default 'interne',
  add column if not exists cle_vitrine text,
  add column if not exists statut_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cakes_origine_valeurs') then
    alter table public.cakes add constraint cakes_origine_valeurs
      check (origine in ('interne', 'vitrine'));
  end if;
end $$;

-- Le statut « demande » n'existait pas. On remplace la contrainte en
-- conservant l'ordre logique du cycle de vie ; « demande » est en tête.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.cakes'::regclass
       and conname = 'cakes_statut_valid'
       and pg_get_constraintdef(oid) not like '%demande%'
  ) then
    alter table public.cakes drop constraint cakes_statut_valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cakes'::regclass
       and conname = 'cakes_statut_valid'
  ) then
    alter table public.cakes add constraint cakes_statut_valid
      check (statut in ('demande', 'devis', 'acompte', 'confirme', 'produit', 'livre', 'annule'));
  end if;
end $$;

-- Deux envois identiques du même visiteur (double clic, réseau instable)
-- = une seule demande. L'unicité porte sur une référence tirée par le
-- navigateur, jamais sur l'IP ni sur le contenu (deux vraies commandes
-- peuvent être identiques).
create unique index if not exists cakes_cle_vitrine_unique
  on public.cakes (client_id, cle_vitrine) where cle_vitrine is not null;

-- ------------------------------------------------- 5. vue publique
-- Seules les recettes VISIBLES d'un site PUBLIÉ sont exposées. Colonnes
-- choisies une par une : aucun coût, aucun ingrédient, aucun identifiant
-- interne n'est nécessaire au visiteur.
--
-- Dédoublonnage : une même `cle_nom` ne sort qu'UNE fois par établissement
-- (exigence métier : « même nom de gâteau = même gâteau »). On garde la
-- recette dont l'ordre d'affichage est le plus petit, puis le nom, puis
-- l'id — donc de façon déterministe et testable.
create or replace view public.vitrine_catalogue
with (security_invoker = false)
as
with premiere as (
  select distinct on (f.client_id, f.cle_nom)
         f.client_id,
         f.cle_nom,
         coalesce(nullif(trim(f.nom_vitrine), ''), f.nom) as nom,
         f.description_vitrine as description,
         f.photo_vitrine,
         f.ordre_vitrine,
         f.produit_id
    from public.recette_familles f
   where f.visible_vitrine
     and f.cle_nom is not null
   order by f.client_id, f.cle_nom, f.ordre_vitrine, f.nom, f.id
)
select p.client_id,
       p.cle_nom,
       p.nom,
       p.description,
       p.photo_vitrine,
       p.ordre_vitrine,
       c.nom as etablissement,
       s.nom as boutique,
       s.subdomain,
       s.custom_domain,
       -- Prix de vente UNIQUEMENT, jamais le coût. 0 devient `null` :
       -- « 0 DA » sur une vitrine serait un mensonge commercial.
       nullif(a.pv_ht, 0) as prix_ht,
       a.tva,
       a.unite
  from premiere p
  join public.clients c on c.id = p.client_id
  join public.sites s on s.client_id = p.client_id
   and s.publication = 'publiee'
  left join public.articles a on a.id = p.produit_id;

-- La vue est en security_invoker = false : elle contourne la RLS et expose
-- donc exactement les colonnes listées ci-dessus, pour tous les sites
-- publiés. C'est le prix à payer pour qu'un visiteur anonyme voie une
-- vitrine sans jamais lire `recette_familles` ou `articles` directement.
comment on view public.vitrine_catalogue is
  'Catalogue public des vitrines publiées. Aucune colonne de coût. Lecture anon admise.';

revoke all on public.vitrine_catalogue from public, anon, authenticated;
grant select on public.vitrine_catalogue to anon, authenticated;

-- ------------------------------------------------ vérification
--   -- toutes les familles ont une clé
--   select count(*) from public.recette_familles where cle_nom is null;   -- 0
--   -- aucune vitrine publiée par accident
--   select count(*) from public.recette_familles where visible_vitrine;   -- 0
--   -- anon ne voit aucune table interne
--   begin; set local role anon;
--     select count(*) from public.clients;       -- 0
--     select count(*) from public.recette_familles; -- 0
--   rollback;

-- ===== 27-commandes-vitrine.sql =====
-- =====================================================================
-- Migration 27 — Commandes de vitrine : dépôt public et traitement vendeur
--
-- Deux RPC, et deux seulement :
--
--   1. `patisgest_demander_commande`  — appelée par un visiteur ANONYME
--      depuis une vitrine publiée. Elle est la SEULE fonction exécutable
--      par `anon` dans tout le schéma (voir tests/securite.test.mjs, qui
--      exige une liste blanche explicite).
--
--   2. `patisgest_traiter_demande`    — appelée par le personnel, pour
--      accepter (→ devis) ou refuser (→ annule) une demande.
--
-- Pourquoi une RPC et pas un `insert` direct : `anon` n'a aucun droit
-- d'écriture sur `cakes` (migration 28), et il ne doit jamais en avoir.
-- La fonction décide elle-même du `client_id` (jamais fourni par le
-- visiteur), du numéro, du statut et du prix. Un visiteur ne peut donc
-- ni choisir son établissement, ni fixer un prix, ni marquer une
-- commande comme payée.
--
-- Idempotent : rejouable.
-- =====================================================================

-- ============================================================= 1. dépôt
create or replace function public.patisgest_demander_commande(
  p_sous_domaine text,
  p_cle_recette text,
  p_client_nom text,
  p_telephone text,
  p_date_event date,
  p_nb_parts integer,
  p_note text,
  p_cle_navigateur text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_client uuid;
  v_famille text;
  v_cle text;
  v_numero text;
  v_id uuid;
  v_existant record;
  v_flux int;
begin
  -- ---- 1. le site visé : publié, et désigné par son sous-domaine.
  -- Un site « brouillon » ou « aucune » est traité exactement comme un
  -- site inexistant : pas de fuite d'existence.
  select s.id, s.client_id, s.nom
    into v_site
    from public.sites s
   where lower(s.subdomain) = lower(trim(coalesce(p_sous_domaine, '')))
     and s.publication = 'publiee'
   limit 1;
  if v_site.id is null then
    raise exception 'Vitrine introuvable ou non publiée.';
  end if;
  v_client := v_site.client_id;

  -- ---- 2. la recette : elle doit être réellement publiée sur CETTE
  -- vitrine. Sans ce contrôle, un visiteur pourrait commander une recette
  -- masquée en devinant sa clé.
  v_cle := public.patisgest_cle_nom(p_cle_recette);
  if v_cle is null then
    raise exception 'Recette invalide.';
  end if;
  select v.nom into v_famille
    from public.vitrine_catalogue v
   where v.client_id = v_client
     and v.subdomain = v_site.subdomain
     and v.cle_nom = v_cle
   limit 1;
  if v_famille is null then
    raise exception 'Cette recette n''est pas proposée par cette vitrine.';
  end if;

  -- ---- 3. validations de saisie (mêmes bornes que `creer_cake`).
  if p_client_nom is null or length(trim(p_client_nom)) < 2
     or length(trim(p_client_nom)) > 100 then
    raise exception 'Votre nom est requis (2 à 100 caractères).';
  end if;
  if p_telephone is null or length(regexp_replace(p_telephone, '[^0-9]', '', 'g')) < 6
     or length(p_telephone) > 40 then
    raise exception 'Un numéro de téléphone joignable est requis.';
  end if;
  if p_date_event is null or p_date_event < current_date then
    raise exception 'La date souhaitée doit être aujourd''hui ou plus tard.';
  end if;
  if p_date_event > current_date + 365 then
    raise exception 'Les commandes se prennent au plus un an à l''avance.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 à 10000).';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'Précisions trop longues (500 caractères maximum).';
  end if;

  -- ---- 4. idempotence : rejouer le même envoi renvoie la même demande.
  -- La clé est tirée par le navigateur et unique par établissement
  -- (index `cakes_cle_vitrine_unique`, migration 26). Un double clic,
  -- un retour arrière ou un réseau instable ne crée pas de doublon.
  v_cle := nullif(trim(coalesce(p_cle_navigateur, '')), '');
  if v_cle is null or length(v_cle) < 8 or length(v_cle) > 64 then
    raise exception 'Référence de demande invalide.';
  end if;

  select k.id, k.numero into v_existant
    from public.cakes k
   where k.client_id = v_client
     and k.cle_vitrine = v_cle
   limit 1;
  if v_existant.id is not null then
    return jsonb_build_object(
      'id', v_existant.id,
      'numero', v_existant.numero,
      'deja_enregistree', true);
  end if;

  -- ---- 5. garde-fou anti-flood, sans stocker d'IP (donnée personnelle
  -- qu'on n'a aucune raison de conserver). 30 demandes par heure et par
  -- établissement : au-delà, c'est un robot, pas une pâtisserie.
  select count(*) into v_flux
    from public.cakes k
   where k.client_id = v_client
     and k.origine = 'vitrine'
     and k.created_at > now() - interval '1 hour';
  if v_flux >= 30 then
    raise exception 'Trop de demandes en peu de temps. Merci de réessayer plus tard ou d''appeler la boutique.';
  end if;

  -- ---- 6. écriture. Le prix n'est PAS fixé par le visiteur : la demande
  -- part à 0 et c'est la boutique qui chiffre en l'acceptant.
  v_numero := 'VIT-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  insert into public.cakes (
    client_id, numero, client_nom, telephone, date_event, nb_parts,
    options, prix_ht, acompte, statut, cgv, notes, retro, paiements,
    site_id, origine, cle_vitrine, statut_note
  ) values (
    v_client, v_numero, trim(p_client_nom), trim(p_telephone), p_date_event, p_nb_parts,
    jsonb_build_array(jsonb_build_object('name', v_famille, 'cout', 0, 'minutes', 0)),
    0, 0, 'demande', false,
    nullif(trim(coalesce(p_note, '')), ''),
    '[]'::jsonb, '[]'::jsonb,
    v_site.id, 'vitrine', v_cle,
    'Demande déposée depuis la vitrine en ligne.'
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja_enregistree', false);
end;
$$;

-- Seule fonction du schéma ouverte à `anon` : `tests/securite.test.mjs`
-- contient une liste blanche nominative et échouera sur toute autre.
revoke all on function public.patisgest_demander_commande(text, text, text, text, date, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.patisgest_demander_commande(text, text, text, text, date, integer, text, text)
  to anon, authenticated;

-- ========================================================= 2. traitement
create or replace function public.patisgest_traiter_demande(
  p_id uuid,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_cake record;
  v_statut text;
begin
  if v_auth is null then
    raise exception 'Non authentifié.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;

  -- Les vendeurs traitent les demandes : c'est explicitement leur rôle.
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Rôle non autorisé.';
  end if;
  if p_decision not in ('accepter', 'refuser') then
    raise exception 'Décision invalide (accepter ou refuser).';
  end if;

  select k.* into v_cake
    from public.cakes k
   where k.id = p_id
   for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  if v_cake.client_id <> v_client then
    raise exception 'Demande hors périmètre.';
  end if;
  if v_cake.statut <> 'demande' then
    raise exception 'Cette demande a déjà été traitée (statut : %).', v_cake.statut;
  end if;

  -- Accepter ne veut pas dire vendre : la demande devient un DEVIS, que
  -- le personnel chiffre ensuite. Aucun prix n'est inventé ici.
  if p_decision = 'accepter' then
    v_statut := 'devis';
  else
    v_statut := 'annule';
  end if;

  update public.cakes k
     set statut = v_statut,
         statut_note = case
           when p_decision = 'accepter' then 'Demande de vitrine acceptée — à chiffrer.'
           else 'Demande de vitrine refusée.'
         end
   where k.id = p_id;

  return jsonb_build_object('id', p_id, 'statut', v_statut);
end;
$$;

revoke all on function public.patisgest_traiter_demande(uuid, text) from public, anon;
grant execute on function public.patisgest_traiter_demande(uuid, text) to authenticated;

-- ------------------------------------------------ vérification
--   -- anon ne peut exécuter qu'une fonction
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('anon', p.oid, 'execute');   -- 1 ligne

-- ===== 28-fermeture-anon.sql =====
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

-- ===== 29-fermeture-public-fonctions.sql =====
-- =====================================================================
-- Migration 29 — Fermeture des fonctions via PUBLIC
--
-- Constat mesuré APRÈS la migration 28 (2026-11-19) :
--
--   select p.proname from pg_proc p …
--    where has_function_privilege('anon', p.oid, 'execute');
--   → patisgest_cle_nom, patisgest_maj_cle_nom,
--     patisgest_mon_client, patisgest_mon_role, patisgest_demander_commande
--
-- La migration 28 révoquait sur `anon`, mais PostgreSQL accorde EXECUTE à
-- **PUBLIC** par défaut sur toute fonction créée, et `anon` hérite de
-- PUBLIC. Révoquer sur `anon` seul ne retire donc rien : il faut révoquer
-- sur PUBLIC. C'est le même piège que celui corrigé en migration 17 pour
-- `rls_auto_enable()`.
--
-- Après cette migration, une seule fonction reste joignable par `anon` :
-- `patisgest_demander_commande`, la RPC publique de la vitrine (migration
-- 27), qui ne prend aucun `client_id` et ne fixe aucun prix.
--
-- Les trois fonctions d'aide doivent rester exécutables par
-- `authenticated` : les policies RLS les appellent (`patisgest_mon_client`,
-- `patisgest_mon_role`) et le trigger `cle_nom` appelle la troisième.
-- Elles ne sont PAS SECURITY DEFINER : les exécuter ne donne aucun accès.
--
-- Idempotent : rejouable.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'patisgest_demander_commande'
  loop
    execute format('revoke all on function %s from public', r.sig);
  end loop;
end $$;

-- Redonner explicitement l'exécution au personnel connecté : les policies
-- et le trigger en dépendent, un `revoke from public` les couperait aussi.
revoke all on function public.patisgest_cle_nom(text) from public, anon;
grant execute on function public.patisgest_cle_nom(text) to authenticated, service_role;

revoke all on function public.patisgest_maj_cle_nom() from public, anon;
grant execute on function public.patisgest_maj_cle_nom() to authenticated, service_role;

revoke all on function public.patisgest_mon_client() from public, anon;
grant execute on function public.patisgest_mon_client() to authenticated, service_role;

revoke all on function public.patisgest_mon_role() from public, anon;
grant execute on function public.patisgest_mon_role() to authenticated, service_role;

-- ------------------------------------------------ vérification
--   -- exactement 1 fonction exécutable par anon
--   select count(*) as nb,
--          coalesce(string_agg(p.proname, ', '), 'aucune') as liste
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('anon', p.oid, 'execute');   -- 1 / patisgest_demander_commande
--
--   -- le personnel connecté garde ses RPC
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('authenticated', p.oid, 'execute');  -- 41

-- ===== 30-edition-vitrine-rpc.sql =====
-- =====================================================================
-- Migration 30 — Écriture de la vitrine par RPC (pas par `update` direct)
--
-- Constat mesuré sur la base pilote (2026-11-19) :
--
--   select relname, count(*) from pg_policy … where polcmd in ('w','a','d','*')
--   → recette_familles : 0 policy d'écriture
--   → cakes            : 0 policy d'écriture
--
-- C'est volontaire (tout passe par des RPC SECURITY DEFINER), mais cela a
-- une conséquence : un `supabase.from('recette_familles').update(...)`
-- renvoie **0 ligne sans erreur** — la RLS ne lève pas d'exception, elle
-- filtre. Le code aurait affiché « enregistré » sans rien avoir écrit.
-- Toute l'écriture de la vitrine passe donc par les RPC ci-dessous.
--
-- Idempotent : rejouable.
-- =====================================================================

-- `creer_famille` exige déjà l'unicité du code par établissement côté
-- application ; on la garantit aussi par index. La table pilote n'a
-- aucune contrainte d'unicité sur (client_id, code).
create unique index if not exists recette_familles_client_code_unique
  on public.recette_familles (client_id, code);

-- ---------------------------------------- fiche vitrine (photo, nom, ordre)
create or replace function public.patisgest_enregistrer_fiche_vitrine(
  p_famille_id uuid,
  p_visible boolean,
  p_nom_vitrine text,
  p_description text,
  p_photo text,
  p_ordre integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;

  -- Fiche et photos : propriétaire et laboratoire. Le vendeur traite les
  -- commandes, il n'écrit pas le catalogue.
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Rôle non autorisé : la vitrine se modifie au labo ou à la direction.';
  end if;

  if not exists (
    select 1 from public.recette_familles f
     where f.id = p_famille_id and f.client_id = v_client
  ) then
    raise exception 'Recette introuvable dans cet établissement.';
  end if;

  if p_nom_vitrine is not null and length(p_nom_vitrine) > 80 then
    raise exception 'Nom de vitrine trop long (80 max).';
  end if;
  if p_description is not null and length(p_description) > 400 then
    raise exception 'Description trop longue (400 max).';
  end if;
  if p_photo is not null and length(p_photo) > 500 then
    raise exception 'Chemin de photo trop long (500 max).';
  end if;
  if p_ordre is null or p_ordre < 0 or p_ordre > 9999 then
    raise exception 'Ordre d''affichage invalide (0 à 9999).';
  end if;

  update public.recette_familles f
     set visible_vitrine = coalesce(p_visible, false),
         nom_vitrine = nullif(trim(coalesce(p_nom_vitrine, '')), ''),
         description_vitrine = nullif(trim(coalesce(p_description, '')), ''),
         -- `p_photo` à null conserve la photo existante : une mise à jour
         -- de l'ordre d'affichage n'efface pas la photo par accident.
         photo_vitrine = coalesce(nullif(trim(p_photo), ''), f.photo_vitrine),
         ordre_vitrine = p_ordre
   where f.id = p_famille_id;

  return jsonb_build_object('id', p_famille_id, 'visible', coalesce(p_visible, false));
end;
$$;

revoke all on function public.patisgest_enregistrer_fiche_vitrine(uuid, boolean, text, text, text, integer)
  from public, anon;
grant execute on function public.patisgest_enregistrer_fiche_vitrine(uuid, boolean, text, text, text, integer)
  to authenticated;

-- ---------------------------------------------- retirer / supprimer
-- « Seul le propriétaire peut ajouter ou supprimer des recettes. »
-- Retirer de la vitrine = dépublier (réversible, labo autorisé).
-- SUPPRIMER la recette = propriétaire seul.
create or replace function public.patisgest_supprimer_recette(
  p_famille_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_nom text;
  v_versions int;
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then
    raise exception 'Seul le propriétaire peut supprimer une recette.';
  end if;

  select f.nom into v_nom from public.recette_familles f
   where f.id = p_famille_id and f.client_id = v_client;
  if v_nom is null then
    raise exception 'Recette introuvable dans cet établissement.';
  end if;

  -- Une recette qui porte des versions est le support de la traçabilité
  -- des lots (RG-15, rappel). On la dépublie, on ne la supprime pas.
  select count(*) into v_versions from public.recette_versions v
   where v.famille_id = p_famille_id;
  if v_versions > 0 then
    raise exception 'Cette recette a des versions : dépubliez-la de la vitrine au lieu de la supprimer.';
  end if;

  delete from public.recette_familles f where f.id = p_famille_id;
  return jsonb_build_object('id', p_famille_id, 'supprimee', true, 'nom', v_nom);
end;
$$;

revoke all on function public.patisgest_supprimer_recette(uuid) from public, anon;
grant execute on function public.patisgest_supprimer_recette(uuid) to authenticated;

-- ------------------------------------------------ vérification
--   -- aucune écriture directe possible : 0 policy d'écriture
--   select c.relname,
--          (select count(*) from pg_policy p
--            where p.polrelid = c.oid and p.polcmd in ('w','a','d','*'))
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname in ('recette_familles', 'cakes');

-- ===== 31-publication-vitrine.sql =====
-- =====================================================================
-- Migration 31 — Publication d'une vitrine (propriétaire seul)
--
-- Pourquoi une RPC alors que `sites` a déjà des policies d'écriture :
-- `sites_update_staff` autorise propriétaire **et labo**. Or publier une
-- vitrine engage l'établissement (nom, prix, adresse publique) : la règle
-- métier dit « propriétaire ». Un `update` direct depuis l'interface
-- laisserait donc le laboratoire publier, ce qui n'est pas voulu.
--
-- Cette fonction fait aussi les contrôles que la RPC de réservation ne
-- peut pas faire seule :
--   • publier sans adresse est impossible (contrainte `sites_publiee_a_une_adresse`) ;
--   • publier une vitrine sans AUCUNE recette visible donnerait une page
--     vide au visiteur — on refuse avec un message actionnable.
--
-- Idempotent : rejouable.
-- =====================================================================

create or replace function public.patisgest_publier_vitrine(
  p_site_id uuid,
  p_publication text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site record;
  v_visibles int;
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;

  -- Publier engage l'établissement : propriétaire seul.
  if v_role <> 'proprietaire' then
    raise exception 'Seul le propriétaire peut publier ou dépublier une vitrine.';
  end if;

  if p_publication not in ('aucune', 'brouillon', 'publiee') then
    raise exception 'État de publication invalide.';
  end if;

  select s.* into v_site from public.sites s
   where s.id = p_site_id and s.client_id = v_client
   for update;
  if not found then
    raise exception 'Site introuvable dans cet établissement.';
  end if;

  if p_publication = 'publiee' then
    if coalesce(trim(v_site.subdomain), '') = '' and coalesce(trim(v_site.custom_domain), '') = '' then
      raise exception 'Réservez d''abord une adresse (sous-domaine) pour cette boutique.';
    end if;

    select count(*) into v_visibles
      from public.recette_familles f
     where f.client_id = v_client and f.visible_vitrine;
    if v_visibles = 0 then
      raise exception 'Publiez au moins une recette sur la vitrine avant de la mettre en ligne.';
    end if;
  end if;

  update public.sites s
     set publication = p_publication,
         vitrine_publiee_le = case
           when p_publication = 'publiee' then coalesce(s.vitrine_publiee_le, now())
           else s.vitrine_publiee_le
         end
   where s.id = p_site_id;

  return jsonb_build_object(
    'site_id', p_site_id,
    'publication', p_publication,
    'recettes_visibles', v_visibles);
end;
$$;

revoke all on function public.patisgest_publier_vitrine(uuid, text) from public, anon;
grant execute on function public.patisgest_publier_vitrine(uuid, text) to authenticated;

-- ------------------------------------------------ vérification
--   -- le laboratoire doit être refusé
--   begin;
--     set local request.jwt.claims = '{"sub":"…302","role":"authenticated"}';
--     set local role authenticated;
--     select public.patisgest_publier_vitrine('<site>', 'publiee');  -- erreur attendue
--   rollback;

-- ===== 32-garde-prix-vitrine-rattrapage.sql =====
-- =====================================================================
-- 32 — Rattrapage Phase 1 de la revue : F-01 et F-18.
--
-- Pourquoi une migration et pas une édition de 21 / 27 : ces fichiers sont
-- déjà appliqués au pilote et leur empreinte est figée (repetition.json,
-- fixtures pilote). On corrige donc le corps INSTALLÉ, avec des gardes
-- strictes : si le corps n'est pas exactement celui attendu, la migration
-- s'arrête au lieu de deviner.
--
-- F-01 : une vente ne peut pas décrémenter le stock à un prix nul. Le
--        contrôle est dans vendre_panier (vendre_article en est un wrapper).
-- F-18 : patisgest_demander_commande lit v_site.subdomain ; la sélection
--        initiale ne charge que s.nom => « record "v_site" has no field
--        "subdomain" » pour tout visiteur. On sélectionne subdomain.
--
-- Compatible avec le brouillon 127 : si subdomain est déjà sélectionné,
-- 127 ne fait rien.
-- =====================================================================

do $migration$
declare
  definition text;
  corrigee text;
  n integer;
begin
  -- ---- F-01 : vendre_panier refuse un prix de vente nul ----------------
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
  if definition is null then
    raise exception 'RPC vendre_panier absente : appliquer 21 avant 32.';
  end if;

  n := (length(definition) - length(replace(definition,
         'if v_art.pv_ht is null or v_art.pv_ht < 0 or',
         ''))) / length('if v_art.pv_ht is null or v_art.pv_ht < 0 or');
  if n = 0 then
    if position('if v_art.pv_ht is null or v_art.pv_ht <= 0 or' in definition) > 0 then
      null; -- déjà corrigée
    else
      raise exception 'Corps de vendre_panier inattendu : réconciliation manuelle requise.';
    end if;
  elsif n = 1 then
    corrigee := replace(definition,
      'if v_art.pv_ht is null or v_art.pv_ht < 0 or',
      'if v_art.pv_ht is null or v_art.pv_ht <= 0 or');
    execute corrigee;
  else
    raise exception 'Garde de prix ambiguë dans vendre_panier : audit manuel requis.';
  end if;

  -- ---- F-18 : patisgest_demander_commande lit subdomain -----------------
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is not null then
    select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
      into definition;
    if position('select s.id, s.client_id, s.nom' in definition) > 0 then
      n := (length(definition) - length(replace(definition,
             'select s.id, s.client_id, s.nom', ''))) / length('select s.id, s.client_id, s.nom');
      if n <> 1 then
        raise exception 'Sélection vitrine ambiguë : audit manuel requis.';
      end if;
      corrigee := replace(definition,
        'select s.id, s.client_id, s.nom',
        'select s.id, s.client_id, s.subdomain');
      execute corrigee;
    elsif position('select s.id, s.client_id, s.subdomain' in definition) = 0 then
      raise exception 'Définition vitrine inattendue : audit manuel requis.';
    end if;
  end if;
end
$migration$;

-- ===== 33-restauration-sans-perte.sql =====
-- =====================================================================
-- 33 — Restauration sans perte silencieuse (revue F-02, F-05).
--
-- Avant : chaque table était insérée en un seul ordre ; un seul doublon
-- (unique_violation) faisait sauter TOUTE la table, lignes valides comprises,
-- tout en annonçant un succès. Aucun contrôle de version côté SQL.
--
-- Après :
--  - insertion par `on conflict do nothing` : une ligne déjà présente n'annule
--    plus les autres ; le nombre de lignes réellement insérées et ignorées est
--    rapporté table par table (`insere` / `ignore` = nb de lignes, plus table);
--  - les erreurs réelles (clé étrangère, not-null, check) remontent toujours :
--    la transaction échoue en bloc, rien n'est partiellement restauré ;
--  - version de format contrôlée (1), comme validerSauvegarde côté application.
--
-- Architecture (migration 23) : la logique vit dans patisgest_restaurer_sauvegarde_interne ;
-- restaurer_sauvegarde est une enveloppe qui exige les modules actifs puis l'appelle.
-- Cette migration redéfinit SEULEMENT l'interne : l'enveloppe, donc le contrôle des
-- modules, reste intacte.
--
-- Le contrôle inter-établissements des clés étrangères (rapport externe B-002)
-- n'est PAS traité ici : il demande des clés composites, traitées à part.
-- =====================================================================

create or replace function public.patisgest_restaurer_sauvegarde_interne(p_dump jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth   uuid := auth.uid();
  v_client uuid;
  v_role   text;
  v_tbl    text;
  v_lignes jsonb;
  v_lu     int;
  v_n      int;
  v_insere jsonb := '{}'::jsonb;
  v_ignore jsonb := '{}'::jsonb;
  -- Liste fermée : v_tbl ne vient jamais de l'entrée utilisateur, donc %I est sûr.
  v_ordre  text[] := array[
    'sites','fournisseurs','articles','conversions','parametres_couts',
    'recette_familles','recette_versions','lots','mouvements','historique_prix',
    'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
    'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
    'non_conformites','taches_planning'
  ];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role is distinct from 'proprietaire' then
    raise exception 'Role non autorise : restauration reservee au proprietaire.';
  end if;
  if p_dump is null or jsonb_typeof(p_dump) <> 'object' then
    raise exception 'Sauvegarde illisible.';
  end if;
  if p_dump->>'version' is distinct from '1' then
    raise exception 'Version de sauvegarde non prise en charge (attendue : 1).';
  end if;
  if p_dump->>'client_id' is distinct from v_client::text then
    raise exception 'Cette sauvegarde appartient a un autre etablissement.';
  end if;
  if jsonb_typeof(p_dump->'tables') <> 'array' then
    raise exception 'Sauvegarde sans tables.';
  end if;
  if not exists (select 1 from public.clients where id = v_client) then
    raise exception 'Etablissement introuvable : creez la fiche client avant de restaurer.';
  end if;

  foreach v_tbl in array v_ordre loop
    select t->'lignes' into v_lignes
      from jsonb_array_elements(p_dump->'tables') t
     where t->>'table' = v_tbl;
    if v_lignes is null or jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
      continue;
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_lignes) l
       where l ? 'client_id' and l->>'client_id' is distinct from v_client::text
    ) then
      raise exception 'Ligne etrangere detectee dans la table % : restauration refusee.', v_tbl;
    end if;

    v_lu := jsonb_array_length(v_lignes);
    execute format(
      'insert into public.%I select r.* from jsonb_populate_recordset(null::public.%I, $1) r on conflict do nothing',
      v_tbl, v_tbl
    ) using v_lignes;
    get diagnostics v_n = row_count;

    v_insere := v_insere || jsonb_build_object(v_tbl, v_n);
    if v_lu - v_n > 0 then
      v_ignore := v_ignore || jsonb_build_object(v_tbl, v_lu - v_n);
    end if;
  end loop;

  return jsonb_build_object('insere', v_insere, 'ignore', v_ignore);
end;
$fn$;

-- Droits inchangés : l'interne n'est appelable que par l'enveloppe (définie en 23).
revoke all on function public.patisgest_restaurer_sauvegarde_interne(jsonb) from public, anon, authenticated;

-- ===== 34-cout-of-partiel.sql =====
-- =====================================================================
-- 34 — Coût des OF partiellement produits (revue F-20, rapport externe B-004).
--
-- Bug : terminer_of calcule le coût unitaire avec `v_known / p_qte`, où p_qte
-- est la quantité du lot partiel. Or les consommations (v_known) sont
-- enregistrées UNE fois, au lancement, pour toute la quantité prévue. Chaque
-- lot partiel réimpute donc la totalité : 1 000 DA de matières, lots 50 + 50
-- => 2 000 DA comptés au lieu de 1 000.
--
-- Correction : diviser par la quantité PRÉVUE de l'OF, la même pour tous les lots.
--
-- Portée : seules les NOUVELLES clôtures de lots sont corrigées. Les coûts
-- déjà enregistrés ne sont pas modifiés ; leur revue est une décision séparée.
-- Garde stricte : la migration refuse de s'appliquer si le corps installé n'est
-- pas exactement celui attendu (une seule occurrence de la formule).
-- =====================================================================

do $migration$
declare
  definition text;
  corrigee   text;
  n          integer;
  ancien     constant text := 'v_known / p_qte + v_overhead_unit';
  nouveau    constant text := 'v_known / nullif(v_of.qte_prevue, 0) + v_overhead_unit';
begin
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.terminer_of(uuid,numeric,text,date)');
  if definition is null then
    raise exception 'RPC terminer_of absente : appliquer 07 avant 34.';
  end if;

  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà corrigée : migration rejouable sans effet
  else
    raise exception 'Formule de coût de terminer_of inattendue (occurrences : %) : audit manuel requis.', n;
  end if;
end
$migration$;

-- ===== 35-version-schema-app.sql =====
-- =====================================================================
-- 35 — Version de schéma vérifiée par l'application (revue F-19).
--
-- Problème : l'application lit des vues et des colonnes qui peuvent être
-- absentes d'une base déployée à une autre version. Sans marqueur, l'erreur
-- remonte en « relation does not exist » au milieu d'un écran.
--
-- Correction : une table à une seule ligne donne la version du schéma.
-- L'application la lit au chargement de l'espace et refuse de fonctionner si
-- elle est absente ou inférieure à la version qu'elle attend (src/lib/schema-version.ts).
--
-- Rejouable : création idempotente, la version n'est jamais abaissée.
-- Lecture réservée aux utilisateurs authentifiés ; aucune écriture côté client.
-- =====================================================================

create table if not exists public.app_schema_version (
  id          smallint primary key default 1 check (id = 1),
  version     integer not null check (version > 0),
  applique_le timestamptz not null default now()
);

insert into public.app_schema_version (id, version)
values (1, 35)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

alter table public.app_schema_version enable row level security;

revoke all on public.app_schema_version from public, anon, authenticated;
grant select on public.app_schema_version to authenticated;

-- Création conditionnelle de la politique de lecture (sans DROP : rejouable).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'app_schema_version'
       and policyname = 'app_schema_version_lecture'
  ) then
    create policy app_schema_version_lecture on public.app_schema_version
      for select to authenticated using (true);
  end if;
end $$;

-- ===== 36-dates-algiers.sql =====
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

-- ===== 37-transfert-client-ref.sql =====
-- =====================================================================
-- 37 — Transfert idempotent (revue B-007 : client_ref sur les transferts).
--
-- Problème : un double clic, une resoumission ou un rejeu hors ligne
-- relancent transferer_article et déplacent deux fois le même stock.
-- Les ordres de fabrication sont déjà protégés (migration 16, client_ref).
--
-- Correction (sans modifier transferer_article, déjà appliquée) :
--   * transferts.client_ref, unique par client quand il est renseigné ;
--   * transferer_article_ref : même référence = rejeu, renvoie le transfert
--     existant sans rien déplacer ; même référence pour une autre demande =
--     refus explicite ; verrou consultatif pour que deux appels simultanés
--     ne déplacent pas deux fois. Tout se fait dans une seule transaction.
--
-- L'application ne l'appelle pas encore : elle reste sur transferer_article
-- tant que cette migration n'est pas appliquée au pilote. La version de schéma
-- est enregistrée à 37 (jamais abaissée) ; la requise côté app passera à 37
-- lorsque l'appel sera branché.
--
-- Rejouable. Gardes strictes : échoue si les prérequis sont absents.
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transferts') then
    raise exception 'Migration 37 : table transferts absente (migration 08 requise).';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'transferer_article') then
    raise exception 'Migration 37 : transferer_article absente (migrations 08 et 21 requises).';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_schema_version') then
    raise exception 'Migration 37 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

alter table public.transferts add column if not exists client_ref text;

alter table public.transferts drop constraint if exists transferts_client_ref_longueur;
alter table public.transferts add constraint transferts_client_ref_longueur
  check (client_ref is null or length(client_ref) between 1 and 64);

create unique index if not exists transferts_client_ref_uniq
  on public.transferts (client_id, client_ref) where client_ref is not null;

create or replace function public.transferer_article_ref(
  p_article_id uuid,
  p_from_site_id uuid,
  p_to_site_id uuid,
  p_qte numeric,
  p_motif text,
  p_responsable text default null,
  p_client_ref text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_cle text := nullif(trim(coalesce(p_client_ref, '')), '');
  v_existant record;
  v_qte_existante numeric;
  v_article_present boolean;
  v_resultat jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if v_cle is not null and length(v_cle) > 64 then
    raise exception 'Référence de transfert trop longue (64 caractères maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a transférer.';
  end if;

  if v_cle is not null then
    -- Sérialise les appels de même référence : le second attend la fin du premier
    -- puis voit son transfert et le rejoue au lieu de déplacer le stock à nouveau.
    perform pg_advisory_xact_lock(hashtextextended(v_client::text || ':' || v_cle, 0));

    select t.id, t.ref, t.responsable, t.from_site_id, t.to_site_id, t.lignes
      into v_existant
      from public.transferts t
     where t.client_id = v_client and t.client_ref = v_cle;

    if found then
      select coalesce(sum((l->>'qty')::numeric), 0),
             coalesce(bool_or(l->>'articleId' = p_article_id::text), false)
        into v_qte_existante, v_article_present
        from jsonb_array_elements(v_existant.lignes) l;

      if v_existant.from_site_id is distinct from p_from_site_id
         or v_existant.to_site_id is distinct from p_to_site_id
         or not v_article_present
         or v_qte_existante is distinct from round(p_qte, 4) then
        raise exception 'Référence de transfert déjà utilisée pour un autre transfert.';
      end if;

      return jsonb_build_object(
        'transfert_id', v_existant.id,
        'ref', v_existant.ref,
        'responsable', v_existant.responsable,
        'lots', jsonb_array_length(v_existant.lignes),
        'qte', p_qte,
        'rejoue', true
      );
    end if;
  end if;

  -- Délègue au mouvement existant : même transaction, mêmes contrôles de stock et de DLC.
  v_resultat := public.transferer_article(
    p_article_id, p_from_site_id, p_to_site_id, p_qte, p_motif, p_responsable
  );

  if v_cle is not null then
    update public.transferts t set client_ref = v_cle
     where t.id = (v_resultat->>'transfert_id')::uuid;
  end if;

  return v_resultat || jsonb_build_object('rejoue', false);
end;
$$;

revoke all on function public.transferer_article_ref(uuid, uuid, uuid, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transferer_article_ref(uuid, uuid, uuid, numeric, text, text, text)
  to authenticated, service_role;

-- Version de schéma : enregistrée à 37, jamais abaissée (même mécanisme que la 35).
insert into public.app_schema_version (id, version)
values (1, 37)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ===== 38-anti-abus-vitrine-source.sql =====
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

-- ===== 39-limites-tenant-restauration-sites-vitrine.sql =====
-- =====================================================================
-- 39 — garde-fous tenant pour la vue vitrine, les sites, l'offre et la restauration.
--
-- Additive only. Ne change aucune migration déjà appliquée. Cette migration
-- doit d'abord passer dans les fixtures PGlite et Supabase CLI jetables; elle
-- n'autorise pas son application automatique à un projet réel.
-- =====================================================================

-- D2: enlever la clé interne client_id de la projection anon. La routine de
-- commande retrouve désormais la famille par sous-domaine et clé publique.
do $migration$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := 'where v.client_id = v_client';
  v_count integer;
begin
  if to_regclass('public.vitrine_catalogue') is null then
    raise exception 'Vue vitrine_catalogue absente : appliquer la série vitrine avant 39.';
  end if;

  -- La fonction publique doit déjà être réparée par la migration 32, mais le
  -- test de présence refuse explicitement toute autre variante.
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is null then
    raise exception 'RPC de commande vitrine absente : appliquer la migration 27 avant 39.';
  end if;
  select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
    into v_definition;
  if position('select s.id, s.client_id, s.subdomain' in v_definition) = 0 then
    raise exception 'RPC vitrine inattendue : appliquer/réconcilier la migration 32 avant 39.';
  end if;
  v_count := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
  if v_count = 1 then
    v_corrected := replace(v_definition, v_anchor, 'where v.subdomain = v_site.subdomain');
    execute v_corrected;
  elsif v_count = 0 and position('where v.subdomain = v_site.subdomain' in v_definition) > 0 then
    null; -- déjà corrigée
  else
    raise exception 'Filtre catalogue de la RPC vitrine inattendu/ambigu : réconciliation manuelle.';
  end if;

  -- DROP sans CASCADE : un dépendant inattendu fait échouer la migration au
  -- lieu de le supprimer silencieusement. L'ACL est restaurée explicitement.
  drop view public.vitrine_catalogue;
  execute $view$
    create view public.vitrine_catalogue
    with (security_invoker = false)
    as
    with premiere as (
      select distinct on (f.client_id, f.cle_nom)
             f.client_id,
             f.cle_nom,
             coalesce(nullif(trim(f.nom_vitrine), ''), f.nom) as nom,
             f.description_vitrine as description,
             f.photo_vitrine,
             f.ordre_vitrine,
             f.produit_id
        from public.recette_familles f
       where f.visible_vitrine
         and f.cle_nom is not null
       order by f.client_id, f.cle_nom, f.ordre_vitrine, f.nom, f.id
    )
    select p.cle_nom,
           p.nom,
           p.description,
           p.photo_vitrine,
           p.ordre_vitrine,
           c.nom as etablissement,
           s.nom as boutique,
           s.subdomain,
           s.custom_domain,
           nullif(a.pv_ht, 0) as prix_ht,
           a.tva,
           a.unite
      from premiere p
      join public.clients c on c.id = p.client_id
      join public.sites s on s.client_id = p.client_id
       and s.publication = 'publiee'
      left join public.articles a on a.id = p.produit_id
  $view$;
  comment on view public.vitrine_catalogue is
    'Catalogue public des vitrines publiées. Aucun coût ni identifiant interne de tenant.';
  revoke all on public.vitrine_catalogue from public, anon, authenticated;
  grant select on public.vitrine_catalogue to anon, authenticated;
end
$migration$;

-- D4: les colonnes sensibles ne sont modifiables qu'au travers des RPC
-- SECURITY DEFINER validées. L'écran d'administration n'écrit que nom/type/adresse.
revoke insert, update on public.sites from public, anon, authenticated;
grant insert (client_id, nom, type, adresse) on public.sites to authenticated;
grant update (nom, type, adresse) on public.sites to authenticated;

-- D9: l'offre est un état de facturation, pas une préférence du tenant.
--
-- Correction du 23/11/2026, après application réelle au pilote : la première
-- version révoquait UPDATE sur TOUTE la table `clients`. C'était trop large —
-- `actions-etablissement.ts` met à jour nom/adresse/téléphone/NIF/NIS/RC depuis
-- l'écran Paramètres, et c'est ce qui alimente les mentions légales des tickets
-- (NF-06). Révoquer en bloc cassait une fonctionnalité vendue pour protéger un
-- champ qui n'y tenait pas.
--
-- On révoque donc la table entière puis on re-accorde, **colonne par colonne**,
-- les seules colonnes que l'écran d'administration écrit réellement. `offre`
-- n'y est pas : c'est un état de facturation, il ne se change pas depuis
-- l'interface. Toute autre colonne future sera, par défaut, non modifiable —
-- le défaut sûr est de refuser, pas d'ouvrir.
revoke update on public.clients from public, anon, authenticated;
grant update (nom, adresse, telephone, nif, nis, rc) on public.clients to authenticated;

-- D7: valider toutes les FK mono-colonne entre tables restaurées qui portent
-- client_id, avant la première insertion. Les références peuvent cibler une
-- ligne déjà présente (même tenant) ou une ligne de ce même dump. Une ID déjà
-- détenue par un autre tenant est rejetée même si le dump contient une ligne
-- conflictuelle de même ID. La liste fermée est la même que celle de la routine
-- de restauration; noms SQL viennent uniquement du catalogue système.
create or replace function public.patisgest_verifier_references_tenant_dump(
  p_dump jsonb,
  p_client uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_fk record;
  v_foreign boolean;
begin
  for v_fk in
    select child.relname as child_table,
           child_col.attname as child_column,
           parent.relname as parent_table
      from pg_catalog.pg_constraint fk
      join pg_catalog.pg_class child on child.oid = fk.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_catalog.pg_class parent on parent.oid = fk.confrelid
      join pg_catalog.pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join pg_catalog.pg_attribute child_col
        on child_col.attrelid = child.oid and child_col.attnum = fk.conkey[1]
      join pg_catalog.pg_attribute parent_col
        on parent_col.attrelid = parent.oid and parent_col.attnum = fk.confkey[1]
     where fk.contype = 'f'
       and child_ns.nspname = 'public'
       and parent_ns.nspname = 'public'
       and array_length(fk.conkey, 1) = 1
       and array_length(fk.confkey, 1) = 1
       and parent_col.attname = 'id'
       and child.relname = any (array[
         'sites','fournisseurs','articles','conversions','parametres_couts',
         'recette_familles','recette_versions','lots','mouvements','historique_prix',
         'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
         'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
         'non_conformites','taches_planning'
       ])
       and parent.relname = any (array[
         'sites','fournisseurs','articles','conversions','parametres_couts',
         'recette_familles','recette_versions','lots','mouvements','historique_prix',
         'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
         'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
         'non_conformites','taches_planning'
       ])
       and exists (select 1 from pg_catalog.pg_attribute a
                    where a.attrelid = child.oid and a.attname = 'client_id' and not a.attisdropped)
       and exists (select 1 from pg_catalog.pg_attribute a
                    where a.attrelid = parent.oid and a.attname = 'client_id' and not a.attisdropped)
  loop
    execute pg_catalog.format($sql$
      select exists (
        select 1
          from jsonb_array_elements($1->'tables') as t(item)
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(t.item->'lignes') = 'array'
                 then t.item->'lignes' else '[]'::jsonb end
          ) as child_row(item)
         where t.item->>'table' = %L
           and child_row.item->>%L is not null
           and (
             exists (
               select 1 from public.%I parent_row
                where parent_row.id::text = child_row.item->>%L
                  and parent_row.client_id is distinct from $2
             )
             or (
               not exists (
                 select 1 from public.%I parent_row
                  where parent_row.id::text = child_row.item->>%L
                    and parent_row.client_id = $2
               )
               and not exists (
                 select 1
                   from jsonb_array_elements($1->'tables') as target_table(item)
                   cross join lateral jsonb_array_elements(
                     case when jsonb_typeof(target_table.item->'lignes') = 'array'
                          then target_table.item->'lignes' else '[]'::jsonb end
                   ) as target_row(item)
                  where target_table.item->>'table' = %L
                    and target_row.item->>'id' = child_row.item->>%L
                    and target_row.item->>'client_id' = $2::text
               )
             )
           )
      )
    $sql$, v_fk.child_table, v_fk.child_column, v_fk.parent_table, v_fk.child_column,
          v_fk.parent_table, v_fk.child_column, v_fk.parent_table, v_fk.child_column)
      into v_foreign using p_dump, p_client;
    if v_foreign then
      raise exception 'Référence étrangère inter-tenant détectée dans %.% : restauration refusée.',
        v_fk.child_table, v_fk.child_column;
    end if;
  end loop;
end;
$fn$;
revoke all on function public.patisgest_verifier_references_tenant_dump(jsonb, uuid) from public, anon, authenticated;

-- Brancher le prévol dans la routine interne; marqueur + gardes pour empêcher
-- une double insertion si cette migration est rejouée en fixture.
do $patch$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := '  foreach v_tbl in array v_ordre loop';
  v_count integer;
begin
  select pg_get_functiondef('public.patisgest_restaurer_sauvegarde_interne(jsonb)'::regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'Routine interne de restauration absente : appliquer la migration 23 avant 39.';
  end if;
  if position('patisgest_verifier_references_tenant_dump(p_dump, v_client)' in v_definition) > 0 then
    null;
  else
    v_count := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
    if v_count <> 1 then
      raise exception 'Ancre de restauration inattendue/ambiguë : revue manuelle nécessaire.';
    end if;
    v_corrected := replace(v_definition, v_anchor,
      '  perform public.patisgest_verifier_references_tenant_dump(p_dump, v_client);' || E'\n' || v_anchor);
    execute v_corrected;
  end if;
end
$patch$;

-- ===== 40-journal-audit.sql =====
-- =====================================================================
-- 40 — Journal d'audit « qui, quoi, quand » conservé 10 ans (NF-10, RI-06).
--
-- Problème : le cahier des charges v4.0 exige un journal d'audit sur ventes,
-- stocks, clôtures et connexions, conservé 10 ans (NF-10, §7 Sécurité, RI-06),
-- et la table `journal_audit` est décrite dans l'architecture (§4.1). Aucune
-- migration ne l'avait créée : le produit fonctionnait sans aucune trace
-- exploitable en cas de contrôle, de litige ou de rappel produit.
--
-- Propriétés garanties ici, et pourquoi chacune est nécessaire :
--
--   * IMMUABILITÉ — un journal qu'on peut réécrire ne prouve rien. Les rôles
--     applicatifs n'ont ni UPDATE ni DELETE, et un déclencheur refuse ces
--     opérations même pour le propriétaire de la table (protection contre une
--     erreur de code côté serveur, pas contre un superutilisateur).
--   * AUTORITÉ DE L'IDENTITÉ — acteur_id et client_id sont imposés par
--     `auth.uid()` / `patisgest_mon_client()`, jamais par le client HTTP.
--     Sans cela, n'importe qui pourrait signer une action au nom d'un autre.
--   * CONSERVATION 10 ANS — RI-06 interdit toute purge avant 10 ans ; le
--     déclencheur refuse un DELETE qui toucherait une ligne plus récente que
--     dix ans. (Le propriétaire de la base peut toujours tronquer manuellement :
--     aucune politique SQL ne protège d'un superutilisateur. C'est écrit ici
--     pour que personne ne croie à une garantie qu'on n'a pas donnée.)
--   * ISOLATION — lecture réservée au propriétaire du même client. Le labo et
--     le vendeur n'ont pas à lire l'historique global des actions du tenant.
--
-- Additive only. Ne modifie aucune migration déjà appliquée. Rejouable.
-- =====================================================================

do $garde$
begin
  if to_regclass('public.clients') is null then
    raise exception 'Migration 40 : table clients absente (migration 01 requise).';
  end if;
  if to_regclass('public.utilisateurs') is null then
    raise exception 'Migration 40 : table utilisateurs absente (migration 01 requise).';
  end if;
  if to_regprocedure('public.patisgest_mon_client()') is null then
    raise exception 'Migration 40 : patisgest_mon_client() absente (migration 05 requise).';
  end if;
end
$garde$;

-- ---------- Table ----------
-- `details` reste jsonb volontairement : le journal doit pouvoir enregistrer
-- une forme qui change (prix avant/après, quantités, motif) sans migration.
-- Aucune clé étrangère vers `utilisateurs` : supprimer un compte ne doit jamais
-- effacer l'historique de ses actions (l'email est donc conservé en texte).
create table if not exists public.journal_audit (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id),
  acteur_id    uuid,
  acteur_email text not null default 'inconnu',
  action       text not null,
  table_cible  text not null,
  ligne_id     uuid,
  details      jsonb not null default '{}'::jsonb,
  cree_le      timestamptz not null default now()
);

comment on table public.journal_audit is
  'Journal d''audit NF-10 : qui, quoi, quand. Immuable, isolation par tenant, conservation 10 ans (RI-06).';
comment on column public.journal_audit.acteur_email is
  'Copie de l''email au moment de l''action : survit à la suppression du compte.';
comment on column public.journal_audit.details is
  'Charge utile libre (avant/après, motif). Ne jamais y stocker de secret ni de coût fournisseur détaillé.';

create index if not exists journal_audit_client_date_idx
  on public.journal_audit (client_id, cree_le desc);
create index if not exists journal_audit_cible_idx
  on public.journal_audit (client_id, table_cible, ligne_id, cree_le desc);
create index if not exists journal_audit_acteur_idx
  on public.journal_audit (client_id, acteur_id, cree_le desc);

-- ---------- Immuabilité ----------
-- Déclencheur plutôt que simple absence de GRANT : un GRANT oublié sur une
-- base restaurée ou recréée doit échouer bruyamment, pas silencieusement.
create or replace function public.patisgest_journal_audit_immuable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent boolean;
begin
  if tg_op = 'UPDATE' then
    raise exception 'Journal d''audit immuable : la ligne % ne peut pas être modifiée.', old.id
      using errcode = 'insufficient_privilege';
  end if;
  -- DELETE : refusé dans tous les cas sur une ligne de moins de 10 ans (RI-06).
  -- Au-delà, seul un rôle de confiance (service_role / propriétaire) peut agir ;
  -- les rôles applicatifs n'ont de toute façon pas le privilège DELETE.
  select exists (
    select 1 from public.journal_audit j
     where j.id = old.id and j.cree_le > now() - interval '10 years'
  ) into v_recent;
  if v_recent then
    raise exception 'Journal d''audit immuable : purge interdite avant 10 ans (RI-06), ligne %.', old.id
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end
$$;

drop trigger if exists journal_audit_immuable on public.journal_audit;
create trigger journal_audit_immuable
  before update or delete on public.journal_audit
  for each row execute function public.patisgest_journal_audit_immuable();

-- Une fonction de déclencheur n'a aucune raison d'être appelable en RPC.
-- Sans ces révocations, `anon` peut l'invoquer via PostgREST (test droits-execution).
revoke all on function public.patisgest_journal_audit_immuable() from public, anon, authenticated;

-- ---------- RLS ----------
alter table public.journal_audit enable row level security;

revoke all on public.journal_audit from public, anon, authenticated;
-- Insertion réservée aux déclencheurs (SECURITY DEFINER). Aucun droit
-- d'écriture directe : sinon l'acteur pourrait fabriquer un faux événement.
-- Lecture : le propriétaire de son tenant, plus la service_role d'exploitation.
grant select on public.journal_audit to authenticated;

drop policy if exists journal_audit_lecture_proprietaire on public.journal_audit;
create policy journal_audit_lecture_proprietaire on public.journal_audit
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

-- ---------- Écriture par déclencheur ----------
-- Une seule fonction d'enregistrement, appelée par les déclencheurs cibles.
-- Elle impose l'identité depuis la session et ignore toute valeur fournie.
create or replace function public.patisgest_journaliser(
  p_client_id uuid,
  p_action text,
  p_table text,
  p_ligne_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := 'inconnu';
  v_uid   uuid := auth.uid();
begin
  if p_client_id is null then
    return; -- rien à rattacher (contexte de service) : on n'écrit pas de ligne orpheline
  end if;
  if v_uid is not null then
    select u.email into v_email from public.utilisateurs u where u.auth_user_id = v_uid limit 1;
  end if;
  insert into public.journal_audit (client_id, acteur_id, acteur_email, action, table_cible, ligne_id, details)
  values (p_client_id, v_uid, coalesce(v_email, 'inconnu'), p_action, p_table, p_ligne_id, coalesce(p_details, '{}'::jsonb));
exception
  when others then
    -- Invariant produit « alerte, jamais blocage » (RG-01.1) : une panne du
    -- journal ne doit pas annuler une vente. On journalise l'échec dans les
    -- journaux PostgreSQL pour qu'il soit visible à l'exploitation.
    raise warning 'journal_audit : écriture impossible pour %.% (action %) : %',
      p_table, coalesce(p_ligne_id::text, '-'), p_action, sqlerrm;
end
$$;

revoke all on function public.patisgest_journaliser(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------- Déclencheurs métier ----------
-- NF-10 nomme explicitement ventes, stocks, clôtures et connexions.

create or replace function public.patisgest_audit_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne record;
  v_client uuid;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_ligne := old;
  else
    v_ligne := new;
  end if;
  -- `client_id` est présent sur toutes les tables auditées (RI-01).
  execute format('select ($1).client_id') into v_client using v_ligne;
  -- On ne conserve pas les montants ni les coûts dans `details` : le journal
  -- ne doit pas devenir une seconde base de données financière lisible.
  if tg_op = 'INSERT' then
    v_details := jsonb_build_object('operation', 'INSERT');
  elsif tg_op = 'UPDATE' then
    v_details := jsonb_build_object('operation', 'UPDATE');
  else
    v_details := jsonb_build_object('operation', 'DELETE');
  end if;
  perform public.patisgest_journaliser(
    v_client,
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name,
    v_ligne.id,
    v_details
  );
  return coalesce(new, old);
end
$$;

-- Idem pour la fonction de déclencheur métier : elle ne doit pas être exposée
-- comme RPC. `postgres` conserve EXECUTE, donc les déclencheurs fonctionnent.
revoke all on function public.patisgest_audit_ligne() from public, anon, authenticated;

do $declencheurs$
declare
  v_table text;
begin
  foreach v_table in array array['ventes', 'mouvements', 'clotures', 'ordres_fabrication', 'articles', 'lots'] loop
    if to_regclass('public.' || v_table) is null then
      continue; -- tableau absent sur une base partielle : ne pas bloquer la migration
    end if;
    execute format('drop trigger if exists audit_%1$s on public.%1$I;', v_table);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.patisgest_audit_ligne();',
      v_table
    );
  end loop;
end
$declencheurs$;

-- Connexions / changements de rôle : la table utilisateurs porte l'arrivée d'un
-- compte et les changements de rôle (c'est là qu'un droit est accordé). Les
-- vraies connexions Auth vivent chez Supabase ; on trace ce qui est auditable
-- depuis le schéma public, et on ne prétend pas faire plus.
drop trigger if exists audit_utilisateurs on public.utilisateurs;
create trigger audit_utilisateurs
  after insert or update of role on public.utilisateurs
  for each row execute function public.patisgest_audit_ligne();

-- ---------- Version de schéma ----------
insert into public.app_schema_version (id, version)
values (1, 40)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ------------------------------------------------ vérification (lecture seule)
--   select tgname, c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where not t.tgisinternal and t.tgname like 'audit_%' order by 2;
--   select count(*) from public.journal_audit;           -- doit croître après une vente
--   update public.journal_audit set action = 'x';        -- doit échouer (immuable)

-- ===== 41-avoirs-retours.sql =====
-- Migration 41 — Retours et avoirs (MOD-06 / US-06.4).
--
-- « En tant que vendeur, je fais un retour/avoir (motif, remise en stock ou
--   destruction tracée). »  — Cahier des charges v4.0, US-06.4
--
-- Décisions, et pourquoi :
--
-- 1. Deux devenirs seulement : `remise_en_stock` ou `destruction`. Pas de
--    troisième voie implicite, pas de « on verra plus tard ». Un retour dont
--    le devenir est flou est un risque sanitaire et un écart de stock garanti.
--
-- 2. La quantité rendue ne peut jamais dépasser la quantité vendue, avoirs
--    successifs inclus. Un avoir est une correction, pas une source de stock :
--    sans ce plafond, un vendeur peut fabriquer de la marchandise avec des
--    retours fictifs.
--
-- 3. Le stock n'est jamais rendu « en vrac » : il retourne dans le lot
--    d'origine quand il existe encore, sinon dans un lot de retour dédié
--    traçable. On ne mélange pas la marchandise rendue avec la production du
--    jour.
--
-- 4. La destruction produit un mouvement négatif à hauteur de la quantité
--    rendue : les pertes restent mesurables (MOD-07, anti-gaspi).
--
-- 5. Tout est journalisé par la migration 40 : la table `avoirs` est ajoutée
--    à la liste des tables auditées, sans code dédié dans cette migration.

-- ---------------------------------------------------------------- table
create table if not exists public.avoirs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  vente_id uuid not null references public.ventes (id) on delete restrict,
  site_id uuid not null references public.sites (id) on delete restrict,
  article_id uuid not null references public.articles (id) on delete restrict,
  numero text not null,
  qte numeric(12,4) not null check (qte > 0),
  -- Montants figés au moment de l'avoir : le prix de vente peut changer
  -- demain, l'avoir déjà émis ne doit pas changer avec lui.
  pu_ht numeric(12,2) not null default 0,
  tva_pct numeric(5,2) not null default 0,
  total_ht numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  mode text not null check (mode in ('remise_en_stock', 'destruction')),
  motif text not null check (length(btrim(motif)) between 3 and 500),
  lot_id uuid references public.lots (id) on delete set null,
  -- Avoir de remise en stock qui ne trouve plus le lot d'origine : on crée un
  -- lot de retour et on garde le lien. La traçabilité ne dépend pas du hasard.
  lot_retour_cree boolean not null default false,
  acteur_id uuid,
  acteur_email text,
  cree_le timestamptz not null default now(),
  unique (client_id, numero)
);

create index if not exists avoirs_client_date_idx on public.avoirs (client_id, cree_le desc);
create index if not exists avoirs_vente_idx on public.avoirs (vente_id);

alter table public.avoirs enable row level security;

drop policy if exists avoirs_lecture on public.avoirs;
create policy avoirs_lecture on public.avoirs
  for select using (client_id = public.patisgest_mon_client());

-- Aucune écriture directe : tout passe par la fonction ci-dessous, qui vérifie
-- le plafond de quantité, le périmètre du tenant et la cohérence du stock.
-- `revoke all` et pas seulement les écritures : certaines installations
-- accordent des droits par défaut à `anon` sur toute nouvelle table du schéma
-- public, et un `revoke insert, update…` laisserait alors `select` ouvert au
-- visiteur anonyme. C'est exactement ce que la revue de surface anonyme
-- (test `serie-main-vitrine`) détecte — et elle a raison.
revoke all on public.avoirs from public, anon, authenticated;
grant select on public.avoirs to authenticated;

-- ---------------------------------------------------------------- fonction
create or replace function public.enregistrer_avoir(
  p_vente_id uuid,
  p_mode text,
  p_motif text,
  p_qte numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_email text;
  v_vente record;
  v_article record;
  v_deja numeric;
  v_qte numeric := round(coalesce(p_qte, 0), 4);
  v_motif text := btrim(coalesce(p_motif, ''));
  v_lot_id uuid;
  v_pu numeric := 0;
  v_tva numeric := 0;
  v_ht numeric := 0;
  v_ttc numeric := 0;
  v_lot_cree boolean := false;
  v_numero text;
  v_avoir uuid;
  v_ids uuid[] := '{}';
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;

  -- ---- appelant : tenant + rôle ----
  select u.client_id, u.role::text, u.email into v_client, v_role, v_email
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a enregistrer un avoir.';
  end if;

  -- ---- validations d'entrée ----
  if p_mode is null or p_mode not in ('remise_en_stock', 'destruction') then
    raise exception 'Mode d''avoir invalide : remise en stock ou destruction.';
  end if;
  if length(v_motif) < 3 or length(v_motif) > 500 then
    raise exception 'Motif obligatoire (3 a 500 caracteres).';
  end if;
  if v_qte <= 0 or v_qte > 100000000 then
    raise exception 'Quantite d''avoir invalide.';
  end if;
  if p_vente_id is null then
    raise exception 'Vente obligatoire.';
  end if;

  -- ---- vente : périmètre et cohérence ----
  select v.id, v.client_id, v.site_id, v.lignes into v_vente
    from public.ventes v
   where v.id = p_vente_id;
  if v_vente.id is null then
    raise exception 'Vente introuvable.';
  end if;
  if v_vente.client_id <> v_client then
    raise exception 'Vente hors perimetre.';
  end if;

  -- L'article de l'avoir est celui de la première ligne de la vente : un avoir
  -- porte sur un produit, pas sur un ticket entier. Les tickets multi-produits
  -- sont traités par autant d'avoirs que de produits rendus.
  select (l->>'articleId')::uuid into v_lot_id from jsonb_array_elements(v_vente.lignes) l limit 1;
  if v_lot_id is null then
    raise exception 'Vente sans ligne : avoir impossible.';
  end if;

  select a.id, a.client_id, a.nom into v_article
    from public.articles a where a.id = v_lot_id;
  if v_article.client_id is null or v_article.client_id <> v_client then
    raise exception 'Article de la vente hors perimetre.';
  end if;
  v_lot_id := null;

  -- Quantité totale vendue de cet article sur ce ticket.
  declare
    v_vendu numeric := 0;
  begin
    select coalesce(sum((l->>'qty')::numeric), 0) into v_vendu
      from jsonb_array_elements(v_vente.lignes) l
     where (l->>'articleId')::uuid = v_article.id;
    select coalesce(sum(a.qte), 0) into v_deja
      from public.avoirs a
     where a.vente_id = v_vente.id and a.article_id = v_article.id;
    if v_deja + v_qte > v_vendu then
      raise exception 'Quantite d''avoir superieure a la quantite vendue (% vendu, % deja rendu).',
        v_vendu, v_deja;
    end if;
  end;

  -- ---- devenir de la marchandise ----
  if p_mode = 'remise_en_stock' then
    -- Lot d'origine : celui de la vente, s'il existe encore et appartient au
    -- tenant. On ne remet pas en stock un lot d'un autre site.
    -- Attention à la structure : `lignes[].lots[]` porte {lotId, numero, qty},
    -- ce n'est PAS un champ de la ligne (bug évité ici, verrouillé par test).
    select (lot->>'lotId')::uuid into v_lot_id
      from jsonb_array_elements(v_vente.lignes) l,
           lateral jsonb_array_elements(coalesce(l->'lots', '[]'::jsonb)) lot
     where (l->>'articleId')::uuid = v_article.id
     limit 1;
    if v_lot_id is not null then
      perform 1 from public.lots l
       where l.id = v_lot_id and l.client_id = v_client and l.site_id = v_vente.site_id;
      if not found then
        v_lot_id := null;
      end if;
    end if;

    if v_lot_id is not null then
      update public.lots l
         set qte_rest = l.qte_rest + v_qte
       where l.id = v_lot_id;
    else
      -- Lot de retour dédié : traçable, isolé de la production du jour.
      v_numero := 'RET-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' ||
                  substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
      insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception, ref)
      values (v_client, v_article.id, v_vente.site_id, v_numero, v_qte, v_qte, 0, current_date, 'Retour client')
      returning id into v_lot_id;
      v_lot_cree := true;
    end if;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, v_lot_id, v_vente.site_id, 'avoir_remise', v_qte, 0,
            p_vente_id::text, 'Retour client : ' || v_motif);
  else
    -- Destruction : sortie de stock à hauteur du retour, pour que la perte
    -- reste mesurable. Aucun lot n'est recréé.
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, null, v_vente.site_id, 'avoir_destruction', -v_qte, 0,
            p_vente_id::text, 'Destruction : ' || v_motif);
  end if;

  -- ---- montants ----
  -- Prix unitaire et TVA issus de la ligne de vente d'origine, pas des prix
  -- du jour : un avoir rembourse ce qui a ete encaisse, pas ce que coute
  -- aujourd'hui le meme produit.
  select coalesce((l->>'pu')::numeric, 0), coalesce((l->>'tva')::numeric, 0)
    into v_pu, v_tva
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id
   limit 1;
  v_pu := coalesce(v_pu, 0);
  v_tva := coalesce(v_tva, 0);
  v_ht := round(v_qte * v_pu, 2);
  v_ttc := round(v_ht * (1 + v_tva / 100), 2);

  -- ---- enregistrement de l'avoir ----
  v_numero := 'AV-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' ||
              substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
  insert into public.avoirs (client_id, vente_id, site_id, article_id, numero, qte, mode, motif,
                             pu_ht, tva_pct, total_ht, total_ttc,
                             lot_id, lot_retour_cree, acteur_id, acteur_email)
  values (v_client, v_vente.id, v_vente.site_id, v_article.id, v_numero, v_qte, p_mode, v_motif,
          v_pu, v_tva, v_ht, v_ttc,
          v_lot_id, v_lot_cree, v_auth, v_email)
  returning id into v_avoir;

  return jsonb_build_object(
    'avoir_id', v_avoir,
    'numero', v_numero,
    'mode', p_mode,
    'qte', v_qte,
    'total_ht', v_ht,
    'total_ttc', v_ttc,
    'article', v_article.nom,
    'lot_id', v_lot_id,
    'lot_retour_cree', v_lot_cree
  );
end;
$fn$;

revoke all on function public.enregistrer_avoir(uuid, text, text, numeric) from public, anon;
grant execute on function public.enregistrer_avoir(uuid, text, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------- audit
-- La table `avoirs` entre dans la liste auditée par la migration 40, avec les
-- mêmes garanties (identité issue de la session, ligne immuable).
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_avoirs on public.avoirs;
    create trigger audit_avoirs
      after insert or update or delete on public.avoirs
      for each row execute function public.patisgest_audit_ligne();
  end if;
end
$audit$;

-- ---------------------------------------------------------------- version
insert into public.app_schema_version (id, version) values (1, 41)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 42-donnees-personnelles.sql =====
-- Migration 42 — Loi 18-07 : export et anonymisation des données personnelles.
--
-- Les mentions légales du produit promettent « un export et une suppression sur
-- demande sont possibles ». Rien ne permettait de tenir cette promesse : c'était
-- une phrase, pas une fonctionnalité. La loi 18-07 impose pourtant :
--   * le droit d'accès (savoir ce qui est détenu sur une personne) ;
--   * le droit d'opposition / d'effacement.
--
-- Décision structurante : **on anonymise, on ne supprime pas.**
--
-- Une vente est une écriture comptable conservée 10 ans (code de commerce,
-- RI-06). La détruire au motif d'une demande individuelle créerait une faute
-- comptable. La loi 18-07 ne demande d'ailleurs pas la destruction des
-- écritures : elle demande qu'on ne puisse plus identifier la personne. On
-- remplace donc les données identifiantes par une référence d'anonymisation,
-- et les montants, dates et liens restent intacts pour la comptabilité et la
-- traçabilité produit (rappel de lot).
--
-- Ce qui n'est jamais touché :
--   * `journal_audit` — le réécrire reviendrait à effacer l'historique d'accès
--     aux données qu'on prétend protéger ;
--   * les montants, dates, lots, quantités — non identifiants.

-- ------------------------------------------------------------ journal des demandes
-- Toute demande doit être traçable : qui a demandé quoi, quand, et pourquoi.
-- Sans ce registre, l'entreprise ne peut pas répondre à un contrôle.
create table if not exists public.demandes_donnees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  reference text not null,
  type text not null check (type in ('export', 'anonymisation')),
  motif text not null check (length(btrim(motif)) between 3 and 500),
  -- Portée : une commande précise ou l'ensemble des données d'une personne.
  cible text,
  lignes_affectees integer not null default 0,
  acteur_id uuid,
  cree_le timestamptz not null default now(),
  unique (client_id, reference)
);

alter table public.demandes_donnees enable row level security;

drop policy if exists demandes_donnees_lecture on public.demandes_donnees;
create policy demandes_donnees_lecture on public.demandes_donnees
  for select using (client_id = public.patisgest_mon_client()
                    and public.patisgest_mon_role() = 'proprietaire');

revoke all on public.demandes_donnees from public, anon, authenticated;
grant select on public.demandes_donnees to authenticated;

-- ------------------------------------------------------------ export (droit d'accès)
create or replace function public.exporter_donnees_personnelles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_out jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  -- Export complet de l'établissement : réservé au propriétaire. Un vendeur
  -- n'a pas à extraire la base clients pour l'emporter ailleurs.
  if v_role <> 'proprietaire' then
    raise exception 'Export reserve au proprietaire.';
  end if;

  -- Ne sortent que les champs identifiants. Les montants, statuts et dates
  -- restent dans l'export : sans eux, la personne ne peut pas vérifier que le
  -- document est bien le sien.
  select jsonb_build_object(
    'genere_le', now(),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero,
        'client_nom', c.client_nom,
        'telephone', c.telephone,
        'date_evenement', c.date_event,
        'parts', c.nb_parts,
        'montant_ht', c.prix_ht,
        'statut', c.statut
      ) order by c.date_event desc)
        from public.cakes c where c.client_id = v_client
    ), '[]'::jsonb),
    'comptes_utilisateurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email,
        'role', u.role,
        'cree_le', u.created_at
      ) order by u.created_at)
        from public.utilisateurs u where u.client_id = v_client
    ), '[]'::jsonb)
  ) into v_out;

  -- La référence doit être unique par tenant. `now()` est figé pour toute la
  -- transaction : deux exports dans la même transaction (ou la même seconde)
  -- produisaient la même référence et le second échouait sur la contrainte
  -- unique — un export refusé pour une raison qui n'a rien à voir avec le droit
  -- d'accès demandé. On ajoute un suffixe tiré au hasard, et un `on conflict`
  -- en filet de sécurité : perdre une ligne de registre n'est pas grave,
  -- refuser un export à une personne qui exerce son droit l'est.
  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client,
          'EXP-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          'export',
          'Export des donnees personnelles de l etablissement', 'etablissement',
          jsonb_array_length(coalesce(v_out->'commandes', '[]'::jsonb)), v_auth)
  on conflict (client_id, reference) do nothing;

  return v_out;
end;
$fn$;

revoke all on function public.exporter_donnees_personnelles() from public, anon;
grant execute on function public.exporter_donnees_personnelles() to authenticated;

-- ------------------------------------------------------------ anonymisation
create or replace function public.anonymiser_client(
  p_numero_commande text,
  p_motif text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_motif text := btrim(coalesce(p_motif, ''));
  v_ref text := btrim(coalesce(p_reference, ''));
  v_numero text := btrim(coalesce(p_numero_commande, ''));
  v_touche integer := 0;
  v_n integer := 0;
  v_demande uuid;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Anonymisation reservee au proprietaire.';
  end if;
  if length(v_motif) < 3 then
    raise exception 'Motif obligatoire.';
  end if;
  if length(v_ref) < 3 then
    raise exception 'Reference de la demande obligatoire.';
  end if;
  if v_numero = '' then
    raise exception 'Commande a anonymiser obligatoire.';
  end if;

  -- Le remplacement garde une trace lisible : on doit pouvoir constater
  -- l'anonymisation sans pouvoir remonter à la personne.
  update public.cakes c
     set client_nom = 'Client anonymise (' || v_ref || ')',
         telephone = null
   where c.client_id = v_client and c.numero = v_numero;
  get diagnostics v_n = row_count;
  v_touche := v_touche + v_n;
  if v_n = 0 then
    raise exception 'Commande introuvable.';
  end if;

  -- Les tickets de vente ne portent pas de nom client : le ticket est anonyme
  -- par construction (`ventes.lignes` ne contient que des articles). Il n'y a
  -- donc qu'une seule table à nettoyer pour une commande — `cakes`, qui sert
  -- à la fois le comptoir et les commandes venues de la vitrine (migration 27).

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, v_numero, v_touche, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  -- Trace explicite. Les déclencheurs de la migration 40 journalisent les
  -- écritures ligne à ligne, mais pas l'INTENTION : « qui a demandé
  -- l'effacement, pour quel motif, sous quelle référence ». Une anonymisation
  -- sans cette trace est indistinguable, en audit, d'une perte de données.
  --
  -- Le bloc `execute` est utilisé volontairement : si la migration 40 n'est pas
  -- appliquée, `patisgest_journaliser` n'existe pas et un appel direct ferait
  -- échouer la COMPILATION de cette fonction, pas seulement l'exécution. Un
  -- `execute` diffère la résolution et laisse l'anonymisation fonctionner.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION');
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_touche,
    'commandes_conservees', (select count(*) from public.cakes where client_id = v_client),
    'ventes_conservees', (select count(*) from public.ventes where client_id = v_client)
  );
end;
$fn$;

revoke all on function public.anonymiser_client(text, text, text) from public, anon;
grant execute on function public.anonymiser_client(text, text, text) to authenticated;

-- ------------------------------------------------------------ audit
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_demandes_donnees on public.demandes_donnees;
    create trigger audit_demandes_donnees
      after insert or update or delete on public.demandes_donnees
      for each row execute function public.patisgest_audit_ligne();
  end if;
end
$audit$;

insert into public.app_schema_version (id, version) values (1, 42)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 43-unicite-lot.sql =====
-- Migration 43 — RI-04 : identité du lot, et non « unicité du numéro ».
--
-- La question ouverte était : faut-il `unique (client_id, numero)` sur `lots` ?
--
-- Réponse : non, et cette contrainte casserait une fonctionnalité livrée.
-- `transferer_article` (migration 08) crée volontairement un lot miroir sur le
-- site d'arrivée avec le MÊME numéro : un transfert déplace le lot, il n'en
-- crée pas un nouveau. Appliquer `(client_id, numero)` ferait échouer tout
-- transfert. C'est l'exigence MOD-11 (traçabilité amont, rappel produit) qui
-- impose de conserver le numéro d'origine.
--
-- L'identité réelle d'un lot est :
--     (client_id, article_id, site_id, numero)
--
--   * client_id  : étanchéité entre établissements (RI-01) ;
--   * article_id : deux fournisseurs peuvent facturer le même numéro ;
--   * site_id    : c'est ce qui distingue le lot d'origine de son miroir ;
--   * numero     : numéro fournisseur, conservé tel quel.
--
-- Ce que la contrainte interdit vraiment — et c'est son but : réceptionner
-- DEUX FOIS le même lot au même endroit, l'erreur qui double le stock en
-- silence quand deux personnes saisissent le même bon de livraison.
--
-- Pourquoi une clé PARTIELLE et pas une contrainte pleine : un miroir de
-- transfert peut être re-transféré puis revenir. Deux lignes du même numéro
-- sur le même site avec des quantités différentes sont alors légitimes.
-- Les réceptions directes écrivent `ref` = numéro de bon (ou null) ;
-- `transferer_article` écrit `ref` = 'TR-XXXXXXXX'. Le schéma distingue donc
-- déjà les deux cas sans colonne supplémentaire.
--
-- Additive only. Ne modifie aucune ligne (vérifié : aucun doublon existant).

-- ---------------------------------------------------------------- garde
do $garde$
declare
  v_doublon bigint;
begin
  if to_regclass('public.lots') is null then
    raise exception 'Migration 43 : table lots absente (migration 03 requise).'
      using errcode = 'P0001';
  end if;

  -- On refuse de poser une contrainte sur une base déjà incohérente : mieux
  -- vaut s'arrêter avec un message lisible que d'échouer sur un 23505 obscur
  -- en pleine migration.
  select count(*) into v_doublon from (
    select 1
      from public.lots
     where ref is null or ref not like 'TR-%'
     group by client_id, article_id, site_id, numero
    having count(*) > 1
  ) d;
  if v_doublon > 0 then
    raise exception 'Migration 43 refusee : % doublon(s) de lot deja presents. Corriger les donnees avant de contraindre.', v_doublon
      using errcode = 'P0001';
  end if;
end
$garde$;

-- ---------------------------------------------------------------- contrainte
-- Index unique PARTIEL : ne couvre que les réceptions directes.
create unique index if not exists lots_reception_unique
  on public.lots (client_id, article_id, site_id, numero)
  where ref is null or ref not like 'TR-%';

comment on index public.lots_reception_unique is
  'RI-04 : un lot reçu directement est unique par (client, article, site, numéro). Les miroirs de transfert (ref TR-*) en sont exemptés, sinon un aller-retour de marchandise serait refusé.';

-- Index de service : retrouver un lot par son numéro est l'opération la plus
-- fréquente d'un rappel produit (MOD-11). Sans lui, un rappel scanne la table.
create index if not exists lots_numero_idx
  on public.lots (client_id, numero);

-- ---------------------------------------------------------------- version
insert into public.app_schema_version (id, version) values (1, 43)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 44-retrait-mode-carte.sql =====
-- =====================================================================
-- 44 — Retrait du mode de règlement « carte » (CIB / Edahabia).
--
-- Décision produit : la caisse ne propose plus que espèces et chèque/virement.
-- Effets :
--   1. Les ventes enregistrées avec mode « carte » passent à NULL
--      (mode non précisé) : aucune vente n'est supprimée ni recalculée.
--   2. La contrainte ventes_mode_paiement_valid n'accepte plus « carte ».
--   3. vendre_panier refuse « carte ». Son corps installé (21 + 32) est
--      patché avec des gardes strictes : si le corps diffère, la migration
--      s'arrête au lieu de deviner.
-- Compatible : l'application n'envoie plus « carte » ; les anciens clients
-- qui en enverraient recevraient « Mode de reglement invalide. ».
-- Non appliquée au pilote : exige une validation humaine explicite.
-- =====================================================================

update public.ventes
   set mode_paiement = null
 where mode_paiement = 'carte';

alter table public.ventes drop constraint if exists ventes_mode_paiement_valid;
alter table public.ventes
  add constraint ventes_mode_paiement_valid
  check (mode_paiement is null or mode_paiement in ('especes', 'cheque_virement'));

do $migration$
declare
  definition text;
  corrigee text;
  ancien constant text := 'if v_mode not in (''especes'', ''carte'', ''cheque_virement'') then';
  nouveau constant text := 'if v_mode not in (''especes'', ''cheque_virement'') then';
  n integer;
begin
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
  if definition is null then
    raise exception 'RPC vendre_panier absente : appliquer 21 à 32 avant 40.';
  end if;

  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà corrigée
  else
    raise exception 'Corps de vendre_panier inattendu (garde carte introuvable ou ambiguë) : réconciliation manuelle requise.';
  end if;
end
$migration$;

-- ===== 45-recettes-libres.sql =====
-- Migration 44 — Recettes libres (saisie rapide DA multi-appareils)
-- Additive only. Idempotente et isolée par client_id.

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

-- ===== 46-credits-clients.sql =====
-- Migration 45 — Carnet de crédits clients, cafés & entreprises
-- Additive only. Idempotente et isolée par client_id.

create table if not exists public.credits_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom_debiteur text not null check (char_length(trim(nom_debiteur)) between 1 and 140),
  telephone text not null default '' check (char_length(telephone) <= 40),
  type_compte text not null default 'particulier' check (type_compte in ('particulier', 'cafe_entreprise')),
  montant_total_da numeric(12,2) not null check (montant_total_da > 0 and montant_total_da <= 100000000),
  montant_regle_da numeric(12,2) not null default 0 check (montant_regle_da >= 0 and montant_regle_da <= 100000000),
  date_echeance date null,
  note text not null default '' check (char_length(note) <= 400),
  vente_id uuid null references public.ventes(id) on delete set null,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'solde', 'annule')),
  reglements jsonb not null default '[]'::jsonb check (jsonb_typeof(reglements) = 'array'),
  cree_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credits_regle_lte_total check (montant_regle_da <= montant_total_da)
);

create index if not exists credits_clients_client_statut_idx
  on public.credits_clients (client_id, statut, created_at desc);

alter table public.credits_clients enable row level security;

revoke all on public.credits_clients from public, anon;
grant select, insert, update, delete on public.credits_clients to authenticated, service_role;

drop policy if exists credits_clients_select on public.credits_clients;
create policy credits_clients_select on public.credits_clients
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

drop policy if exists credits_clients_insert on public.credits_clients;
create policy credits_clients_insert on public.credits_clients
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur', 'labo')
  );

drop policy if exists credits_clients_update on public.credits_clients;
create policy credits_clients_update on public.credits_clients
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_delete on public.credits_clients;
create policy credits_clients_delete on public.credits_clients
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

create or replace function public.enregistrer_reglement_credit(
  p_credit_id uuid,
  p_montant_da numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_row public.credits_clients%rowtype;
  v_new_regle numeric(12,2);
  v_new_statut text;
  v_entry jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then raise exception 'Role non autorise.'; end if;
  if p_montant_da is null or p_montant_da <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_row
    from public.credits_clients
   where id = p_credit_id and client_id = v_client
   for update;

  if not found then raise exception 'Credit introuvable.'; end if;
  if v_row.statut <> 'ouvert' then raise exception 'Ce credit est deja solde ou annule.'; end if;

  v_new_regle := round((v_row.montant_regle_da + p_montant_da)::numeric, 2);
  if v_new_regle > v_row.montant_total_da then
    raise exception 'Le montant depasse le reste a payer.';
  end if;

  v_new_statut := case when v_new_regle >= v_row.montant_total_da then 'solde' else 'ouvert' end;
  v_entry := jsonb_build_object(
    'montant_da', round(p_montant_da::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 200),
    'at', now(),
    'par', v_auth
  );

  update public.credits_clients
     set montant_regle_da = v_new_regle,
         statut = v_new_statut,
         reglements = reglements || jsonb_build_array(v_entry),
         updated_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'montant_regle_da', v_new_regle,
    'reste_da', round((v_row.montant_total_da - v_new_regle)::numeric, 2),
    'statut', v_new_statut
  );
end;
$$;

revoke execute on function public.enregistrer_reglement_credit(uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_reglement_credit(uuid, numeric, text) to authenticated, service_role;

-- ===== 47-onboarding-pack-dz.sql =====
-- Migration 46 — Validation rapide du tiroir depuis le Dashboard + Pack Pâtisserie DZ
-- Additive only. Idempotente.

create or replace function public.valider_tiroir_jour(
  p_date date,
  p_site_id uuid,
  p_fond_initial numeric,
  p_especes_comptees numeric,
  p_attendu numeric default 0,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_existing int;
  v_revision int;
  v_bilan jsonb;
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then raise exception 'Role non autorise.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if p_fond_initial is null or p_fond_initial < 0 then raise exception 'Fond initial invalide.'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Montant compte invalide.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site hors perimetre.'; end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  v_revision := v_existing + 1;

  v_bilan := jsonb_build_object(
    'fond_ouverture', round(p_fond_initial::numeric, 2),
    'especes_attendues', round(coalesce(p_attendu, 0)::numeric, 2),
    'especes_comptees', round(p_especes_comptees::numeric, 2),
    'ecart', round((p_especes_comptees - (p_fond_initial + coalesce(p_attendu, 0)))::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 250),
    'source', 'dashboard_rapide',
    'valide_at', now()
  );

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, caisse_bilan)
  values (v_client, p_date, p_site_id, v_revision, '[]'::jsonb, v_bilan)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_bilan);
end;
$$;

revoke execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

-- ===== 48-notifications-patron.sql =====
-- Migration 47 — Notifications & Alertes Prix au Propriétaire (B.6)
-- Quand un employé saisit le prix d'un nouveau gâteau, tarte, cake ou recette,
-- le patron reçoit immédiatement une alerte (critique si le prix est trop bas).

create table if not exists public.notifications_patron (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('nouveau_prix_employe', 'prix_trop_bas')),
  severite text not null default 'warning' check (severite in ('info', 'warning', 'critical')),
  cible_type text not null check (cible_type in ('recette_libre', 'article', 'cake', 'nouveau_produit')),
  cible_id text not null default '',
  nom_produit text not null check (char_length(trim(nom_produit)) between 1 and 160),
  categorie text not null default 'gateau',
  prix_saisi_da numeric(12,2) not null check (prix_saisi_da >= 0 and prix_saisi_da <= 100000000),
  cout_estime_da numeric(12,2) null,
  prix_conseille_da numeric(12,2) null,
  auteur_id uuid null references auth.users(id) on delete set null,
  auteur_nom text not null default 'Employé',
  message text not null,
  traite_statut text not null default 'en_attente' check (traite_statut in ('en_attente', 'approuve', 'corrige', 'bloque')),
  prix_final_da numeric(12,2) null,
  traite_par uuid null references auth.users(id) on delete set null,
  traite_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_patron_client_statut_idx
  on public.notifications_patron (client_id, traite_statut, created_at desc);

alter table public.notifications_patron enable row level security;

revoke all on public.notifications_patron from public, anon;
grant select, insert, update, delete on public.notifications_patron to authenticated, service_role;

drop policy if exists notifications_patron_select on public.notifications_patron;
create policy notifications_patron_select on public.notifications_patron
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or auteur_id = auth.uid()
    )
  );

drop policy if exists notifications_patron_insert on public.notifications_patron;
create policy notifications_patron_insert on public.notifications_patron
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo', 'vendeur')
  );

drop policy if exists notifications_patron_update on public.notifications_patron;
create policy notifications_patron_update on public.notifications_patron
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

create or replace function public.traiter_alerte_prix_patron(
  p_alerte_id uuid,
  p_decision text,
  p_nouveau_prix numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_row public.notifications_patron%rowtype;
  v_prix_final numeric(12,2);
  v_uuid uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Reserve au proprietaire.'; end if;
  if p_decision not in ('approuve', 'corrige', 'bloque') then
    raise exception 'Decision invalide.';
  end if;

  select * into v_row
    from public.notifications_patron
   where id = p_alerte_id and client_id = v_client
   for update;

  if not found then raise exception 'Notification introuvable.'; end if;

  if p_decision = 'corrige' then
    if p_nouveau_prix is null or p_nouveau_prix <= 0 then
      raise exception 'Nouveau prix positif requis.';
    end if;
    v_prix_final := round(p_nouveau_prix::numeric, 2);
  elsif p_decision = 'approuve' then
    v_prix_final := v_row.prix_saisi_da;
  else
    v_prix_final := null;
  end if;

  update public.notifications_patron
     set traite_statut = p_decision,
         prix_final_da = v_prix_final,
         traite_par = v_auth,
         traite_at = now()
   where id = v_row.id;

  if v_row.cible_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := v_row.cible_id::uuid;
    if v_row.cible_type = 'recette_libre' and to_regclass('public.recettes_libres') is not null then
      update public.recettes_libres
         set prix_vente_da = coalesce(v_prix_final, prix_vente_da),
             statut_prix = case when p_decision = 'bloque' then 'bloque' else 'valide' end,
             updated_at = now()
       where id = v_uuid and client_id = v_client;
    elsif v_row.cible_type = 'article' then
      update public.articles
         set pv_ht = coalesce(v_prix_final, pv_ht)
       where id = v_uuid and client_id = v_client;
    end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'statut', p_decision, 'prix_final_da', v_prix_final);
end;
$$;

revoke execute on function public.traiter_alerte_prix_patron(uuid, text, numeric) from public, anon;
grant execute on function public.traiter_alerte_prix_patron(uuid, text, numeric) to authenticated, service_role;

-- ===== 49-wave3-wave4.sql =====
-- Migration 48 — Wave 3 & 4 : Photos produits (B.1) & justificatifs factures (B.4)
-- Additive only. Idempotente.

alter table public.articles
  add column if not exists photo_url text null;

alter table public.bons_commande
  add column if not exists facture_photo_url text null;

create or replace function public.sauver_photo_article(
  p_article_id uuid,
  p_photo_url text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then raise exception 'Role non autorise.'; end if;
  if p_photo_url is not null and length(p_photo_url) > 350000 then
    raise exception 'Photo trop volumineuse (compressez avant envoi).';
  end if;

  update public.articles
     set photo_url = nullif(trim(coalesce(p_photo_url, '')), '')
   where id = p_article_id and client_id = v_client;

  if not found then raise exception 'Article introuvable.'; end if;
  return jsonb_build_object('ok', true);
end;
$$;

revoke execute on function public.sauver_photo_article(uuid, text) from public, anon;
grant execute on function public.sauver_photo_article(uuid, text) to authenticated, service_role;

-- ===== 50-roles-permissions-vues.sql =====
-- Migration 50 — Activation et verrouillage strict des 3 rôles (propriétaire, labo, vendeur)
-- Promut les 9 vues sans colonnes financières dans le chemin déployable et applique
-- les 5 règles métier validées :
--   1. Vendeur sur Commandes & Gâteaux : encaisser/livrer uniquement (pas de création/édition de devis chiffrés).
--   2. Vendeur sur Carnet de Crédits : ajouter & encaisser ; annulation/modification/suppression réservées au propriétaire.
--   3. Vendeur sur Clôture : comptage tiroir en mode aveugle (sans écart ni attendu dans la réponse).
--   4. Labo : proposition de prix vers notifications_patron (articles créés à pv_ht=0 jusqu'à validation patron) ;
--      aucun accès caisse, clôture, crédits, avoirs, import Z, paramètres de coûts ou suppression de recettes.
--   5. Révocation systématique PUBLIC/anon sur toutes les fonctions et vues.
-- Idempotente (compatible base fraîche et base pilote déjà partiellement patchée).

-- ---------------------------------------------------------------------------
-- 1. Affectations de sites et gardes de périmètre
-- ---------------------------------------------------------------------------
create table if not exists public.equipe_sites (
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  primary key (utilisateur_id, site_id)
);
alter table public.equipe_sites enable row level security;
revoke all on public.equipe_sites from public, anon, authenticated;

create or replace function public.patisgest_site_autorise(p_site uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1
      from public.utilisateurs u
      join public.sites s on s.id = p_site and s.client_id = u.client_id
     where u.auth_user_id = auth.uid()
       and (
         u.role = 'proprietaire'
         or (
           u.role in ('labo', 'vendeur')
           and (u.role <> 'vendeur' or s.type = 'boutique')
           and exists(
             select 1 from public.equipe_sites a
              where a.utilisateur_id = u.id and a.site_id = s.id
           )
         )
       )
  )
$$;
revoke all on function public.patisgest_site_autorise(uuid) from public, anon;
grant execute on function public.patisgest_site_autorise(uuid) to authenticated, service_role;

create or replace function public.patisgest_tous_sites_autorises()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when u.role = 'proprietaire' then true
      else exists(select 1 from public.sites s where s.client_id = u.client_id)
       and not exists(
         select 1 from public.sites s
          where s.client_id = u.client_id and not public.patisgest_site_autorise(s.id)
       )
    end
    from public.utilisateurs u
    where u.auth_user_id = auth.uid()
    limit 1
  ), false)
$$;
revoke all on function public.patisgest_tous_sites_autorises() from public, anon;
grant execute on function public.patisgest_tous_sites_autorises() to authenticated, service_role;

create or replace function public.patisgest_exiger_tous_sites()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.patisgest_tous_sites_autorises() then
    raise exception 'Acces indisponible sans attribution de tous les sites.' using errcode = '42501';
  end if;
end
$$;
revoke all on function public.patisgest_exiger_tous_sites() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Policies restrictives & 9 vues sans colonnes financières (labo + vendeur)
-- ---------------------------------------------------------------------------
do $$ declare t text; begin
  foreach t in array array[
    'articles','lots','mouvements','recette_versions','ordres_fabrication',
    'cakes','ventes','clotures','transferts','bons_commande',
    'historique_prix','parametres_couts','z_imports'
  ] loop
    execute format('drop policy if exists labo_sans_finance on public.%I', t);
    execute format(
      'create policy labo_sans_finance on public.%I as restrictive for select to authenticated using (public.patisgest_mon_role() <> %L)',
      t, 'labo'
    );
  end loop;
end $$;

drop policy if exists labo_sans_parametres_couts_insert on public.parametres_couts;
create policy labo_sans_parametres_couts_insert on public.parametres_couts
  as restrictive for insert to authenticated
  with check (public.patisgest_mon_role() = 'proprietaire');

drop policy if exists labo_sans_parametres_couts_update on public.parametres_couts;
create policy labo_sans_parametres_couts_update on public.parametres_couts
  as restrictive for update to authenticated
  using (public.patisgest_mon_role() = 'proprietaire')
  with check (public.patisgest_mon_role() = 'proprietaire');

drop policy if exists vendeur_sans_lots_bruts on public.lots;
create policy vendeur_sans_lots_bruts on public.lots
  as restrictive for select to authenticated
  using (public.patisgest_mon_role() <> 'vendeur');

drop policy if exists vendeur_sans_mouvements_bruts on public.mouvements;
create policy vendeur_sans_mouvements_bruts on public.mouvements
  as restrictive for select to authenticated
  using (public.patisgest_mon_role() <> 'vendeur');

drop policy if exists vendeur_sans_of_bruts on public.ordres_fabrication;
create policy vendeur_sans_of_bruts on public.ordres_fabrication
  as restrictive for select to authenticated
  using (public.patisgest_mon_role() <> 'vendeur');

create or replace view public.labo_articles with (security_barrier = true) as
  select id, client_id, code, nom, niveau, unite, seuil, allergenes, traces, created_at
    from public.articles
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and (
       public.patisgest_module_autorise('stocks')
       or public.patisgest_module_autorise('recettes')
       or public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('transferts')
       or public.patisgest_module_autorise('tracabilite')
       or public.patisgest_module_autorise('achats')
       or public.patisgest_module_autorise('cake-design')
       or public.patisgest_module_autorise('qualite')
     );

create or replace view public.labo_lots with (security_barrier = true) as
  select id, client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest,
         dlc, date_reception, ref, congele, bloque, created_at, bloque_motif
    from public.lots
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(site_id)
     and (
       public.patisgest_module_autorise('stocks')
       or public.patisgest_module_autorise('recettes')
       or public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('transferts')
       or public.patisgest_module_autorise('tracabilite')
       or public.patisgest_module_autorise('achats')
       or public.patisgest_module_autorise('cake-design')
       or public.patisgest_module_autorise('qualite')
     );

create or replace view public.labo_recette_versions with (security_barrier = true) as
  select v.id, v.client_id, v.famille_id, v.version, v.rendement_qte, v.rendement_unite,
         v.cuisson_perte_pct, v.mo_min, v.active, v.created_at,
         coalesce((
           select jsonb_agg(
             jsonb_strip_nulls(jsonb_build_object(
               'articleId', case when jsonb_typeof(x.val->'articleId') = 'string' then x.val->>'articleId' end,
               'code', case when jsonb_typeof(x.val->'code') = 'string' and length(x.val->>'code') <= 40 then x.val->>'code' end,
               'subVersionId', case when jsonb_typeof(x.val->'subVersionId') = 'string' then x.val->>'subVersionId' end,
               'q', case when jsonb_typeof(x.val->'q') = 'number' then x.val->'q' end,
               'u', case when jsonb_typeof(x.val->'u') = 'string' then x.val->>'u' end,
               'parage', case when jsonb_typeof(x.val->'parage') = 'number' then x.val->'parage' end
             ))
             order by x.pos
           )
           from jsonb_array_elements(case when jsonb_typeof(v.ingredients) = 'array' then v.ingredients else '[]'::jsonb end) with ordinality x(val, pos)
         ), '[]'::jsonb) as ingredients
    from public.recette_versions v
   where v.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and (
       public.patisgest_module_autorise('recettes')
       or public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
     );

create or replace view public.labo_ventes_quantites with (security_barrier = true) as
  select v.id, v.client_id, v.site_id, v.date_vente, v.source,
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'articleId', case when jsonb_typeof(x.val->'articleId') = 'string' and x.val->>'articleId' ~* '^[0-9a-f-]{36}$' then x.val->>'articleId' end,
               'qty', case when jsonb_typeof(x.val->'qty') = 'number' then x.val->'qty' end
             )
             order by x.pos
           )
           from jsonb_array_elements(case when jsonb_typeof(v.lignes) = 'array' then v.lignes else '[]'::jsonb end) with ordinality x(val, pos)
         ), '[]'::jsonb) as lignes
    from public.ventes v
   where v.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(v.site_id)
     and public.patisgest_module_autorise('planning');

create or replace view public.labo_ordres_fabrication with (security_barrier = true) as
  select id, client_id, famille_id, version_id, site_id, numero, qte_prevue, qte_realisee,
         date_prevue, date_lancement, statut, client_ref,
         jsonb_build_object('recette', snapshot->>'recette', 'version', snapshot->>'version', 'devis', snapshot->>'devis') as snapshot,
         created_at
    from public.ordres_fabrication
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(site_id)
     and (public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning'));

create or replace view public.labo_cakes with (security_barrier = true) as
  select id, client_id, numero, client_nom, telephone, date_event, nb_parts, statut,
         cgv, version_id, site_id, qte_fabrication, of_id, created_at
    from public.cakes
   where client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_site_autorise(site_id)
     and (public.patisgest_module_autorise('cake-design') or public.patisgest_module_autorise('planning'));

create or replace view public.labo_bons_commande with (security_barrier = true) as
  select b.id, b.client_id, b.fournisseur_id, b.numero, b.date_bc, b.statut, b.created_at,
         coalesce((
           select jsonb_agg(
             jsonb_build_object(
               'articleId', case when jsonb_typeof(l.v->'articleId') = 'string' and l.v->>'articleId' ~* '^[0-9a-f-]{36}$' then l.v->>'articleId' else null end,
               'qte', case when jsonb_typeof(l.v->'qte') = 'number' then l.v->'qte' else null end,
               'recu', case when jsonb_typeof(l.v->'recu') = 'number' then l.v->'recu' else null end
             )
             order by l.ord
           )
           from jsonb_array_elements(case when jsonb_typeof(b.lignes) = 'array' then b.lignes else '[]'::jsonb end) with ordinality as l(v, ord)
         ), '[]'::jsonb) as lignes
    from public.bons_commande b
   where b.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'labo'
     and public.patisgest_tous_sites_autorises()
     and public.patisgest_module_autorise('achats');

create or replace view public.vendeur_lots with (security_barrier = true) as
  select l.id, l.client_id, l.article_id, l.site_id, l.numero, l.qte_init, l.qte_rest,
         l.dlc, l.date_reception, l.ref, l.congele, l.bloque, l.bloque_motif, l.created_at
    from public.lots l
   where l.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'vendeur'
     and public.patisgest_site_autorise(l.site_id)
     and (
       public.patisgest_module_autorise('stocks')
       or public.patisgest_module_autorise('caisse')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('qualite')
       or public.patisgest_module_autorise('tracabilite')
     );

create or replace view public.vendeur_ordres_fabrication with (security_barrier = true) as
  select o.id, o.client_id, o.site_id, o.numero, o.qte_prevue, o.qte_realisee,
         o.date_prevue, o.date_lancement, o.statut, o.created_at,
         jsonb_strip_nulls(jsonb_build_object(
           'recette', case when jsonb_typeof(o.snapshot->'recette') = 'string' then o.snapshot->'recette' end,
           'version', case when jsonb_typeof(o.snapshot->'version') = 'number' then o.snapshot->'version' end,
           'devis', case when jsonb_typeof(o.snapshot->'devis') = 'string' then o.snapshot->'devis' end
         )) as snapshot
    from public.ordres_fabrication o
   where o.client_id = public.patisgest_mon_client()
     and public.patisgest_mon_role() = 'vendeur'
     and public.patisgest_site_autorise(o.site_id)
     and (
       public.patisgest_module_autorise('production')
       or public.patisgest_module_autorise('planning')
       or public.patisgest_module_autorise('cake-design')
     );

revoke all on public.labo_articles, public.labo_lots, public.labo_recette_versions,
  public.labo_ordres_fabrication, public.labo_cakes, public.labo_bons_commande,
  public.labo_ventes_quantites, public.vendeur_lots, public.vendeur_ordres_fabrication
  from public, anon;
grant select on public.labo_articles, public.labo_lots, public.labo_recette_versions,
  public.labo_ordres_fabrication, public.labo_cakes, public.labo_bons_commande,
  public.labo_ventes_quantites, public.vendeur_lots, public.vendeur_ordres_fabrication
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Règle 4 (Option B) : Labo ne peut pas fixer de prix de vente sur articles
--    ni supprimer de recettes libres ; validation patron met à jour l'article.
-- ---------------------------------------------------------------------------
create or replace function public.patisgest_articles_labo_sans_prix()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.patisgest_mon_role() = 'labo' then
    new.pv_ht := 0;
    new.tva := 0;
  end if;
  return new;
end
$$;
revoke all on function public.patisgest_articles_labo_sans_prix() from public, anon, authenticated;

drop trigger if exists trg_articles_labo_sans_prix on public.articles;
create trigger trg_articles_labo_sans_prix
  before insert or update on public.articles
  for each row execute function public.patisgest_articles_labo_sans_prix();

drop policy if exists recettes_libres_delete on public.recettes_libres;
create policy recettes_libres_delete on public.recettes_libres
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

drop policy if exists recettes_libres_insert on public.recettes_libres;
create policy recettes_libres_insert on public.recettes_libres
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or (public.patisgest_mon_role() = 'labo' and statut_prix = 'a_verifier_patron')
    )
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
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or (public.patisgest_mon_role() = 'labo' and statut_prix = 'a_verifier_patron')
    )
  );

create or replace function public.traiter_alerte_prix_patron(
  p_alerte_id uuid,
  p_decision text,
  p_nouveau_prix numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_row public.notifications_patron%rowtype;
  v_prix_final numeric(12,2);
  v_uuid uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Reserve au proprietaire.'; end if;
  if p_decision not in ('approuve', 'corrige', 'bloque') then
    raise exception 'Decision invalide.';
  end if;

  select * into v_row
    from public.notifications_patron
   where id = p_alerte_id and client_id = v_client
   for update;
  if not found then raise exception 'Notification introuvable.'; end if;

  if p_decision = 'corrige' then
    if p_nouveau_prix is null or p_nouveau_prix <= 0 then
      raise exception 'Nouveau prix positif requis.';
    end if;
    v_prix_final := round(p_nouveau_prix::numeric, 2);
  elsif p_decision = 'approuve' then
    v_prix_final := v_row.prix_saisi_da;
  else
    v_prix_final := null;
  end if;

  update public.notifications_patron
     set traite_statut = p_decision,
         prix_final_da = v_prix_final,
         traite_par = v_auth,
         traite_at = now()
   where id = v_row.id;

  if v_row.cible_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := v_row.cible_id::uuid;
    if v_row.cible_type = 'recette_libre' and to_regclass('public.recettes_libres') is not null then
      update public.recettes_libres
         set prix_vente_da = coalesce(v_prix_final, prix_vente_da),
             statut_prix = case when p_decision = 'bloque' then 'bloque' else 'valide' end,
             updated_at = now()
       where id = v_uuid and client_id = v_client;
    elsif v_row.cible_type in ('article', 'nouveau_produit') then
      if p_decision = 'bloque' then
        update public.articles set pv_ht = 0 where id = v_uuid and client_id = v_client;
      elsif v_prix_final is not null and v_prix_final > 0 then
        update public.articles
           set pv_ht = round(v_prix_final / (1 + coalesce(tva, 0) / 100.0), 2)
         where id = v_uuid and client_id = v_client;
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'statut', p_decision, 'prix_final_da', v_prix_final);
end;
$$;
revoke all on function public.traiter_alerte_prix_patron(uuid, text, numeric) from public, anon;
grant execute on function public.traiter_alerte_prix_patron(uuid, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Règle 2 : Carnet de crédits (Vendeur ajoute & encaisse ; Patron seul modifie/annule/supprime)
-- ---------------------------------------------------------------------------
drop policy if exists credits_clients_select on public.credits_clients;
create policy credits_clients_select on public.credits_clients
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_insert on public.credits_clients;
create policy credits_clients_insert on public.credits_clients
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_update on public.credits_clients;
create policy credits_clients_update on public.credits_clients
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

drop policy if exists credits_clients_delete on public.credits_clients;
create policy credits_clients_delete on public.credits_clients
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

-- ---------------------------------------------------------------------------
-- 5. Règle 3 : Clôture tiroir aveugle pour le vendeur, bloquée pour le labo
-- ---------------------------------------------------------------------------
create or replace function public.valider_tiroir_jour(
  p_date date,
  p_site_id uuid,
  p_fond_initial numeric,
  p_especes_comptees numeric,
  p_attendu numeric default 0,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_existing int;
  v_revision int;
  v_attendu_effectif numeric;
  v_bilan jsonb;
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Comptage tiroir reserve au comptoir.' using errcode = '42501';
  end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if p_fond_initial is null or p_fond_initial < 0 then raise exception 'Fond initial invalide.'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Montant compte invalide.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site hors perimetre.'; end if;
  if not public.patisgest_site_autorise(p_site_id) then
    raise exception 'Site non autorise.' using errcode = '42501';
  end if;

  if v_role = 'vendeur' then
    select coalesce(sum(v.total_ttc), 0) into v_attendu_effectif
      from public.ventes v
     where v.client_id = v_client
       and v.site_id = p_site_id
       and v.date_vente = p_date
       and coalesce(v.mode_paiement, 'especes') = 'especes';
  else
    v_attendu_effectif := coalesce(p_attendu, 0);
  end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  v_revision := v_existing + 1;

  v_bilan := jsonb_build_object(
    'fond_ouverture', round(p_fond_initial::numeric, 2),
    'especes_attendues', round(v_attendu_effectif::numeric, 2),
    'especes_comptees', round(p_especes_comptees::numeric, 2),
    'ecart', round((p_especes_comptees - (p_fond_initial + v_attendu_effectif))::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 250),
    'source', case when v_role = 'vendeur' then 'vendeur_aveugle' else 'dashboard_rapide' end,
    'valide_at', now()
  );

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, caisse_bilan)
  values (v_client, p_date, p_site_id, v_revision, '[]'::jsonb, v_bilan)
  returning id into v_id;

  if v_role = 'vendeur' then
    return jsonb_build_object('id', v_id, 'revision', v_revision, 'blind', true);
  end if;
  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_bilan);
end;
$$;
revoke all on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. Règles 1 & 4 sur les RPC SECURITY DEFINER (cakes, caisse, clôture, avoirs)
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
  def text;
  injected text;
begin
  -- 6a. creer_cake & editer_cake : seul le propriétaire fixe ou modifie le prix d'un devis.
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('creer_cake', 'editer_cake')
       and p.prosecdef
  loop
    def := f.src;
    if def not like '%Creation reservee au proprietaire%' then
      injected := regexp_replace(
        def,
        E'\\mbegin\\M',
        'begin if public.patisgest_mon_role() <> ''proprietaire'' then raise exception ''Creation reservee au proprietaire.'' using errcode = ''42501''; end if;',
        'i'
      );
      if injected = def then raise exception 'Garde impossible sur %', f.proname; end if;
      execute injected;
    end if;
  end loop;

  -- 6b. evoluer_cake : vendeur = payer/confirme/livre uniquement ; labo = produit uniquement.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = 'patisgest_evoluer_cake_interne'
  ) then
    alter function public.evoluer_cake(uuid, text, numeric) rename to patisgest_evoluer_cake_interne;
    revoke all on function public.patisgest_evoluer_cake_interne(uuid, text, numeric) from public, anon, authenticated;
  end if;

  -- 6c. vendre_article, vendre_panier, importer_z, enregistrer_avoir : interdits au rôle labo.
  for f in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as src
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('vendre_article', 'vendre_panier', 'importer_z', 'enregistrer_avoir')
       and p.prosecdef
  loop
    def := f.src;
    if def not like '%Reserve au comptoir%' then
      injected := regexp_replace(
        def,
        E'\\mbegin\\M',
        'begin if public.patisgest_mon_role() = ''labo'' then raise exception ''Reserve au comptoir.'' using errcode = ''42501''; end if;',
        'i'
      );
      if injected = def then raise exception 'Garde impossible sur %', f.proname; end if;
      execute injected;
    end if;
  end loop;

  -- 6d. saisir_cloture (clôture financière globale) : réservée au propriétaire.
  select p.oid, pg_get_functiondef(p.oid) as src into f
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'saisir_cloture' and p.prosecdef
   limit 1;
  if found and f.src not like '%Reserve au proprietaire%' then
    injected := regexp_replace(
      f.src,
      E'\\mbegin\\M',
      'begin if public.patisgest_mon_role() <> ''proprietaire'' then raise exception ''Reserve au proprietaire.'' using errcode = ''42501''; end if;',
      'i'
    );
    if injected <> f.src then execute injected; end if;
  end if;

  -- 6e. terminer_of : masquer cout_unitaire et cout_estime pour le labo (si pas déjà encapsulé par 101).
  if to_regprocedure('public.patisgest_terminer_of_interne(uuid,numeric,text,date)') is null
     and to_regprocedure('public.terminer_of(uuid,numeric,text,date)') is not null then
    alter function public.terminer_of(uuid, numeric, text, date) rename to patisgest_terminer_of_interne;
    revoke all on function public.patisgest_terminer_of_interne(uuid, numeric, text, date) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.terminer_of(
  p_of_id uuid,
  p_qte numeric,
  p_numero_lot text,
  p_dlc date
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb;
begin
  r := public.patisgest_terminer_of_interne(p_of_id, p_qte, p_numero_lot, p_dlc);
  if public.patisgest_mon_role() = 'labo' then
    r := r - 'cout_unitaire' - 'cout_estime';
  end if;
  return r;
end
$$;
revoke all on function public.terminer_of(uuid, numeric, text, date) from public, anon;
grant execute on function public.terminer_of(uuid, numeric, text, date) to authenticated, service_role;

create or replace function public.evoluer_cake(
  p_id uuid,
  p_transition text,
  p_montant numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.patisgest_mon_role();
  r jsonb;
begin
  if v_role = 'labo' and p_transition <> 'produit' then
    raise exception 'Transition reservee au comptoir.' using errcode = '42501';
  end if;
  if v_role = 'vendeur' and p_transition not in ('payer', 'confirme', 'livre') then
    raise exception 'Transition reservee au proprietaire.' using errcode = '42501';
  end if;
  r := public.patisgest_evoluer_cake_interne(p_id, p_transition, p_montant);
  if v_role = 'labo' then
    r := r - 'paid' - 'balance';
  end if;
  return r;
end
$$;
revoke all on function public.evoluer_cake(uuid, text, numeric) from public, anon;
grant execute on function public.evoluer_cake(uuid, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. Version du schéma
-- ---------------------------------------------------------------------------
insert into public.app_schema_version (id, version) values (1, 50)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 51-essai-abonnement-connectivite.sql =====
-- Migration 51 — Mode d'essai (60 à 90 jours, défaut 90), verrouillage permanent,
-- espace Master, suivi de connectivité et alertes >1h (SMS / WhatsApp).
-- Additive only. Idempotente.

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

-- ===== 52-recettes-photos.sql =====
-- Migration 52 — Photo des recettes libres.
--
-- L'écran Recettes affiche une photo par recette (WebP compressé livré avec
-- l'application, ou photo prise au téléphone puis compressée dans le
-- navigateur). Additive only, idempotente, rejouable.

-- 1. Colonne photo : chemin livré (`/recettes/…`) ou data-URL JPEG bornée.
--    La borne de taille est volontairement basse (300 Ko) : une photo de
--    recette est lue à chaque affichage de l'écran Recettes, y compris en 3G.
alter table public.recettes_libres
  add column if not exists photo_url text;

do $$ begin
  alter table public.recettes_libres
    drop constraint if exists recettes_libres_photo_url_check;
  alter table public.recettes_libres
    add constraint recettes_libres_photo_url_check
    check (
      photo_url is null
      or char_length(photo_url) <= 300000
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.recettes_libres.photo_url is
  'Photo de la recette : chemin local /recettes/<slug>.webp ou data:image/jpeg;base64 borné. Validé côté serveur par sanitizeRecipePhoto.';

-- 2. Version de schéma (jamais abaissée).
do $$ begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 52 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

insert into public.app_schema_version (id, version) values (1, 52)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 53-caisse-ticket-scope.sql =====
-- =====================================================================
-- 53 — Caisse : portée du ticket d'idempotence (site, source, contenu)
--
-- PROBLÈME (mesuré sur le corps installé par 21→50) :
--   `vendre_panier` retrouve un ticket existant par
--       where client_id = v_client and ticket = v_ticket
--   sans `site_id` ni `source`, et rend `duplicate: true` avec les totaux de
--   la vente trouvée. Trois conséquences réelles :
--     1) un rejeu de ticket sur un AUTRE site rend la vente de l'autre site
--        (sale_id et totaux étrangers) et ne déduit aucun stock ici ;
--     2) un ticket déjà utilisé par un IMPORT Z (`source = 'z-import'`,
--        ticket « Z-<n°>-<jjmmaa>-<hash> ») est confirmé comme vente caisse
--        d'un autre site, ou comme celle d'un autre caissier ;
--     3) un panier rejoué avec un CONTENU différent (onglet figé) est
--        silencieusement avalé : la vraie vente n'est jamais enregistrée.
--
-- CORRECTIF : tout conflit de ticket qui n'est pas un rejeu STRICT
-- (même site, même source « caisse », même mode de règlement, mêmes
-- articles, mêmes quantités arrondies à 4 décimales) lève :
--   « Ticket deja utilise pour une autre vente. » (SQLSTATE 23505)
-- Un rejeu strict reste idempotent et ne déduit jamais le stock deux fois.
--
-- Portée : `vendre_article` délègue à `vendre_panier` (vérifié sur la base
-- déployée) : un seul corps à corriger. `importer_z` n'est pas touché : il
-- insère directement sans passer par `vendre_panier`.
--
-- Forme : CREATE OR REPLACE seulement. Aucun DROP, aucune chirurgie de
-- `pg_get_functiondef`, aucune dépendance à un brouillon (ni
-- `patisgest_exiger_site`). `SECURITY DEFINER` et `SET search_path = ''`
-- conservés. Le corps reproduit à l'identique celui installé par 21→50,
-- gardes injectées comprises (rôle labo interdite, module `caisse`), pour que
-- 36 (dates) et 44 (retrait « carte ») restent rejouables sans erreur.
--
-- Non appliquée au pilote : validation humaine explicite requise.
-- =====================================================================

create or replace function public.vendre_panier(
  p_site_id uuid,
  p_lignes jsonb,
  p_ticket text,
  p_mode_paiement text default 'especes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_ticket text := trim(coalesce(p_ticket, ''));
  v_mode text := coalesce(nullif(trim(coalesce(p_mode_paiement, '')), ''), 'especes');
  v_existing record;
  v_sale_id uuid;
  v_numero text;
  v_item record;
  v_art record;
  v_remaining numeric;
  v_line_missing numeric;
  v_missing_total numeric := 0;
  v_take numeric;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_consumed jsonb;
  v_all_lots jsonb := '[]'::jsonb;
  v_lignes_out jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  v_demande jsonb;
  v_stocke jsonb;
  r record;
begin if public.patisgest_mon_role() = 'labo' then raise exception 'Reserve au comptoir.' using errcode = '42501'; end if; perform public.patisgest_exiger_modules(string_to_array('caisse', '|'));
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if length(v_ticket) < 1 or length(v_ticket) > 80 then
    raise exception 'Ticket invalide.';
  end if;
  if v_mode not in ('especes', 'cheque_virement') then
    raise exception 'Mode de reglement invalide.';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 50 then
    raise exception 'Le panier doit contenir entre 1 et 50 produits.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a vendre.';
  end if;

  -- Contenu normalisé de la demande : identifiants -> uuid, quantités sommes
  -- et arrondies à 4 décimales, tri déterministe. Sert à comparer un rejeu.
  select jsonb_agg(jsonb_build_array(d.article_id, d.qte) order by d.article_id)
    into v_demande
    from (
      select (coalesce(x->>'articleId', x->>'article_id'))::uuid as article_id,
             round(sum((x->>'qte')::numeric), 4) as qte
        from jsonb_array_elements(p_lignes) x
       group by (coalesce(x->>'articleId', x->>'article_id'))::uuid
    ) d;

  -- Idempotence : le rejeu d'un ticket déjà enregistré ne déduit jamais deux fois le stock.
  select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement, v.site_id, v.source, v.lignes
    into v_existing
    from public.ventes v
   where v.client_id = v_client and v.ticket = v_ticket
   limit 1;
  if v_existing.id is not null then
    -- 53 : un ticket n'est réutilisable que sur le même site, pour une vente
    -- de caisse, avec le même règlement et exactement le même panier.
    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from 'caisse' then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
    select jsonb_agg(jsonb_build_array((x->>'articleId')::uuid, (x->>'qty')::numeric)
                     order by (x->>'articleId')::uuid)
      into v_stocke
      from jsonb_array_elements(coalesce(v_existing.lignes, '[]'::jsonb)) x;
    if v_existing.mode_paiement is distinct from v_mode or v_stocke is distinct from v_demande then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'numero', v_existing.numero,
      'duplicate', true,
      'missing', 0,
      'totalHT', v_existing.total_ht,
      'totalTTC', v_existing.total_ttc,
      'modePaiement', v_existing.mode_paiement,
      'lots', '[]'::jsonb
    );
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  v_numero := 'V-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);

  begin
    insert into public.ventes
      (client_id, site_id, numero, ticket, date_vente, source, mode_paiement, lignes, manquants, total_ht, total_ttc)
    values
      (v_client, p_site_id, v_numero, v_ticket, (now() at time zone 'Africa/Algiers')::date, 'caisse', v_mode, '[]'::jsonb, '[]'::jsonb, 0, 0)
    returning id into v_sale_id;
  exception when unique_violation then
    -- Course entre deux transactions sur le même ticket : on refait la même
    -- vérification que ci-dessus, jamais un « duplicate » aveugle.
    select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement, v.site_id, v.source, v.lignes
      into v_existing
      from public.ventes v
     where v.client_id = v_client and v.ticket = v_ticket
     limit 1;
    if v_existing.id is null then
      raise;
    end if;
    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from 'caisse' then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
    select jsonb_agg(jsonb_build_array((x->>'articleId')::uuid, (x->>'qty')::numeric)
                     order by (x->>'articleId')::uuid)
      into v_stocke
      from jsonb_array_elements(coalesce(v_existing.lignes, '[]'::jsonb)) x;
    if v_existing.mode_paiement is distinct from v_mode or v_stocke is distinct from v_demande then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'numero', v_existing.numero,
      'duplicate', true,
      'missing', 0,
      'totalHT', coalesce(v_existing.total_ht, 0),
      'totalTTC', coalesce(v_existing.total_ttc, 0),
      'modePaiement', v_existing.mode_paiement,
      'lots', '[]'::jsonb
    );
  end;

  -- Fusion des doublons et tri déterministe par article_id (zéro interblocage FOR UPDATE).
  for v_item in
    select
      (coalesce(x->>'articleId', x->>'article_id'))::uuid as article_id,
      round(sum((x->>'qte')::numeric), 4) as qte
    from jsonb_array_elements(p_lignes) x
    group by (coalesce(x->>'articleId', x->>'article_id'))::uuid
    order by (coalesce(x->>'articleId', x->>'article_id'))::uuid asc
  loop
    if v_item.article_id is null or v_item.qte is null or v_item.qte <= 0 or v_item.qte > 100000000 then
      raise exception 'Ligne de panier invalide (produit ou quantite).';
    end if;

    select a.id, a.client_id, a.niveau, a.nom, a.code, a.pv_ht, a.tva
      into v_art
      from public.articles a where a.id = v_item.article_id;
    if v_art.client_id is null then raise exception 'Article introuvable.'; end if;
    if v_art.client_id <> v_client then raise exception 'Article hors perimetre.'; end if;
    if v_art.niveau <> 'produit' then raise exception 'Seuls les produits finis peuvent etre vendus en caisse.'; end if;
    if v_art.pv_ht is null or v_art.pv_ht <= 0 or v_art.tva is null or v_art.tva < 0 or v_art.tva > 100 then
      raise exception 'Prix ou TVA article invalide.';
    end if;

    v_remaining := v_item.qte;
    v_line_missing := 0;
    v_consumed := '[]'::jsonb;

    -- FEFO éligible : ni lot bloqué, ni lot périmé (dlc < (now() at time zone 'Africa/Algiers')::date).
    for r in
      select l.id, l.qte_rest, l.numero
        from public.lots l
       where l.client_id = v_client
         and l.article_id = v_art.id
         and l.site_id = p_site_id
         and not l.bloque
         and l.qte_rest > 0
         and (l.dlc is null or l.dlc >= (now() at time zone 'Africa/Algiers')::date)
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(r.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
      v_all_lots := v_all_lots || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take, 'articleId', v_art.id);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_art.id, r.id, p_site_id, 'vente', -v_take, v_art.pv_ht, v_ticket, 'Vente');
    end loop;

    if v_remaining > 0 then
      v_line_missing := v_remaining;
      v_missing_total := round(v_missing_total + v_remaining, 4);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_art.id, null, p_site_id, 'vente', -v_remaining, v_art.pv_ht, v_ticket, 'Vente sans stock');
      v_manquants := v_manquants || jsonb_build_object('articleId', v_art.id, 'qty', v_remaining);
    end if;

    v_line_ht := round(v_item.qte * v_art.pv_ht, 2);
    v_line_ttc := round(v_item.qte * v_art.pv_ht * (1 + v_art.tva / 100), 2);
    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;

    v_lignes_out := v_lignes_out || jsonb_build_object(
      'articleId', v_art.id,
      'code', v_art.code,
      'nom', v_art.nom,
      'qty', v_item.qte,
      'pu', v_art.pv_ht,
      'tva', v_art.tva,
      'totalHT', v_line_ht,
      'totalTTC', v_line_ttc,
      'lots', v_consumed,
      'missing', v_line_missing
    );
  end loop;

  update public.ventes v
     set lignes = v_lignes_out,
         manquants = v_manquants,
         total_ht = round(v_total_ht, 2),
         total_ttc = round(v_total_ttc, 2)
   where v.id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'numero', v_numero,
    'duplicate', false,
    'missing', v_missing_total,
    'totalHT', round(v_total_ht, 2),
    'totalTTC', round(v_total_ttc, 2),
    'modePaiement', v_mode,
    'lines', jsonb_array_length(v_lignes_out),
    'lots', v_all_lots
  );

end;
$function$;

-- Frontière d'autorisation inchangée (rejouable, sans DROP).
revoke all on function public.vendre_panier(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.vendre_panier(uuid, jsonb, text, text) to authenticated, service_role;

insert into public.app_schema_version (id, version) values (1, 53)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ===== 54-anti-abus-vitrine-verrou.sql =====
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

-- ===== 55-dates-algiers-rattrapage.sql =====
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

-- ===== 56-profil-langue.sql =====
-- Migration 56 — VAGUE 4 B.2 : langue FR/AR dans le profil utilisateur.
-- Additive only. Idempotente. Prérequis : 01 (utilisateurs) et 35 (app_schema_version).

-- Le cookie reste la source immédiate côté navigateur ; cette colonne permet
-- de retrouver la préférence sur un autre appareil après reconnexion.
alter table public.utilisateurs
  add column if not exists langue text not null default 'fr';

update public.utilisateurs
   set langue = 'fr'
 where langue is null or langue not in ('fr', 'ar');

alter table public.utilisateurs
  drop constraint if exists utilisateurs_langue_check;
alter table public.utilisateurs
  add constraint utilisateurs_langue_check check (langue in ('fr', 'ar'));

comment on column public.utilisateurs.langue is
  'Langue d’interface choisie par l’utilisateur : fr ou ar.';

-- Un utilisateur ne peut modifier QUE sa propre ligne, sans dépendre d’une
-- policy UPDATE supplémentaire sur utilisateurs. SECURITY DEFINER + search_path
-- vide + auth.uid() gardent la même isolation multi-tenant que le reste du schéma.
create or replace function public.enregistrer_langue_utilisateur(p_langue text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_langue not in ('fr', 'ar') then
    raise exception 'Langue invalide.';
  end if;

  select u.client_id into v_client
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;

  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;

  update public.utilisateurs
     set langue = p_langue
   where auth_user_id = v_auth
     and client_id = v_client;

  return jsonb_build_object('ok', true, 'langue', p_langue, 'client_id', v_client);
end;
$$;

revoke execute on function public.enregistrer_langue_utilisateur(text) from public, anon;
grant execute on function public.enregistrer_langue_utilisateur(text) to authenticated, service_role;

insert into public.app_schema_version (id, version)
values (1, 56)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 57-onboarding-pack-dz-rpc.sql =====
-- Migration 57 — VAGUE 4 D : RPC idempotente du pack pâtisserie algérien.
-- Additive only. Idempotente et isolée par client_id.
-- Prérequis : 01/03 (articles), 50 (rôles), 56 (profil langue).
-- La migration 47 historique porte un nom proche mais ne contient que
-- `valider_tiroir_jour` : aucune migration appliquée n'est réécrite ici.

create or replace function public.importer_pack_patisserie_dz(
  p_activite text default 'mixte',
  p_tva text default 'ifu_0'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_total integer := 0;
  v_imported integer := 0;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Reserve au proprietaire.';
  end if;
  if p_activite not in ('mixte', 'boulangerie', 'patisserie', 'cake_shop') then
    raise exception 'Activite invalide.';
  end if;
  if p_tva not in ('ifu_0', 'reel_dz') then
    raise exception 'Regime TVA invalide.';
  end if;

  -- `on conflict (client_id, code) do nothing` rend l'appel rejouable sans
  -- écraser un prix ou une unité corrigés par le pâtissier. SECURITY DEFINER
  -- n'élargit pas le tenant : client_id vient uniquement du profil de auth.uid().
  with pack(code, nom, niveau, unite, seuil, prix_da, tva_reel, secteur) as (
    values
    ('PF-BAG', 'Baguette traditionnelle', 'produit', 'pcs', 40, 15, 0, 'boulangerie'),
    ('PF-PCM', 'Pain complet / céréales', 'produit', 'pcs', 20, 50, 9, 'boulangerie'),
    ('PF-BRI', 'Brioche artisanale', 'produit', 'pcs', 12, 160, 19, 'boulangerie'),
    ('PF-CRO', 'Croissant au beurre', 'produit', 'pcs', 20, 60, 19, 'boulangerie'),
    ('PF-PAC', 'Pain au chocolat', 'produit', 'pcs', 20, 70, 19, 'boulangerie'),
    ('PF-MIL', 'Mille-feuille vanille', 'produit', 'pcs', 12, 180, 19, 'patisserie'),
    ('PF-ECL', 'Éclair au chocolat', 'produit', 'pcs', 12, 200, 19, 'patisserie'),
    ('PF-TAR', 'Tartelette fruits', 'produit', 'pcs', 10, 240, 19, 'patisserie'),
    ('PF-BAK', 'Baklawa amandes', 'produit', 'kg', 3, 3200, 19, 'patisserie'),
    ('PF-MAK', 'Makrout el louz / miel', 'produit', 'kg', 4, 1800, 19, 'patisserie'),
    ('PF-KAL', 'Kalb El Louz', 'produit', 'pcs', 20, 120, 19, 'patisserie'),
    ('PF-ANN', 'Gâteau anniversaire (10 parts)', 'produit', 'pcs', 2, 3800, 19, 'cake_shop'),
    ('PF-BEN', 'Bento Cake personnalisé', 'produit', 'pcs', 4, 1600, 19, 'cake_shop'),
    ('PF-CUP', 'Boîte 6 Cupcakes décorés', 'produit', 'boîte', 4, 1200, 19, 'cake_shop'),
    ('MP-FAR', 'Farine pâtissière / boulangère', 'matiere', 'kg', 25, 95, 9, 'commun'),
    ('MP-LEV', 'Levure boulangère fraîche', 'matiere', 'kg', 3, 420, 9, 'boulangerie'),
    ('MP-BEU', 'Beurre de tourage / pâtissier', 'matiere', 'kg', 10, 950, 19, 'commun'),
    ('MP-SUC', 'Sucre cristallisé', 'matiere', 'kg', 15, 110, 9, 'commun'),
    ('MP-LAI', 'Lait entier', 'matiere', 'L', 12, 90, 9, 'commun'),
    ('MP-OEU', 'Œufs frais', 'matiere', 'pcs', 60, 22, 9, 'commun'),
    ('MP-AMA', 'Amandes blanchies', 'matiere', 'kg', 5, 1900, 19, 'patisserie'),
    ('MP-MIE', 'Miel pur', 'matiere', 'kg', 4, 1100, 9, 'patisserie'),
    ('MP-CHO', 'Chocolat noir pâtissier', 'matiere', 'kg', 4, 1800, 19, 'commun'),
    ('MP-CRE', 'Crème fraîche 35 %', 'matiere', 'L', 6, 780, 19, 'commun')
  ),
  selection as (
    select
      code,
      nom,
      niveau,
      unite,
      seuil::numeric(12,3) as seuil,
      case
        when p_tva = 'ifu_0' then prix_da::numeric
        else round((prix_da::numeric / (1 + tva_reel::numeric / 100))::numeric, 2)
      end as pv_ht,
      case when p_tva = 'ifu_0' then 0 else tva_reel end::numeric(5,2) as tva
    from pack
    where p_activite = 'mixte' or secteur = 'commun' or secteur = p_activite
  ),
  insere as (
    insert into public.articles (
      client_id, code, nom, niveau, unite, seuil, pv_ht, tva, allergenes, traces
    )
    select v_client, code, nom, niveau, unite, seuil, pv_ht, tva,
           '{}'::text[], '{}'::text[]
      from selection
    on conflict (client_id, code) do nothing
    returning 1
  )
  select (select count(*)::int from selection), (select count(*)::int from insere)
    into v_total, v_imported;

  return jsonb_build_object(
    'ok', true,
    'imported', v_imported,
    'total', v_total,
    'client_id', v_client,
    'activite', p_activite,
    'tva', p_tva
  );
end;
$$;

revoke execute on function public.importer_pack_patisserie_dz(text, text) from public, anon;
grant execute on function public.importer_pack_patisserie_dz(text, text) to authenticated, service_role;

insert into public.app_schema_version (id, version)
values (1, 57)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 58-durcissement-forensique-prod.sql =====
-- =====================================================================
-- Migration 58 — Durcissement forensique production (P0/P1).
--
-- Corrige sans réécrire les migrations 01..57 déjà appliquées :
--   1. `enregistrer_avoir` / `enregistrer_avoir_article` : verrou `FOR UPDATE`
--      sur `ventes` (anti double-remboursement TOCTOU), choix explicite
--      d'article sur ticket multiproduit, formule TTC alignée sur
--      `vendre_panier`, garde module `caisse` et date `Africa/Algiers`.
--   2. `valider_tiroir_jour` : garde module `cloture`, verrou consultatif
--      anti-course sur `max(revision) + 1`, déduction des avoirs espèces
--      du jour dans l'attendu vendeur, date `Africa/Algiers`.
--   3. `credits_clients` & `avoirs` : policies restrictives `module_guard_*`
--      (`caisse`), garde module sur `enregistrer_reglement_credit`, trigger
--      d'intégrité empêchant un vendeur de forger `statut`/`reglements`/`cree_par`
--      à l'insertion et soldant automatiquement si `montant_regle_da >= montant_total_da`.
--   4. Traçabilité & Loi 18-07 : triggers `journal_audit` sur `credits_clients`
--      et `transferts`, inclusion de `credits_clients` dans
--      `exporter_donnees_personnelles()`, `anonymiser_client()` et nouvelle
--      RPC `anonymiser_credit_client()`.
--   5. Provisioning & licence admin (`service_role` uniquement) :
--      `provisionner_espace_patisserie_admin` (transaction unique) et
--      `master_maj_licence_admin` (incrément atomique de `license_version`).
--
-- Additive only. Rejouable. Version de schéma -> 58.
-- =====================================================================

-- ---------------------------------------------------------------------------
-- 1. Avoirs & retours : verrou FOR UPDATE + multi-article + TTC aligné + module
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_avoir_article(
  p_vente_id uuid,
  p_mode text,
  p_motif text,
  p_qte numeric,
  p_article_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_email text;
  v_vente record;
  v_article record;
  v_article_cible uuid;
  v_vendu numeric := 0;
  v_deja numeric := 0;
  v_qte numeric := round(coalesce(p_qte, 0), 4);
  v_motif text := btrim(coalesce(p_motif, ''));
  v_lot_id uuid;
  v_pu numeric := 0;
  v_tva numeric := 0;
  v_ht numeric := 0;
  v_ttc numeric := 0;
  v_lot_cree boolean := false;
  v_numero text;
  v_avoir uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;

  if public.patisgest_mon_role() = 'labo' then
    raise exception 'Reserve au comptoir.' using errcode = '42501';
  end if;
  perform public.patisgest_exiger_modules(array['caisse']);

  select u.client_id, u.role::text, u.email into v_client, v_role, v_email
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Role non autorise a enregistrer un avoir.' using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('remise_en_stock', 'destruction') then
    raise exception 'Mode d''avoir invalide : remise en stock ou destruction.';
  end if;
  if length(v_motif) < 3 or length(v_motif) > 500 then
    raise exception 'Motif obligatoire (3 a 500 caracteres).';
  end if;
  if v_qte <= 0 or v_qte > 100000000 then
    raise exception 'Quantite d''avoir invalide.';
  end if;
  if p_vente_id is null then
    raise exception 'Vente obligatoire.';
  end if;

  -- Verrou de ligne sur la vente : sérialise les avoirs concurrents sur un même ticket.
  select v.id, v.client_id, v.site_id, v.lignes into v_vente
    from public.ventes v
   where v.id = p_vente_id
   for update;
  if v_vente.id is null then
    raise exception 'Vente introuvable.';
  end if;
  if v_vente.client_id <> v_client then
    raise exception 'Vente hors perimetre.';
  end if;

  if p_article_id is not null then
    select (l->>'articleId')::uuid into v_article_cible
      from jsonb_array_elements(v_vente.lignes) l
     where (l->>'articleId')::uuid = p_article_id
     limit 1;
    if v_article_cible is null then
      raise exception 'Article absent de cette vente.';
    end if;
  else
    select (l->>'articleId')::uuid into v_article_cible
      from jsonb_array_elements(v_vente.lignes) l
     limit 1;
    if v_article_cible is null then
      raise exception 'Vente sans ligne : avoir impossible.';
    end if;
  end if;

  select a.id, a.client_id, a.nom into v_article
    from public.articles a
   where a.id = v_article_cible;
  if v_article.client_id is null or v_article.client_id <> v_client then
    raise exception 'Article de la vente hors perimetre.';
  end if;

  select coalesce(sum((l->>'qty')::numeric), 0) into v_vendu
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id;

  select coalesce(sum(a.qte), 0) into v_deja
    from public.avoirs a
   where a.vente_id = v_vente.id and a.article_id = v_article.id;

  if v_deja + v_qte > v_vendu then
    raise exception 'Quantite d''avoir superieure a la quantite vendue (% vendu, % deja rendu).',
      v_vendu, v_deja;
  end if;

  if p_mode = 'remise_en_stock' then
    select (lot->>'lotId')::uuid into v_lot_id
      from jsonb_array_elements(v_vente.lignes) l,
           lateral jsonb_array_elements(coalesce(l->'lots', '[]'::jsonb)) lot
     where (l->>'articleId')::uuid = v_article.id
     limit 1;

    if v_lot_id is not null then
      perform 1 from public.lots l
       where l.id = v_lot_id and l.client_id = v_client and l.site_id = v_vente.site_id
       for update;
      if not found then
        v_lot_id := null;
      end if;
    end if;

    if v_lot_id is not null then
      update public.lots l
         set qte_rest = l.qte_rest + v_qte
       where l.id = v_lot_id;
    else
      v_numero := 'RET-' || to_char(now() at time zone 'Africa/Algiers', 'YYMMDDHH24MISS') || '-' ||
                  substr(md5(v_auth::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 6);
      insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception, ref)
      values (v_client, v_article.id, v_vente.site_id, v_numero, v_qte, v_qte, 0, v_today, 'Retour client')
      returning id into v_lot_id;
      v_lot_cree := true;
    end if;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, v_lot_id, v_vente.site_id, 'avoir_remise', v_qte, 0,
            p_vente_id::text, 'Retour client : ' || v_motif);
  else
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, null, v_vente.site_id, 'avoir_destruction', -v_qte, 0,
            p_vente_id::text, 'Destruction : ' || v_motif);
  end if;

  select coalesce((l->>'pu')::numeric, 0), coalesce((l->>'tva')::numeric, 0)
    into v_pu, v_tva
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id
   limit 1;
  v_pu := coalesce(v_pu, 0);
  v_tva := coalesce(v_tva, 0);
  -- Aligné sur `vendre_panier` (migration 53) : arrondi direct sur qte * pu * (1 + tva/100).
  v_ht := round(v_qte * v_pu, 2);
  v_ttc := round(v_qte * v_pu * (1 + v_tva / 100), 2);

  v_numero := 'AV-' || to_char(now() at time zone 'Africa/Algiers', 'YYMMDDHH24MISS') || '-' ||
              substr(md5(v_auth::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 6);
  insert into public.avoirs (client_id, vente_id, site_id, article_id, numero, qte, mode, motif,
                             pu_ht, tva_pct, total_ht, total_ttc,
                             lot_id, lot_retour_cree, acteur_id, acteur_email)
  values (v_client, v_vente.id, v_vente.site_id, v_article.id, v_numero, v_qte, p_mode, v_motif,
          v_pu, v_tva, v_ht, v_ttc,
          v_lot_id, v_lot_cree, v_auth, v_email)
  returning id into v_avoir;

  return jsonb_build_object(
    'avoir_id', v_avoir,
    'numero', v_numero,
    'mode', p_mode,
    'qte', v_qte,
    'total_ht', v_ht,
    'total_ttc', v_ttc,
    'article', v_article.nom,
    'article_id', v_article.id,
    'lot_id', v_lot_id,
    'lot_retour_cree', v_lot_cree
  );
end;
$fn$;

revoke all on function public.enregistrer_avoir_article(uuid, text, text, numeric, uuid) from public, anon;
grant execute on function public.enregistrer_avoir_article(uuid, text, text, numeric, uuid) to authenticated, service_role;

-- Compatibilité stricte 4 arguments : délègue au corps verrouillé ci-dessus.
create or replace function public.enregistrer_avoir(
  p_vente_id uuid,
  p_mode text,
  p_motif text,
  p_qte numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  perform v_today;
  return public.enregistrer_avoir_article(p_vente_id, p_mode, p_motif, p_qte, null);
end;
$fn$;

revoke all on function public.enregistrer_avoir(uuid, text, text, numeric) from public, anon;
grant execute on function public.enregistrer_avoir(uuid, text, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Clôture tiroir : garde module `cloture`, verrou révision, avoirs espèces
-- ---------------------------------------------------------------------------
create or replace function public.valider_tiroir_jour(
  p_date date,
  p_site_id uuid,
  p_fond_initial numeric,
  p_especes_comptees numeric,
  p_attendu numeric default 0,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_existing int;
  v_revision int;
  v_ventes_especes numeric := 0;
  v_avoirs_especes numeric := 0;
  v_attendu_effectif numeric;
  v_bilan jsonb;
  v_id uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Comptage tiroir reserve au comptoir.' using errcode = '42501';
  end if;
  perform public.patisgest_exiger_modules(array['cloture']);

  if p_date is null or p_date > v_today then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if p_fond_initial is null or p_fond_initial < 0 then raise exception 'Fond initial invalide.'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Montant compte invalide.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site hors perimetre.'; end if;
  if not public.patisgest_site_autorise(p_site_id) then
    raise exception 'Site non autorise.' using errcode = '42501';
  end if;

  -- Sérialise les validations simultanées pour (tenant, site, date) -> révision sans collision.
  perform pg_advisory_xact_lock(
    hashtextextended(v_client::text || ':tiroir:' || p_site_id::text || ':' || p_date::text, 0)
  );

  if v_role = 'vendeur' then
    select coalesce(sum(v.total_ttc), 0) into v_ventes_especes
      from public.ventes v
     where v.client_id = v_client
       and v.site_id = p_site_id
       and v.date_vente = p_date
       and coalesce(v.mode_paiement, 'especes') = 'especes';

    select coalesce(sum(a.total_ttc), 0) into v_avoirs_especes
      from public.avoirs a
      join public.ventes v on v.id = a.vente_id
     where a.client_id = v_client
       and a.site_id = p_site_id
       and (a.cree_le at time zone 'Africa/Algiers')::date = p_date
       and coalesce(v.mode_paiement, 'especes') = 'especes';

    v_attendu_effectif := round((v_ventes_especes - v_avoirs_especes)::numeric, 2);
  else
    v_attendu_effectif := coalesce(p_attendu, 0);
  end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  v_revision := v_existing + 1;

  v_bilan := jsonb_build_object(
    'fond_ouverture', round(p_fond_initial::numeric, 2),
    'especes_attendues', round(v_attendu_effectif::numeric, 2),
    'especes_comptees', round(p_especes_comptees::numeric, 2),
    'ecart', round((p_especes_comptees - (p_fond_initial + v_attendu_effectif))::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 250),
    'source', case when v_role = 'vendeur' then 'vendeur_aveugle' else 'dashboard_rapide' end,
    'valide_at', now()
  );

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, caisse_bilan)
  values (v_client, p_date, p_site_id, v_revision, '[]'::jsonb, v_bilan)
  returning id into v_id;

  if v_role = 'vendeur' then
    return jsonb_build_object('id', v_id, 'revision', v_revision, 'blind', true);
  end if;
  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_bilan);
end;
$$;

revoke all on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Crédits clients & avoirs : gardes modules `caisse` + intégrité + audit
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_reglement_credit(
  p_credit_id uuid,
  p_montant_da numeric,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_row public.credits_clients%rowtype;
  v_new_regle numeric(12,2);
  v_new_statut text;
  v_entry jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Role non autorise.' using errcode = '42501';
  end if;
  perform public.patisgest_exiger_modules(array['caisse']);
  if p_montant_da is null or p_montant_da <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_row
    from public.credits_clients
   where id = p_credit_id and client_id = v_client
   for update;

  if not found then raise exception 'Credit introuvable.'; end if;
  if v_row.statut <> 'ouvert' then raise exception 'Ce credit est deja solde ou annule.'; end if;

  v_new_regle := round((v_row.montant_regle_da + p_montant_da)::numeric, 2);
  if v_new_regle > v_row.montant_total_da then
    raise exception 'Le montant depasse le reste a payer.';
  end if;

  v_new_statut := case when v_new_regle >= v_row.montant_total_da then 'solde' else 'ouvert' end;
  v_entry := jsonb_build_object(
    'montant_da', round(p_montant_da::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 200),
    'at', now(),
    'par', v_auth
  );

  update public.credits_clients
     set montant_regle_da = v_new_regle,
         statut = v_new_statut,
         reglements = reglements || jsonb_build_array(v_entry),
         updated_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'montant_regle_da', v_new_regle,
    'reste_da', round((v_row.montant_total_da - v_new_regle)::numeric, 2),
    'statut', v_new_statut
  );
end;
$$;

revoke all on function public.enregistrer_reglement_credit(uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_reglement_credit(uuid, numeric, text) to authenticated, service_role;

-- Policies restrictives de module sur `avoirs` et `credits_clients` (alignées sur migration 23).
drop policy if exists module_guard_select on public.avoirs;
create policy module_guard_select on public.avoirs
  as restrictive for select to authenticated
  using (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_select on public.credits_clients;
create policy module_guard_select on public.credits_clients
  as restrictive for select to authenticated
  using (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_insert on public.credits_clients;
create policy module_guard_insert on public.credits_clients
  as restrictive for insert to authenticated
  with check (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_update on public.credits_clients;
create policy module_guard_update on public.credits_clients
  as restrictive for update to authenticated
  using (public.patisgest_module_autorise('caisse'))
  with check (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_delete on public.credits_clients;
create policy module_guard_delete on public.credits_clients
  as restrictive for delete to authenticated
  using (public.patisgest_module_autorise('caisse'));

-- Trigger d'intégrité `credits_clients` : empêche la forge à l'insertion vendeur
-- et maintient `statut = 'solde'` cohérent lorsque `montant_total_da` est ajusté.
create or replace function public.patisgest_credits_clients_integrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.patisgest_mon_role();
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.cree_par := v_uid;
    end if;
    if v_role = 'vendeur' then
      if new.statut = 'annule' then
        raise exception 'Seul le proprietaire peut annuler un credit.' using errcode = '42501';
      end if;
      new.statut := case when new.montant_regle_da >= new.montant_total_da then 'solde' else 'ouvert' end;
      if new.montant_regle_da > 0 then
        new.reglements := jsonb_build_array(
          jsonb_build_object(
            'montant_da', round(new.montant_regle_da::numeric, 2),
            'note', 'Avance initiale',
            'at', now(),
            'par', v_uid
          )
        );
      else
        new.reglements := '[]'::jsonb;
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.statut = 'ouvert' and new.montant_regle_da >= new.montant_total_da then
      new.statut := 'solde';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.patisgest_credits_clients_integrite() from public, anon, authenticated;

drop trigger if exists credits_clients_integrite on public.credits_clients;
create trigger credits_clients_integrite
  before insert or update on public.credits_clients
  for each row execute function public.patisgest_credits_clients_integrite();

-- ---------------------------------------------------------------------------
-- 4. Journal d'audit (`credits_clients`, `transferts`) & Loi 18-07 complète
-- ---------------------------------------------------------------------------
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_credits_clients on public.credits_clients;
    create trigger audit_credits_clients
      after insert or update or delete on public.credits_clients
      for each row execute function public.patisgest_audit_ligne();

    if to_regclass('public.transferts') is not null then
      drop trigger if exists audit_transferts on public.transferts;
      create trigger audit_transferts
        after insert or update or delete on public.transferts
        for each row execute function public.patisgest_audit_ligne();
    end if;
  end if;
end
$audit$;

create or replace function public.exporter_donnees_personnelles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_out jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Export reserve au proprietaire.';
  end if;

  select jsonb_build_object(
    'genere_le', now(),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero,
        'client_nom', c.client_nom,
        'telephone', c.telephone,
        'date_evenement', c.date_event,
        'parts', c.nb_parts,
        'montant_ht', c.prix_ht,
        'statut', c.statut
      ) order by c.date_event desc)
        from public.cakes c where c.client_id = v_client
    ), '[]'::jsonb),
    'credits_clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cc.id,
        'nom_debiteur', cc.nom_debiteur,
        'telephone', cc.telephone,
        'type_compte', cc.type_compte,
        'montant_total_da', cc.montant_total_da,
        'montant_regle_da', cc.montant_regle_da,
        'statut', cc.statut,
        'cree_le', cc.created_at
      ) order by cc.created_at desc)
        from public.credits_clients cc where cc.client_id = v_client
    ), '[]'::jsonb),
    'comptes_utilisateurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email,
        'role', u.role,
        'cree_le', u.created_at
      ) order by u.created_at)
        from public.utilisateurs u where u.client_id = v_client
    ), '[]'::jsonb)
  ) into v_out;

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client,
          'EXP-' || to_char(now() at time zone 'Africa/Algiers', 'YYMMDDHH24MISS') || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          'export',
          'Export des donnees personnelles de l etablissement', 'etablissement',
          jsonb_array_length(coalesce(v_out->'commandes', '[]'::jsonb))
            + jsonb_array_length(coalesce(v_out->'credits_clients', '[]'::jsonb)),
          v_auth)
  on conflict (client_id, reference) do nothing;

  return v_out;
end;
$fn$;

revoke all on function public.exporter_donnees_personnelles() from public, anon;
grant execute on function public.exporter_donnees_personnelles() to authenticated;

create or replace function public.anonymiser_client(
  p_numero_commande text,
  p_motif text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_motif text := btrim(coalesce(p_motif, ''));
  v_ref text := btrim(coalesce(p_reference, ''));
  v_numero text := btrim(coalesce(p_numero_commande, ''));
  v_tel text;
  v_touche integer := 0;
  v_n integer := 0;
  v_credits_n integer := 0;
  v_demande uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Anonymisation reservee au proprietaire.'; end if;
  if length(v_motif) < 3 then raise exception 'Motif obligatoire.'; end if;
  if length(v_ref) < 3 then raise exception 'Reference de la demande obligatoire.'; end if;
  if v_numero = '' then raise exception 'Commande a anonymiser obligatoire.'; end if;

  select nullif(regexp_replace(coalesce(c.telephone, ''), '\D', '', 'g'), '') into v_tel
    from public.cakes c
   where c.client_id = v_client and c.numero = v_numero
   limit 1;

  update public.cakes c
     set client_nom = 'Client anonymise (' || v_ref || ')',
         telephone = null
   where c.client_id = v_client and c.numero = v_numero;
  get diagnostics v_n = row_count;
  v_touche := v_touche + v_n;
  if v_n = 0 then
    raise exception 'Commande introuvable.';
  end if;

  if v_tel is not null and length(v_tel) >= 8 then
    update public.credits_clients cc
       set nom_debiteur = 'Client anonymise (' || v_ref || ')',
           telephone = '',
           updated_at = now()
     where cc.client_id = v_client
       and regexp_replace(coalesce(cc.telephone, ''), '\D', '', 'g') = v_tel;
    get diagnostics v_credits_n = row_count;
    v_touche := v_touche + v_credits_n;
  end if;

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, v_numero, v_touche, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION', 'credits_touches', v_credits_n);
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_touche,
    'credits_anonymises', v_credits_n,
    'commandes_conservees', (select count(*) from public.cakes where client_id = v_client),
    'ventes_conservees', (select count(*) from public.ventes where client_id = v_client)
  );
end;
$fn$;

revoke all on function public.anonymiser_client(text, text, text) from public, anon;
grant execute on function public.anonymiser_client(text, text, text) to authenticated;

create or replace function public.anonymiser_credit_client(
  p_credit_id uuid,
  p_motif text,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_motif text := btrim(coalesce(p_motif, ''));
  v_ref text := btrim(coalesce(p_reference, ''));
  v_n integer := 0;
  v_demande uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Anonymisation reservee au proprietaire.'; end if;
  if p_credit_id is null then raise exception 'Credit obligatoire.'; end if;
  if length(v_motif) < 3 then raise exception 'Motif obligatoire.'; end if;
  if length(v_ref) < 3 then raise exception 'Reference de la demande obligatoire.'; end if;

  update public.credits_clients cc
     set nom_debiteur = 'Client anonymise (' || v_ref || ')',
         telephone = '',
         updated_at = now()
   where cc.client_id = v_client and cc.id = p_credit_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Credit introuvable.'; end if;

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, 'credit:' || p_credit_id::text, v_n, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation_credit', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION');
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_n
  );
end;
$fn$;

revoke all on function public.anonymiser_credit_client(uuid, text, text) from public, anon;
grant execute on function public.anonymiser_credit_client(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs atomiques d'administration (`service_role` uniquement)
-- ---------------------------------------------------------------------------
create or replace function public.provisionner_espace_patisserie_admin(
  p_auth_user_id uuid,
  p_nom_etab text,
  p_nom_prop text,
  p_email text,
  p_telephone text default null,
  p_duree_essai integer default 90,
  p_mode_gratuit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_duree integer := least(90, greatest(60, coalesce(p_duree_essai, 90)));
  v_fin timestamptz := v_now + make_interval(days => v_duree);
  v_client_id uuid;
  v_site_labo uuid;
  v_site_boutique uuid;
  v_util_id uuid;
begin
  if p_auth_user_id is null then raise exception 'Utilisateur Auth obligatoire.'; end if;
  if length(btrim(coalesce(p_nom_etab, ''))) < 2 then raise exception 'Nom etablissement invalide.'; end if;
  if length(btrim(coalesce(p_nom_prop, ''))) < 2 then raise exception 'Nom proprietaire invalide.'; end if;
  if position('@' in coalesce(p_email, '')) < 2 then raise exception 'Email invalide.'; end if;

  insert into public.clients (
    nom, telephone, offre, statut_abonnement,
    essai_duree_jours, essai_debut_at, essai_fin_at,
    paye_at, paye_par_master
  )
  values (
    btrim(p_nom_etab),
    nullif(btrim(coalesce(p_telephone, '')), ''),
    'solo',
    case when coalesce(p_mode_gratuit, false) then 'paye' else 'essai' end,
    v_duree,
    v_now,
    v_fin,
    case when coalesce(p_mode_gratuit, false) then v_now else null end,
    case when coalesce(p_mode_gratuit, false) then 'mode-gratuit' else null end
  )
  returning id into v_client_id;

  insert into public.sites (client_id, nom, type)
  values (v_client_id, 'Laboratoire', 'laboratoire')
  returning id into v_site_labo;

  insert into public.sites (client_id, nom, type)
  values (v_client_id, 'Boutique', 'boutique')
  returning id into v_site_boutique;

  insert into public.utilisateurs (
    auth_user_id, client_id, email, nom, role, telephone, last_seen_at
  )
  values (
    p_auth_user_id,
    v_client_id,
    lower(btrim(p_email)),
    btrim(p_nom_prop),
    'proprietaire',
    nullif(btrim(coalesce(p_telephone, '')), ''),
    v_now
  )
  returning id into v_util_id;

  insert into public.equipe_sites (utilisateur_id, site_id)
  values (v_util_id, v_site_labo), (v_util_id, v_site_boutique);

  return jsonb_build_object(
    'client_id', v_client_id,
    'utilisateur_id', v_util_id,
    'site_labo_id', v_site_labo,
    'site_boutique_id', v_site_boutique,
    'essai_fin_at', v_fin
  );
end;
$$;

revoke all on function public.provisionner_espace_patisserie_admin(uuid, text, text, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.provisionner_espace_patisserie_admin(uuid, text, text, text, text, integer, boolean)
  to service_role;

create or replace function public.master_maj_licence_admin(
  p_client_id uuid,
  p_action text,
  p_duree_essai integer default null,
  p_statut text default null,
  p_master_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_duree integer;
  v_fin timestamptz;
  v_next_ver integer;
begin
  if p_client_id is null then raise exception 'Client obligatoire.'; end if;

  select c.id, c.essai_debut_at, coalesce(c.license_version, 1) as license_version
    into v_row
    from public.clients c
   where c.id = p_client_id
   for update;
  if v_row.id is null then raise exception 'Client introuvable.'; end if;

  v_next_ver := v_row.license_version + 1;

  if p_action = 'duree_essai' then
    v_duree := least(90, greatest(60, coalesce(p_duree_essai, 90)));
    v_fin := coalesce(v_row.essai_debut_at, now()) + make_interval(days => v_duree);
    update public.clients
       set essai_duree_jours = v_duree,
           essai_fin_at = v_fin,
           license_version = v_next_ver
     where id = p_client_id;
  elsif p_action = 'marquer_paye' then
    update public.clients
       set statut_abonnement = 'paye',
           paye_at = now(),
           paye_par_master = nullif(btrim(coalesce(p_master_email, '')), ''),
           license_version = v_next_ver
     where id = p_client_id;
  elsif p_action = 'changer_statut' then
    if p_statut not in ('essai', 'paye', 'suspendu') then
      raise exception 'Statut invalide.';
    end if;
    update public.clients
       set statut_abonnement = p_statut,
           license_version = v_next_ver
     where id = p_client_id;
  else
    raise exception 'Action licence invalide.';
  end if;

  return jsonb_build_object('client_id', p_client_id, 'license_version', v_next_ver);
end;
$$;

revoke all on function public.master_maj_licence_admin(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.master_maj_licence_admin(uuid, text, integer, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Version de schéma -> 58
-- ---------------------------------------------------------------------------
insert into public.app_schema_version (id, version)
values (1, 58)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version),
      applique_le = now();
