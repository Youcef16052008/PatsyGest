-- BROUILLON : ne pas appliquer avant validation et déploiement coordonné.
-- Seul le propriétaire gère les sites de son établissement. Cette migration
-- ne met PAS en œuvre l'attribution des sites aux employés ni leur isolation.
begin;
create policy sites_insert_proprietaire on public.sites as restrictive for insert to authenticated
  with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() = 'proprietaire');
create policy sites_update_proprietaire on public.sites as restrictive for update to authenticated
  using (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() = 'proprietaire')
  with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() = 'proprietaire');
commit;
