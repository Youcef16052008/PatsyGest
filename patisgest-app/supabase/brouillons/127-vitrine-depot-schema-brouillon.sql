-- BROUILLON : corriger le décalage entre la migration vitrine du dépôt et la
-- définition actuellement observée sur le pilote. La première sélectionnait
-- s.nom dans v_site, mais lisait ensuite v_site.subdomain : le dépôt public
-- échouait à l'exécution. Ne rien appliquer sans réconciliation de main et
-- vérification du corps effectivement installé ; aucun changement si absent.
begin;
do $migration$
declare definition text; corrigee text;
begin
 if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is not null then
  select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure) into definition;
  if position('select s.id, s.client_id, s.nom' in definition)>0 then
   if length(definition)-length(replace(definition,'select s.id, s.client_id, s.nom','')) <> length('select s.id, s.client_id, s.nom') then
    raise exception 'Selection vitrine ambigue : audit manuel requis.';
   end if;
   corrigee := replace(definition,'select s.id, s.client_id, s.nom','select s.id, s.client_id, s.subdomain');
   if corrigee=definition then raise exception 'Correction du depot vitrine impossible.'; end if;
   execute corrigee;
  elsif position('select s.id, s.client_id, s.subdomain' in definition)=0 then
   raise exception 'Definition du depot vitrine inattendue : audit manuel requis.';
  end if;
 end if;
end $migration$;
commit;
