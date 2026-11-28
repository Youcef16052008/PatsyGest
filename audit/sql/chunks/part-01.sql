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
