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
