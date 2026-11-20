-- BROUILLON PHASE 3 : ne pas déployer au pilote. N'active aucun compte.
-- Les contrôles et le journal s'appliquent à des membres existants seulement.
-- Une révocation retire l'adhésion et les affectations, pas le compte Auth.
-- Les requêtes déjà en cours peuvent conserver un ancien snapshot PostgreSQL.
begin;
create table public.equipe_journal_acces (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.clients(id) on delete cascade,
 acteur_auth_id uuid not null,
 sujet_auth_id uuid not null,
 utilisateur_id uuid not null,
 action text not null check(action in ('affectation','revocation')),
 details jsonb not null default '{}'::jsonb,
 cree_le timestamptz not null default now()
);
alter table public.equipe_journal_acces enable row level security;
revoke all on public.equipe_journal_acces from public,anon,authenticated;

create function public.equipe_modifier_affectations(p_utilisateur_id uuid,p_sites uuid[],p_modules text[]) returns void
language plpgsql security definer set search_path='' as $$
declare
 c uuid := public.patisgest_equipe_proprietaire(); membre record; m text;
 tous constant text[] := array['stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation'];
begin
 -- Verrouiller le membre pour sérialiser modifications et révocation.
 select u.id,u.auth_user_id,u.role::text into membre from public.utilisateurs u
  where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 if p_sites is not null and array_ndims(p_sites) is distinct from 1 then raise exception 'Sites invalides.'; end if;
 perform public.patisgest_equipe_verifier_sites(c,p_sites,membre.role);
 if p_modules is null or cardinality(p_modules)>cardinality(tous)
    or (cardinality(p_modules)>0 and array_ndims(p_modules) is distinct from 1)
    or array_position(p_modules,null) is not null
    or exists(select 1 from unnest(p_modules) x where not x=any(tous))
    or (select count(distinct x) from unnest(p_modules) x)<>cardinality(p_modules) then
  raise exception 'Modules invalides.';
 end if;
 -- Tout module non explicitement choisi est désactivé. Ne confère jamais
 -- un droit supérieur à ceux du rôle : les autres contrôles restent requis.
 delete from public.equipe_sites where utilisateur_id=membre.id;
 insert into public.equipe_sites(utilisateur_id,site_id) select membre.id,s from unnest(p_sites) s;
 delete from public.acces_modules where utilisateur_id=membre.id;
 foreach m in array tous loop
  if not m=any(p_modules) then
   insert into public.acces_modules(utilisateur_id,module,actif) values(membre.id,m,false);
  end if;
 end loop;
 insert into public.equipe_journal_acces(client_id,acteur_auth_id,sujet_auth_id,utilisateur_id,action,details)
 values(c,auth.uid(),membre.auth_user_id,membre.id,'affectation',jsonb_build_object('sites',p_sites,'modules',p_modules));
end $$;
revoke all on function public.equipe_modifier_affectations(uuid,uuid[],text[]) from public,anon;
grant execute on function public.equipe_modifier_affectations(uuid,uuid[],text[]) to authenticated;

create function public.equipe_revoquer(p_utilisateur_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); membre record;
begin
 select u.id,u.auth_user_id,u.email,u.role::text into membre from public.utilisateurs u
  where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 -- Neutraliser les décisions/invitations en attente pour ce membre dans cet
 -- établissement : la révocation ne doit pas réactiver une ancienne invitation.
 update public.equipe_demandes set statut='refusee',sites_approuves=null,approuve_le=null
  where client_id=c and auth_user_id=membre.auth_user_id and statut in ('en_attente','approuvee');
 update public.equipe_invitations set annulee=true
  where client_id=c and lower(email)=lower(trim(membre.email)) and not annulee and not utilisee;
 insert into public.equipe_journal_acces(client_id,acteur_auth_id,sujet_auth_id,utilisateur_id,action,details)
 values(c,auth.uid(),membre.auth_user_id,membre.id,'revocation',jsonb_build_object('role',membre.role));
 -- Toutes les policies et fonctions de ce prototype consultent l'adhésion.
 -- La suppression est atomique ; une FK imprévue doit faire échouer le tout.
 delete from public.utilisateurs where id=membre.id;
end $$;
revoke all on function public.equipe_revoquer(uuid) from public,anon;
grant execute on function public.equipe_revoquer(uuid) to authenticated;
commit;
