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

begin;

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

commit;
