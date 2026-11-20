-- BROUILLON phase 2 : les OF bruts contiennent cout_reel et des JSON de
-- consommations/valorisation. Ne pas appliquer sans l'application adaptée.
begin;
create policy vendeur_sans_of_bruts on public.ordres_fabrication as restrictive for select to authenticated
 using (public.patisgest_mon_role() <> 'vendeur');
create view public.vendeur_ordres_fabrication with (security_barrier=true) as
 select o.id,o.client_id,o.site_id,o.numero,o.qte_prevue,o.qte_realisee,
  o.date_prevue,o.date_lancement,o.statut,o.created_at,
  jsonb_strip_nulls(jsonb_build_object(
   'recette',case when jsonb_typeof(o.snapshot->'recette')='string' then o.snapshot->'recette' end,
   'version',case when jsonb_typeof(o.snapshot->'version')='number' then o.snapshot->'version' end,
   'devis',case when jsonb_typeof(o.snapshot->'devis')='string' then o.snapshot->'devis' end
  )) as snapshot
 from public.ordres_fabrication o
 where o.client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='vendeur'
  and public.patisgest_site_autorise(o.site_id)
  and (public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning') or public.patisgest_module_autorise('cake-design'));
revoke all on public.vendeur_ordres_fabrication from public,anon;
grant select on public.vendeur_ordres_fabrication to authenticated,service_role;
commit;
