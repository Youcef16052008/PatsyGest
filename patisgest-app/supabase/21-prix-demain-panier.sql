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

begin;

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

commit;
