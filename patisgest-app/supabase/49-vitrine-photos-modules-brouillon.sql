-- BROUILLON : adaptation au catalogue vitrine apparu sur le pilote.
-- Ne pas déployer avant audit des données et de toutes les surfaces vitrine.
-- Les policies du pilote ne vérifient pas que famille_id appartient au tenant,
-- et certaines RPC SECURITY DEFINER ne consultent pas les droits de modules.
begin;
do $migration$
begin
 if to_regclass('public.vitrine_photos') is not null then
  -- Une photo modifiée ne peut viser qu'une famille visible du même client.
  -- La sous-requête respecte aussi la RLS des familles pour l'appelant.
  execute $policy$create policy vitrine_photos_insert_garde on public.vitrine_photos as restrictive for insert to authenticated
   with check (public.patisgest_module_autorise('recettes') and exists
    (select 1 from public.recette_familles f where f.id=vitrine_photos.famille_id and f.client_id=vitrine_photos.client_id))$policy$;
  execute $policy$create policy vitrine_photos_update_garde on public.vitrine_photos as restrictive for update to authenticated
   using (public.patisgest_module_autorise('recettes')) with check (public.patisgest_module_autorise('recettes') and exists
    (select 1 from public.recette_familles f where f.id=vitrine_photos.famille_id and f.client_id=vitrine_photos.client_id))$policy$;
  execute $policy$create policy vitrine_photos_delete_garde on public.vitrine_photos as restrictive for delete to authenticated
   using (public.patisgest_module_autorise('recettes'))$policy$;
 end if;
 if to_regprocedure('public.patisgest_enregistrer_fiche_vitrine(uuid,boolean,text,text,text,integer)') is not null then
  if to_regprocedure('public.patisgest_enregistrer_fiche_vitrine_interne(uuid,boolean,text,text,text,integer)') is not null then
   raise exception 'Fonction interne fiche vitrine deja presente.';
  end if;
  alter function public.patisgest_enregistrer_fiche_vitrine(uuid,boolean,text,text,text,integer) rename to patisgest_enregistrer_fiche_vitrine_interne;
  revoke all on function public.patisgest_enregistrer_fiche_vitrine_interne(uuid,boolean,text,text,text,integer) from public,anon,authenticated,service_role;
  execute $ddl$create function public.patisgest_enregistrer_fiche_vitrine(p_famille_id uuid,p_visible boolean,p_nom_vitrine text,p_description text,p_photo text,p_ordre integer)
   returns jsonb language plpgsql security definer set search_path='' as $body$
   begin
    perform public.patisgest_exiger_modules(array['recettes']);
    return public.patisgest_enregistrer_fiche_vitrine_interne(p_famille_id,p_visible,p_nom_vitrine,p_description,p_photo,p_ordre);
   end $body$$ddl$;
  revoke all on function public.patisgest_enregistrer_fiche_vitrine(uuid,boolean,text,text,text,integer) from public,anon;
  grant execute on function public.patisgest_enregistrer_fiche_vitrine(uuid,boolean,text,text,text,integer) to authenticated,service_role;
 end if;
 if to_regprocedure('public.patisgest_supprimer_recette(uuid)') is not null then
  if to_regprocedure('public.patisgest_supprimer_recette_interne(uuid)') is not null then
   raise exception 'Fonction interne suppression recette deja presente.';
  end if;
  alter function public.patisgest_supprimer_recette(uuid) rename to patisgest_supprimer_recette_interne;
  revoke all on function public.patisgest_supprimer_recette_interne(uuid) from public,anon,authenticated,service_role;
  execute $ddl$create function public.patisgest_supprimer_recette(p_famille_id uuid)
   returns jsonb language plpgsql security definer set search_path='' as $body$
   begin
    perform public.patisgest_exiger_modules(array['recettes']);
    return public.patisgest_supprimer_recette_interne(p_famille_id);
   end $body$$ddl$;
  revoke all on function public.patisgest_supprimer_recette(uuid) from public,anon;
  grant execute on function public.patisgest_supprimer_recette(uuid) to authenticated,service_role;
 end if;
end $migration$;
commit;
