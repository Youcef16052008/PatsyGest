-- BROUILLON phase 3 : enregistrer une approbation et des sites, SANS créer
-- d'utilisateur métier ni activer l'accès. Ne pas déployer au pilote.
begin;
alter table public.equipe_demandes drop constraint equipe_demandes_statut_check;
alter table public.equipe_demandes add constraint equipe_demandes_statut_check
 check(statut in ('en_attente','refusee','approuvee','acceptee'));
alter table public.equipe_demandes add column sites_approuves uuid[];
alter table public.equipe_demandes add column approuve_le timestamptz;
alter table public.equipe_demandes add constraint equipe_approbation_coherente check (
 (statut='approuvee' and sites_approuves is not null and cardinality(sites_approuves)>0 and approuve_le is not null)
 or (statut<>'approuvee' and sites_approuves is null and approuve_le is null)
);

create function public.equipe_approuver_demande(p_id uuid,p_sites uuid[]) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); d record; adresse text;
begin
 -- Verrouillage pour empêcher deux décisions concurrentes sur une demande.
 select id,auth_user_id,email,role_demande into d from public.equipe_demandes
  where id=p_id and client_id=c and statut='en_attente' for update;
 if not found then raise exception 'Demande introuvable.' using errcode='42501'; end if;
 if p_sites is not null and array_ndims(p_sites) is distinct from 1 then raise exception 'Sites invalides.'; end if;
 perform public.patisgest_equipe_verifier_sites(c,p_sites,d.role_demande);
 -- Re-vérifier l'identité Auth, pas les métadonnées ni une adresse fournie par
 -- le propriétaire. À vérifier encore à l'activation future.
 select lower(trim(u.email)) into adresse from auth.users u
  where u.id=d.auth_user_id and u.email_confirmed_at is not null and u.deleted_at is null for share;
 if adresse is distinct from d.email or exists(select 1 from public.utilisateurs u where u.auth_user_id=d.auth_user_id) then
  raise exception 'Demande devenue invalide.' using errcode='42501';
 end if;
 update public.equipe_demandes set statut='approuvee',sites_approuves=p_sites,approuve_le=now() where id=d.id;
end $$;
revoke all on function public.equipe_approuver_demande(uuid,uuid[]) from public,anon;
grant execute on function public.equipe_approuver_demande(uuid,uuid[]) to authenticated;

create function public.equipe_annuler_approbation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 update public.equipe_demandes set statut='refusee',sites_approuves=null,approuve_le=null
  where id=p_id and client_id=c and statut='approuvee';
 if not found then raise exception 'Demande introuvable.' using errcode='42501'; end if;
end $$;
revoke all on function public.equipe_annuler_approbation(uuid) from public,anon;
grant execute on function public.equipe_annuler_approbation(uuid) to authenticated;

create function public.equipe_lister_approbations()
returns table(id uuid,email text,nom text,role_demande text,sites uuid[],approuve_le timestamptz)
language plpgsql stable security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 return query select d.id,d.email,d.nom,d.role_demande,d.sites_approuves,d.approuve_le
  from public.equipe_demandes d where d.client_id=c and d.statut='approuvee' order by d.approuve_le,d.id;
end $$;
revoke all on function public.equipe_lister_approbations() from public,anon;
grant execute on function public.equipe_lister_approbations() to authenticated;
commit;
