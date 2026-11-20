-- BROUILLON : validation atomique et conservatrice des sites du réassort.
-- Ne pas appliquer au pilote : le reste de l'isolation n'est pas terminé.
begin;
-- Les UUID des références figurent dans la ligne lisible via PostgREST : ne
-- montrer aucune demande dont un lien existant sort du périmètre de l'acteur.
create function public.patisgest_reassort_liens_autorises(p_of uuid,p_transfert uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select (p_of is null or exists(select 1 from public.ordres_fabrication o
   where o.id=p_of and o.client_id=public.patisgest_mon_client() and public.patisgest_site_autorise(o.site_id)))
 and (p_transfert is null or exists(select 1 from public.transferts t
   where t.id=p_transfert and t.client_id=public.patisgest_mon_client()
     and public.patisgest_site_autorise(t.from_site_id) and public.patisgest_site_autorise(t.to_site_id)))
$$;
revoke all on function public.patisgest_reassort_liens_autorises(uuid,uuid) from public,anon;
grant execute on function public.patisgest_reassort_liens_autorises(uuid,uuid) to authenticated,service_role;
create policy reassort_liens_sites on public.demandes_reassort as restrictive for select to authenticated
 using (public.patisgest_reassort_liens_autorises(of_id,transfert_id));

create or replace function public.traiter_demandes_reassort(
 p_ids uuid[], p_statut text, p_of_id uuid default null, p_transfert_id uuid default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 v_client uuid; v_role text; demande record; r record; v_id uuid;
 v_ofs uuid[] := array[]::uuid[]; v_transferts uuid[] := array[]::uuid[];
 v_count integer := 0; v_expected integer;
begin
 perform public.patisgest_exiger_modules(array['planning','transferts']);
 select u.client_id,u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
 if v_client is null or v_role not in ('proprietaire','labo') then
  raise exception 'Role non autorise.' using errcode='42501';
 end if;
 if p_statut is null or p_statut not in ('ouverte','planifiee','transferee','annulee') then raise exception 'Statut de demande invalide.'; end if;
 if p_ids is null or cardinality(p_ids)=0 then return jsonb_build_object('updated',0); end if;
 if array_ndims(p_ids) <> 1 or array_position(p_ids,null) is not null then raise exception 'Demandes invalides.'; end if;
 select count(distinct id) into v_expected from unnest(p_ids) id;
 -- Verrouiller toutes les demandes dans un ordre stable avant de valider : pas
 -- de succès partiel et pas de changement concurrent des liens durant le test.
 for demande in select id,site_id,of_id,transfert_id from public.demandes_reassort
  where client_id=v_client and id=any(p_ids) order by id for update loop
  v_count := v_count+1;
  perform public.patisgest_exiger_site(demande.site_id);
  if demande.of_id is not null then v_ofs := array_append(v_ofs,demande.of_id); end if;
  if demande.transfert_id is not null then v_transferts := array_append(v_transferts,demande.transfert_id); end if;
 end loop;
 if v_count<>v_expected then raise exception 'Demandes hors perimetre.' using errcode='42501'; end if;
 if p_of_id is not null then v_ofs:=array_append(v_ofs,p_of_id); end if;
 if p_transfert_id is not null then v_transferts:=array_append(v_transferts,p_transfert_id); end if;
 -- Vérifier aussi les anciens liens conservés par COALESCE, pas seulement les
 -- nouveaux. Verrouiller les références jusqu'à la fin de la transaction.
 for v_id in select distinct x from unnest(v_ofs) x order by x loop
  select site_id into r from public.ordres_fabrication where id=v_id and client_id=v_client for share;
  if not found then raise exception 'Reference hors perimetre.' using errcode='42501'; end if;
  perform public.patisgest_exiger_site(r.site_id);
 end loop;
 for v_id in select distinct x from unnest(v_transferts) x order by x loop
  select from_site_id,to_site_id into r from public.transferts where id=v_id and client_id=v_client for share;
  if not found then raise exception 'Reference hors perimetre.' using errcode='42501'; end if;
  perform public.patisgest_exiger_site(r.from_site_id);
  perform public.patisgest_exiger_site(r.to_site_id);
 end loop;
 update public.demandes_reassort d set statut=p_statut,
  of_id=coalesce(p_of_id,d.of_id), transfert_id=coalesce(p_transfert_id,d.transfert_id)
  where d.client_id=v_client and d.id=any(p_ids);
 return jsonb_build_object('updated',v_count,'statut',p_statut);
end $$;
revoke all on function public.traiter_demandes_reassort(uuid[],text,uuid,uuid) from public,anon;
grant execute on function public.traiter_demandes_reassort(uuid[],text,uuid,uuid) to authenticated,service_role;
commit;
