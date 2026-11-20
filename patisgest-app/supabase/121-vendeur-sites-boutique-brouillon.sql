-- BROUILLON : appliquer à chaque accès la même règle que l'affectation :
-- un vendeur ne peut utiliser qu'une boutique qui lui est attribuée.
-- Les anciennes affectations et changements de type doivent être audités ;
-- cette restriction peut bloquer des comptes existants. Ne pas déployer seul.
begin;
create or replace function public.patisgest_site_autorise(p_site uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.utilisateurs u join public.sites s on s.id=p_site and s.client_id=u.client_id
  where u.auth_user_id=auth.uid() and (
   u.role='proprietaire' or
   (u.role in ('labo','vendeur') and (u.role<>'vendeur' or s.type='boutique') and exists(
     select 1 from public.equipe_sites a where a.utilisateur_id=u.id and a.site_id=s.id
   ))
  )
 )
$$;
revoke all on function public.patisgest_site_autorise(uuid) from public,anon;
grant execute on function public.patisgest_site_autorise(uuid) to authenticated,service_role;
commit;
