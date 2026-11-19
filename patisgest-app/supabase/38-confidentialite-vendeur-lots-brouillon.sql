-- BROUILLON phase 2 : les prix d'achat ne sont pas des prix de vente.
-- Ne pas déployer isolément : la caisse et les stocks utilisent vendeur_lots.
-- Les autres surfaces financières vendeur doivent encore être auditées.
begin;
create policy vendeur_sans_lots_bruts on public.lots as restrictive for select to authenticated
 using (public.patisgest_mon_role() <> 'vendeur');
create policy vendeur_sans_mouvements_bruts on public.mouvements as restrictive for select to authenticated
 using (public.patisgest_mon_role() <> 'vendeur');

-- La vue est exécutée comme son propriétaire : tenant, rôle, site et module
-- doivent tous être vérifiés explicitement (ne pas s'en remettre à la RLS).
create view public.vendeur_lots with (security_barrier=true) as
 select l.id,l.client_id,l.article_id,l.site_id,l.numero,l.qte_init,l.qte_rest,
  l.dlc,l.date_reception,l.ref,l.congele,l.bloque,l.bloque_motif,l.created_at
 from public.lots l
 where l.client_id=public.patisgest_mon_client()
  and public.patisgest_mon_role()='vendeur'
  and public.patisgest_site_autorise(l.site_id)
  and (public.patisgest_module_autorise('stocks') or public.patisgest_module_autorise('caisse')
   or public.patisgest_module_autorise('planning') or public.patisgest_module_autorise('qualite')
   or public.patisgest_module_autorise('tracabilite'));
revoke all on public.vendeur_lots from public,anon;
grant select on public.vendeur_lots to authenticated,service_role;
commit;
