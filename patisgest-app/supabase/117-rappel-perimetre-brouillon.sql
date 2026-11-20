-- BROUILLON : rapport de rappel filtré par rôle et module. Ne pas déployer
-- isolément : la reconstruction et les fonctions du pilote diffèrent.
-- Les sections masquées sont signalées pour éviter un faux rapport complet.
begin;
create or replace function public.rappel_lot(p_lot_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare
 r jsonb; v_role text := public.patisgest_mon_role();
 v_of boolean; v_transfert boolean; v_vente boolean; resultat jsonb;
begin
 perform public.patisgest_exiger_modules(array['tracabilite']);
 perform public.patisgest_exiger_tracabilite_sites(p_lot_id);
 if v_role not in ('proprietaire','labo','vendeur') or v_role is null then
  raise exception 'Role non autorise.' using errcode='42501';
 end if;
 r := public.patisgest_rappel_lot_interne(p_lot_id);
 if v_role='proprietaire' then return r; end if;
 v_of := public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning');
 v_transfert := public.patisgest_module_autorise('transferts');
 -- Un laboratoire ne peut lire les ventes brutes, même avec le module caisse.
 v_vente := v_role='vendeur' and public.patisgest_module_autorise('caisse');
 -- Reconstituer les champs attendus : aucun champ additionnel de la fonction
 -- historique, ni objet imbriqué caché dans un champ scalaire, ne doit passer.
 resultat := jsonb_build_object(
  'lot', (select jsonb_object_agg(e.key,e.value) from jsonb_each(r->'lot') e
    where e.key in ('id','numero','code','nom','dlc','site_id','bloque','bloque_motif')
    and jsonb_typeof(e.value) in ('string','boolean','null')),
  'of_producteur', case when v_of and jsonb_typeof(r->'of_producteur')='object' then
    (select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(r->'of_producteur') e
     where e.key in ('numero','statut') and jsonb_typeof(e.value) in ('string','null')) else null end,
  'of_consigneurs', case when v_of then (select coalesce(jsonb_agg(jsonb_build_object(
    'numero',case when jsonb_typeof(x->'numero')='string' then x->'numero' end,
    'statut',case when jsonb_typeof(x->'statut')='string' then x->'statut' end)),'[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(r->'of_consigneurs')='array' then r->'of_consigneurs' else '[]'::jsonb end) x) else '[]'::jsonb end,
  'transferts', case when v_transfert then (select coalesce(jsonb_agg(jsonb_build_object(
    'ref',case when jsonb_typeof(x->'ref')='string' then x->'ref' end,
    'direction',case when jsonb_typeof(x->'direction')='string' then x->'direction' end)),'[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(r->'transferts')='array' then r->'transferts' else '[]'::jsonb end) x) else '[]'::jsonb end,
  'descendants', (select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(case when jsonb_typeof(x)='object' then x else '{}'::jsonb end) e
    where e.key in ('id','numero','code','nom','dlc','site_id','bloque') and jsonb_typeof(e.value) in ('string','boolean','null'))),'[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(r->'descendants')='array' then r->'descendants' else '[]'::jsonb end) x),
  'ventes', case when v_vente then (select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(case when jsonb_typeof(x)='object' then x else '{}'::jsonb end) e
    where (e.key in ('ticket','date_vente','site_id') and jsonb_typeof(e.value) in ('string','null')) or (e.key='total_ht' and jsonb_typeof(e.value) in ('number','null')))),'[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(r->'ventes')='array' then r->'ventes' else '[]'::jsonb end) x) else '[]'::jsonb end,
  'ventes_descendants', case when v_vente then (select coalesce(jsonb_agg((select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) from jsonb_each(case when jsonb_typeof(x)='object' then x else '{}'::jsonb end) e
    where (e.key in ('ticket','date_vente','code','nom') and jsonb_typeof(e.value) in ('string','null')) or (e.key='total_ht' and jsonb_typeof(e.value) in ('number','null')))),'[]'::jsonb)
    from jsonb_array_elements(case when jsonb_typeof(r->'ventes_descendants')='array' then r->'ventes_descendants' else '[]'::jsonb end) x) else '[]'::jsonb end,
  'sections_masquees', jsonb_build_object('ventes',not v_vente,'ordres',not v_of,'transferts',not v_transfert)
 );
 return resultat;
end $$;
revoke all on function public.rappel_lot(uuid) from public,anon;
grant execute on function public.rappel_lot(uuid) to authenticated,service_role;
commit;
