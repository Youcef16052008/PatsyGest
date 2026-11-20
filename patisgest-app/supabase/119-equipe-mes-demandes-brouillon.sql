-- BROUILLON : visibilité des demandes par leur auteur authentifié et vérifié.
-- Ne déploie ni n'ouvre le verrou d'admission.
begin;
create function public.equipe_mes_demandes()
returns table(id uuid,etablissement text,role_demande text,statut text,cree_le timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare e text := public.patisgest_equipe_email_verifie();
begin
 return query select d.id,c.nom,d.role_demande,d.statut,d.cree_le
 from public.equipe_demandes d join public.clients c on c.id=d.client_id
 where d.auth_user_id=auth.uid() and d.email=e and d.statut in ('en_attente','approuvee','refusee')
 order by d.cree_le desc,d.id limit 501;
end $$;
revoke all on function public.equipe_mes_demandes() from public,anon;
grant execute on function public.equipe_mes_demandes() to authenticated;
commit;
