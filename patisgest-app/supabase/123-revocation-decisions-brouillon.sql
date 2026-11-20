-- BROUILLON : empêcher qu'une décision antérieure à une révocation réactive
-- une identité Auth après changement d'adresse. Ne pas déployer au pilote.
-- Une nouvelle décision explicite du propriétaire peut être prise ensuite.
begin;
create table public.equipe_revocations (
 client_id uuid not null references public.clients(id) on delete cascade,
 auth_user_id uuid not null,
 revoque_le timestamptz not null,
 primary key(client_id,auth_user_id)
);
alter table public.equipe_revocations enable row level security;
revoke all on public.equipe_revocations from public,anon,authenticated;

create function public.patisgest_equipe_exiger_decision_recente(p_client uuid,p_cree_le timestamptz) returns void
language plpgsql volatile security definer set search_path='' as $$
declare v timestamptz;
begin
 select r.revoque_le into v from public.equipe_revocations r where r.client_id=p_client and r.auth_user_id=auth.uid();
 if p_cree_le is null or (v is not null and p_cree_le<=v) then
  raise exception 'Admission indisponible.' using errcode='42501';
 end if;
end $$;
revoke all on function public.patisgest_equipe_exiger_decision_recente(uuid,timestamptz) from public,anon,authenticated;

create or replace function public.equipe_revoquer(p_utilisateur_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); membre record; e_auth text;
begin
 select u.id,u.auth_user_id,u.email,u.role::text into membre from public.utilisateurs u
  where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 select lower(trim(u.email)) into e_auth from auth.users u where u.id=membre.auth_user_id for share;
 insert into public.equipe_revocations(client_id,auth_user_id,revoque_le)
 values(c,membre.auth_user_id,clock_timestamp())
 on conflict(client_id,auth_user_id) do update set revoque_le=excluded.revoque_le;
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

-- Les décisions devenues invalides ne doivent pas être présentées comme
-- acceptables. Le contrôle d'acceptation reste indispensable côté serveur.
create or replace function public.equipe_mes_invitations()
returns table(id uuid,etablissement text,role text,expire_le timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare e text := public.patisgest_equipe_email_verifie();
begin
 return query select i.id,c.nom,i.role,i.expire_le from public.equipe_invitations i join public.clients c on c.id=i.client_id
 where i.email=e and not i.annulee and not i.utilisee and i.expire_le>now()
 and not exists(select 1 from public.equipe_revocations r where r.client_id=i.client_id and r.auth_user_id=auth.uid() and i.cree_le<=r.revoque_le)
 order by i.cree_le desc;
end $$;
revoke all on function public.equipe_mes_invitations() from public,anon;
grant execute on function public.equipe_mes_invitations() to authenticated;

create or replace function public.equipe_mes_demandes()
returns table(id uuid,etablissement text,role_demande text,statut text,cree_le timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare e text := public.patisgest_equipe_email_verifie();
begin
 return query select d.id,c.nom,d.role_demande,d.statut,d.cree_le from public.equipe_demandes d join public.clients c on c.id=d.client_id
 where d.auth_user_id=auth.uid() and d.email=e and d.statut in ('en_attente','approuvee','refusee')
 and not exists(select 1 from public.equipe_revocations r where r.client_id=d.client_id and r.auth_user_id=auth.uid() and d.cree_le<=r.revoque_le)
 order by d.cree_le desc,d.id limit 501;
end $$;
revoke all on function public.equipe_mes_demandes() from public,anon;
grant execute on function public.equipe_mes_demandes() to authenticated;

create or replace function public.equipe_accepter_demande(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d record; e text; v uuid;
begin
 perform public.patisgest_equipe_exiger_admission();
 select * into d from public.equipe_demandes where id=p_id and auth_user_id=auth.uid() and statut='approuvee' for update;
 if not found then raise exception 'Demande indisponible.' using errcode='42501'; end if;
 select lower(trim(u.email)) into e from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null for update;
 if e is null or e is distinct from d.email then raise exception 'Demande indisponible.' using errcode='42501'; end if;
 perform public.patisgest_equipe_exiger_decision_recente(d.client_id,d.cree_le);
 v:=public.patisgest_equipe_creer_membre(d.client_id,auth.uid(),e,d.nom,d.role_demande,d.sites_approuves,'demande');
 update public.equipe_demandes set statut='acceptee',sites_approuves=null,approuve_le=null where id=d.id;
 return v;
end $$;
revoke all on function public.equipe_accepter_demande(uuid) from public,anon;
grant execute on function public.equipe_accepter_demande(uuid) to authenticated;

create or replace function public.equipe_accepter_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i record; e text; v uuid;
begin
 perform public.patisgest_equipe_exiger_admission();
 select lower(trim(u.email)) into e from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null for update;
 if e is null then raise exception 'Invitation indisponible.' using errcode='42501'; end if;
 select * into i from public.equipe_invitations
  where id=p_id and email=e and not annulee and not utilisee and expire_le>now() for update;
 if not found then raise exception 'Invitation indisponible.' using errcode='42501'; end if;
 perform public.patisgest_equipe_exiger_decision_recente(i.client_id,i.cree_le);
 v:=public.patisgest_equipe_creer_membre(i.client_id,auth.uid(),e,i.nom,i.role,i.sites,'invitation');
 update public.equipe_invitations set utilisee=true where id=i.id;
 return v;
end $$;
revoke all on function public.equipe_accepter_invitation(uuid) from public,anon;
grant execute on function public.equipe_accepter_invitation(uuid) to authenticated;
commit;
