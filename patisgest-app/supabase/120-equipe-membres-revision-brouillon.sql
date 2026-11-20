-- BROUILLON : interface équipe, protection contre les formulaires périmés.
-- Ne pas déployer avant certification et comparaison avec le catalogue pilote.
-- Les opérations métier restent celles des migrations 23 et 36 ; un compteur
-- sérialise les chemins applicatifs de modification des modules/affectations.
begin;
alter table public.utilisateurs add column equipe_revision bigint not null default 0;

alter function public.modifier_acces_module(uuid,text,boolean) rename to patisgest_modifier_module_interne;
revoke all on function public.patisgest_modifier_module_interne(uuid,text,boolean) from public,anon,authenticated,service_role;
create function public.modifier_acces_module(p_utilisateur_id uuid,p_module text,p_actif boolean) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 perform 1 from public.utilisateurs u where u.id=p_utilisateur_id and u.client_id=c for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 perform public.patisgest_modifier_module_interne(p_utilisateur_id,p_module,p_actif);
 update public.utilisateurs set equipe_revision=equipe_revision+1 where id=p_utilisateur_id;
end $$;
revoke all on function public.modifier_acces_module(uuid,text,boolean) from public,anon;
grant execute on function public.modifier_acces_module(uuid,text,boolean) to authenticated,service_role;

alter function public.equipe_modifier_affectations(uuid,uuid[],text[]) rename to patisgest_modifier_affectations_interne;
revoke all on function public.patisgest_modifier_affectations_interne(uuid,uuid[],text[]) from public,anon,authenticated,service_role;
create function public.equipe_modifier_affectations(p_utilisateur_id uuid,p_sites uuid[],p_modules text[]) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 perform 1 from public.utilisateurs u where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 -- Les changements simultanés de type ou suppression ne peuvent pas
 -- interférer avec la vérification puis l'insertion des sites.
 perform 1 from public.sites s where s.id=any(p_sites) order by s.id for share;
 perform public.patisgest_modifier_affectations_interne(p_utilisateur_id,p_sites,p_modules);
 update public.utilisateurs set equipe_revision=equipe_revision+1 where id=p_utilisateur_id;
end $$;
revoke all on function public.equipe_modifier_affectations(uuid,uuid[],text[]) from public,anon;
grant execute on function public.equipe_modifier_affectations(uuid,uuid[],text[]) to authenticated;

create function public.equipe_lister_membres()
returns table(id uuid,nom text,email text,role text,sites uuid[],modules_desactives text[],revision text)
language plpgsql stable security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire();
begin
 return query select u.id,u.nom,u.email,u.role::text,
  coalesce((select array_agg(es.site_id order by es.site_id) from public.equipe_sites es where es.utilisateur_id=u.id),array[]::uuid[]),
  coalesce((select array_agg(a.module order by a.module) from public.acces_modules a where a.utilisateur_id=u.id and not a.actif),array[]::text[]),
  u.equipe_revision::text
 from public.utilisateurs u where u.client_id=c and u.role in ('labo','vendeur')
 order by u.nom,u.id limit 501;
end $$;
revoke all on function public.equipe_lister_membres() from public,anon;
grant execute on function public.equipe_lister_membres() to authenticated;

create function public.equipe_modifier_affectations_versionnees(p_utilisateur_id uuid,p_revision bigint,p_sites uuid[],p_modules text[]) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); v bigint;
begin
 select u.equipe_revision into v from public.utilisateurs u
 where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 if p_revision is null or p_revision<>v then raise exception 'Affectations modifiees : rechargez la liste.'; end if;
 perform public.equipe_modifier_affectations(p_utilisateur_id,p_sites,p_modules);
end $$;
revoke all on function public.equipe_modifier_affectations_versionnees(uuid,bigint,uuid[],text[]) from public,anon;
grant execute on function public.equipe_modifier_affectations_versionnees(uuid,bigint,uuid[],text[]) to authenticated;

create function public.equipe_revoquer_versionne(p_utilisateur_id uuid,p_revision bigint) returns void
language plpgsql security definer set search_path='' as $$
declare c uuid := public.patisgest_equipe_proprietaire(); v bigint;
begin
 select u.equipe_revision into v from public.utilisateurs u
 where u.id=p_utilisateur_id and u.client_id=c and u.role in ('labo','vendeur') for update;
 if not found then raise exception 'Compte introuvable.' using errcode='42501'; end if;
 if p_revision is null or p_revision<>v then raise exception 'Affectations modifiees : rechargez la liste.'; end if;
 perform public.equipe_revoquer(p_utilisateur_id);
end $$;
revoke all on function public.equipe_revoquer_versionne(uuid,bigint) from public,anon;
grant execute on function public.equipe_revoquer_versionne(uuid,bigint) to authenticated;
commit;
