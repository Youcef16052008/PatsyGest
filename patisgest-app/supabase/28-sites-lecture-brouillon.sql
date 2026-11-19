-- BROUILLON : limite certaines lectures/écritures directes aux sites attribués.
-- NE PAS APPLIQUER : les RPC SECURITY DEFINER et les données sans site ne sont
-- pas encore couvertes ; cette migration n'est pas une isolation complète.
begin;
create function public.patisgest_site_autorise(p_site uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
   select 1 from public.utilisateurs u join public.sites s on s.id=p_site and s.client_id=u.client_id
   where u.auth_user_id=auth.uid() and (u.role='proprietaire' or exists(
    select 1 from public.equipe_sites a where a.utilisateur_id=u.id and a.site_id=s.id
   ))
 )
$$;
revoke all on function public.patisgest_site_autorise(uuid) from public,anon;
grant execute on function public.patisgest_site_autorise(uuid) to authenticated,service_role;

create policy sites_attribues on public.sites as restrictive for select to authenticated
 using (public.patisgest_site_autorise(id));
do $$ declare t text; begin
 foreach t in array array['lots','mouvements','ventes','clotures','ordres_fabrication','demandes_reassort','z_imports'] loop
  execute format('create policy sites_attribues on public.%I as restrictive for all to authenticated using (public.patisgest_site_autorise(site_id)) with check (public.patisgest_site_autorise(site_id))',t);
 end loop;
end $$;
-- Une commande sans site ne peut pas être attribuée de manière sûre : seul
-- le propriétaire la voit. Les autres chemins d'accès restent à auditer.
create policy sites_attribues on public.cakes as restrictive for all to authenticated
 using (public.patisgest_site_autorise(site_id) or (site_id is null and public.patisgest_mon_role()='proprietaire'))
 with check (public.patisgest_site_autorise(site_id) or (site_id is null and public.patisgest_mon_role()='proprietaire'));
create policy sites_attribues on public.transferts as restrictive for all to authenticated
 using (public.patisgest_site_autorise(from_site_id) and public.patisgest_site_autorise(to_site_id))
 with check (public.patisgest_site_autorise(from_site_id) and public.patisgest_site_autorise(to_site_id));

-- Ces vues sont exécutées avec les droits de leur propriétaire et ne bénéficient
-- pas automatiquement des policies des tables sources. Filtrer explicitement.
do $$ declare v text; definition text; begin
 foreach v in array array['labo_lots','labo_ordres_fabrication','labo_cakes','labo_ventes_quantites'] loop
  select pg_get_viewdef(format('public.%I',v)::regclass,true) into definition;
  if definition is null then raise exception 'Vue absente : %',v; end if;
  execute format('create or replace view public.%I with (security_barrier=true) as select * from (%s) filtre where public.patisgest_site_autorise(filtre.site_id)',v,regexp_replace(definition,';\s*$',''));
 end loop;
end $$;
commit;
