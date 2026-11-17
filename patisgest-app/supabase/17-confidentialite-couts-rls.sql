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

begin;

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
revoke all on function public.creer_of(uuid, uuid, numeric, date) from public, anon, authenticated;
drop function if exists public.creer_of(uuid, uuid, numeric, date);

-- creer_of 5 args : n'était accordée qu'à authenticated, mais l'ACL portait
-- aussi le droit par défaut `=X` (PUBLIC), que `anon` héritait -> révoqué.
revoke execute on function public.creer_of(uuid, uuid, numeric, date, text) from public;

-- --------------------------------------------------- outil DDL non exposé
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

commit;
