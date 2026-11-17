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
