-- BROUILLON : ne pas appliquer au pilote. Admission verrouillée par défaut.
-- L'interrupteur n'est modifiable que par l'administrateur de la base, jamais
-- par une RPC, le propriétaire métier ou une métadonnée Auth. Ne pas l'ouvrir
-- avant certification complète de l'isolation et répétition du déploiement.
begin;
create table public.equipe_admission_securite (
 cle boolean primary key default true check(cle),
 autorisee boolean not null default false
);
insert into public.equipe_admission_securite(cle,autorisee) values(true,false);
alter table public.equipe_admission_securite enable row level security;
revoke all on public.equipe_admission_securite from public,anon,authenticated;

alter table public.equipe_journal_acces drop constraint equipe_journal_acces_action_check;
alter table public.equipe_journal_acces add constraint equipe_journal_acces_action_check
 check(action in ('affectation','revocation','admission'));

create function public.patisgest_equipe_exiger_admission() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not coalesce((select autorisee from public.equipe_admission_securite where cle),false) then
  raise exception 'Admission indisponible.' using errcode='42501';
 end if;
end $$;
revoke all on function public.patisgest_equipe_exiger_admission() from public,anon,authenticated;

-- Appel interne uniquement ; l'identité vérifiée et les lignes de décision
-- sont verrouillées par l'appelant. Tout module est désactivé initialement ;
-- le propriétaire doit les attribuer explicitement après admission.
create function public.patisgest_equipe_creer_membre(p_client uuid,p_auth uuid,p_email text,p_nom text,p_role text,p_sites uuid[],p_source text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v uuid; m text;
begin
 if p_auth is distinct from auth.uid() or p_source not in ('demande','invitation') then raise exception 'Admission invalide.' using errcode='42501'; end if;
 if p_sites is not null and array_ndims(p_sites) is distinct from 1 then raise exception 'Sites invalides.'; end if;
 -- Empêche une suppression ou modification de type pendant l'admission.
 perform 1 from public.sites s where s.id=any(p_sites) order by s.id for share;
 perform public.patisgest_equipe_verifier_sites(p_client,p_sites,p_role);
 if exists(select 1 from public.utilisateurs where auth_user_id=p_auth) then raise exception 'Compte deja rattache.' using errcode='42501'; end if;
 insert into public.utilisateurs(auth_user_id,client_id,email,nom,role)
  values(p_auth,p_client,p_email,p_nom,p_role::public.role_utilisateur) returning id into v;
 insert into public.equipe_sites(utilisateur_id,site_id) select v,s from unnest(p_sites) s;
 foreach m in array array['stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation'] loop
  insert into public.acces_modules(utilisateur_id,module,actif) values(v,m,false);
 end loop;
 insert into public.equipe_journal_acces(client_id,acteur_auth_id,sujet_auth_id,utilisateur_id,action,details)
 values(p_client,p_auth,p_auth,v,'admission',jsonb_build_object('source',p_source,'sites',p_sites,'modules',jsonb_build_array()));
 return v;
end $$;
revoke all on function public.patisgest_equipe_creer_membre(uuid,uuid,text,text,text,uuid[],text) from public,anon,authenticated;

create function public.equipe_accepter_demande(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare d record; e text; v uuid;
begin
 perform public.patisgest_equipe_exiger_admission();
 select * into d from public.equipe_demandes where id=p_id and auth_user_id=auth.uid() and statut='approuvee' for update;
 if not found then raise exception 'Demande indisponible.' using errcode='42501'; end if;
 -- Sérier toutes les admissions du même compte et les changements d'adresse.
 select lower(trim(u.email)) into e from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null for update;
 if e is null or e is distinct from d.email then raise exception 'Demande indisponible.' using errcode='42501'; end if;
 v:=public.patisgest_equipe_creer_membre(d.client_id,auth.uid(),e,d.nom,d.role_demande,d.sites_approuves,'demande');
 update public.equipe_demandes set statut='acceptee',sites_approuves=null,approuve_le=null where id=d.id;
 return v;
end $$;
revoke all on function public.equipe_accepter_demande(uuid) from public,anon;
grant execute on function public.equipe_accepter_demande(uuid) to authenticated;

create function public.equipe_accepter_invitation(p_id uuid) returns uuid
language plpgsql security definer set search_path='' as $$
declare i record; e text; v uuid;
begin
 perform public.patisgest_equipe_exiger_admission();
 -- Ne pas révéler si une invitation appartient à une autre adresse.
 select lower(trim(u.email)) into e from auth.users u
  where u.id=auth.uid() and u.email_confirmed_at is not null and u.deleted_at is null for update;
 if e is null then raise exception 'Invitation indisponible.' using errcode='42501'; end if;
 select * into i from public.equipe_invitations
  where id=p_id and email=e and not annulee and not utilisee and expire_le>now() for update;
 if not found then raise exception 'Invitation indisponible.' using errcode='42501'; end if;
 v:=public.patisgest_equipe_creer_membre(i.client_id,auth.uid(),e,i.nom,i.role,i.sites,'invitation');
 update public.equipe_invitations set utilisee=true where id=i.id;
 return v;
end $$;
revoke all on function public.equipe_accepter_invitation(uuid) from public,anon;
grant execute on function public.equipe_accepter_invitation(uuid) to authenticated;

create function public.equipe_annuler_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 update public.equipe_invitations set annulee=true where id=p_id and client_id=c and not annulee and not utilisee;
 if not found then raise exception 'Invitation indisponible.' using errcode='42501'; end if;
end $$;
revoke all on function public.equipe_annuler_invitation(uuid) from public,anon;
grant execute on function public.equipe_annuler_invitation(uuid) to authenticated;

create function public.equipe_refuser_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare e text := public.patisgest_equipe_email_verifie();
begin
 update public.equipe_invitations set annulee=true where id=p_id and email=e and not annulee and not utilisee and expire_le>now();
 if not found then raise exception 'Invitation indisponible.' using errcode='42501'; end if;
end $$;
revoke all on function public.equipe_refuser_invitation(uuid) from public,anon;
grant execute on function public.equipe_refuser_invitation(uuid) to authenticated;
commit;
