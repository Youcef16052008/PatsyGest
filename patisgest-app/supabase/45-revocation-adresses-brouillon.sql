-- BROUILLON : une adresse Auth peut avoir changé après l'adhésion. À la
-- révocation, annuler les invitations anciennes associées aux deux adresses.
-- Ne couvre pas encore toutes les courses avec une invitation créée en même
-- temps ni le changement Auth après le verrou ; ne pas déployer isolément.
begin;
create or replace function public.equipe_revoquer(p_utilisateur_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); membre record; e_auth text;
begin
 select u.id,u.auth_user_id,u.email,u.role::text into membre from public.utilisateurs u
  where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 -- Lire et verrouiller l'identité courante : l'email métier peut être périmé.
 -- Même une adresse non encore confirmée est neutralisée par prudence.
 select lower(trim(u.email)) into e_auth from auth.users u where u.id=membre.auth_user_id for share;
 update public.equipe_demandes set statut='refusee',sites_approuves=null,approuve_le=null
  where client_id=c and auth_user_id=membre.auth_user_id and statut in ('en_attente','approuvee');
 update public.equipe_invitations set annulee=true
  where client_id=c and not annulee and not utilisee
   and (lower(trim(email))=lower(trim(membre.email)) or lower(trim(email))=e_auth);
 insert into public.equipe_journal_acces(client_id,acteur_auth_id,sujet_auth_id,utilisateur_id,action,details)
 values(c,auth.uid(),membre.auth_user_id,membre.id,'revocation',jsonb_build_object('role',membre.role));
 delete from public.utilisateurs where id=membre.id;
end $$;
revoke all on function public.equipe_revoquer(uuid) from public,anon;
grant execute on function public.equipe_revoquer(uuid) to authenticated;
commit;
