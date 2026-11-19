-- BROUILLON : ne pas divulguer un OF d'un autre site via client_ref.
-- L'idempotence est vérifiée AVANT de renvoyer les données ; toute erreur
-- annule l'éventuelle création dans la même transaction.
begin;
alter function public.creer_of(uuid,uuid,numeric,date,text) rename to patisgest_creer_of_interne;
revoke all on function public.patisgest_creer_of_interne(uuid,uuid,numeric,date,text) from public,anon,authenticated;
create function public.creer_of(p_version_id uuid,p_site_id uuid,p_qte_prevue numeric,p_date_prevue date,p_client_ref text default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb; o record;
begin
 perform public.patisgest_exiger_modules(array['production']);
 perform public.patisgest_exiger_site(p_site_id);
 r:=public.patisgest_creer_of_interne(p_version_id,p_site_id,p_qte_prevue,p_date_prevue,p_client_ref);
 select id,site_id,version_id,qte_prevue,date_prevue into o from public.ordres_fabrication
  where id=(r->>'of_id')::uuid and client_id=public.patisgest_mon_client() for share;
 if not found then raise exception 'Reference OF invalide.' using errcode='42501'; end if;
 -- Refuser une collision sans retourner numéro, besoins, identifiant ou site.
 if o.site_id is distinct from p_site_id or o.version_id is distinct from p_version_id
    or o.qte_prevue is distinct from round(p_qte_prevue,4) or o.date_prevue is distinct from p_date_prevue then
  raise exception 'Reference OF deja utilisee avec d autres donnees.' using errcode='42501';
 end if;
 perform public.patisgest_exiger_site(o.site_id);
 return r;
end $$;
revoke all on function public.creer_of(uuid,uuid,numeric,date,text) from public,anon;
grant execute on function public.creer_of(uuid,uuid,numeric,date,text) to authenticated,service_role;
commit;
