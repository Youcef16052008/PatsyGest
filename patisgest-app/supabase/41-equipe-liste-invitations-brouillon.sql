-- BROUILLON : liste de gestion propriétaire pour l'interface d'équipe.
-- Ne pas déployer avant certification ; ne délivre ni notification ni accès.
begin;
create function public.equipe_lister_invitations()
returns table(id uuid,email text,nom text,role text,sites uuid[],expire_le timestamptz,cree_le timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 return query select i.id,i.email,i.nom,i.role,i.sites,i.expire_le,i.cree_le
 from public.equipe_invitations i
 where i.client_id=c and not i.annulee and not i.utilisee
 order by i.cree_le desc,i.id limit 501;
end $$;
revoke all on function public.equipe_lister_invitations() from public,anon;
grant execute on function public.equipe_lister_invitations() to authenticated;
commit;
