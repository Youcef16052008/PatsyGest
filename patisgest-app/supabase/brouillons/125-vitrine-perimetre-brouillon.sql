-- BROUILLON de compatibilité avec la vitrine ajoutée indépendamment au pilote.
-- Ne pas appliquer avant rapprochement de main, audit complet des nouvelles
-- fonctions/vues et répétition sur une copie représentative du pilote.
-- La RPC vitrine traite un cake sous SECURITY DEFINER et ignore la RLS : elle
-- doit vérifier elle-même le module et le périmètre du devis verrouillé.
-- Le bootstrap historique sans vitrine reste testable ; l'absence de la RPC
-- ne signifie pas que la fonctionnalité vitrine est sécurisée ou installée.
begin;
do $migration$
begin
 if to_regprocedure('public.patisgest_traiter_demande(uuid,text)') is not null then
  if to_regprocedure('public.patisgest_traiter_demande_interne(uuid,text)') is not null then
   raise exception 'Fonction interne vitrine deja presente : migration interrompue.';
  end if;
  alter function public.patisgest_traiter_demande(uuid,text) rename to patisgest_traiter_demande_interne;
  revoke all on function public.patisgest_traiter_demande_interne(uuid,text) from public,anon,authenticated,service_role;
  execute $ddl$
   create function public.patisgest_traiter_demande(p_id uuid,p_decision text) returns jsonb
   language plpgsql security definer set search_path='' as $body$
   begin
    perform public.patisgest_exiger_modules(array['cake-design']);
    perform public.patisgest_exiger_cake(p_id);
    return public.patisgest_traiter_demande_interne(p_id,p_decision);
   end $body$
  $ddl$;
  revoke all on function public.patisgest_traiter_demande(uuid,text) from public,anon;
  grant execute on function public.patisgest_traiter_demande(uuid,text) to authenticated,service_role;
 end if;
end $migration$;
commit;
