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
