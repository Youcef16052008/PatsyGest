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

begin;

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

commit;

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
