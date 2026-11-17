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
  p_date_prevue date
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
     consommations, manquants, lots_produits, cout_reel)
  values
    (v_client, v_famille, p_version_id, p_site_id, v_numero, p_qte_prevue,
     0, p_date_prevue, null, 'planifie', v_snapshot, v_besoins,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0)
  returning id into v_of_id;

  return jsonb_build_object('of_id', v_of_id, 'numero', v_numero, 'besoins', v_besoins);
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
revoke execute on function public.creer_of(uuid, uuid, numeric, date) from public, anon;
grant execute on function public.creer_of(uuid, uuid, numeric, date) to authenticated, service_role;
revoke execute on function public.demarrer_of(uuid) from public, anon;
grant execute on function public.demarrer_of(uuid) to authenticated, service_role;
revoke execute on function public.terminer_of(uuid, numeric, text, date) from public, anon;
grant execute on function public.terminer_of(uuid, numeric, text, date) to authenticated, service_role;
