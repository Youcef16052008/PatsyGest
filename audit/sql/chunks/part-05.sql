
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
