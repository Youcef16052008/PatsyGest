-- Restreint les tables Sprint 2 en lecture jusqu'à la validation des politiques
-- d'écriture (rôles, références inter-client et opérations transactionnelles).
begin;
drop policy if exists utilisateurs_update_own on public.utilisateurs;
do $$ declare t text; begin
  foreach t in array array['fournisseurs','articles','lots','mouvements','historique_prix','bons_commande','recette_familles','recette_versions','ordres_fabrication','ventes','clotures','cakes','releve_temperatures','nettoyages','non_conformites','transferts','taches_planning'] loop
    execute format('drop policy if exists %I on public.%I', t || '_tenant_isolation', t);
    execute format('drop policy if exists %I on public.%I', t || '_tenant_read', t);
    execute format('create policy %I on public.%I for select to authenticated using (client_id in (select client_id from public.utilisateurs where auth_user_id = auth.uid()))', t || '_tenant_read', t);
  end loop;
end $$;
commit;
