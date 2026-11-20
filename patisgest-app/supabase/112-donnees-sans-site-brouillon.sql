-- BROUILLON : limitation provisoire des données à portée indéterminée.
-- Les commandes d'achat, journaux qualité et tâches n'ont pas de site fiable.
-- Un employé doit avoir tous les sites pour y accéder ; le propriétaire y a
-- accès. Ne pas déployer sans interface indiquant clairement la limitation.
begin;
create function public.patisgest_tous_sites_autorises() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select case when u.role='proprietaire' then true else
   exists(select 1 from public.sites s where s.client_id=u.client_id)
   and not exists(select 1 from public.sites s where s.client_id=u.client_id and not public.patisgest_site_autorise(s.id)) end
  from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1),false)
$$;
revoke all on function public.patisgest_tous_sites_autorises() from public,anon;
grant execute on function public.patisgest_tous_sites_autorises() to authenticated,service_role;

create function public.patisgest_exiger_tous_sites() returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.patisgest_tous_sites_autorises() then
  raise exception 'Acces indisponible sans attribution de tous les sites.' using errcode='42501';
 end if;
end $$;
revoke all on function public.patisgest_exiger_tous_sites() from public,anon,authenticated;

do $$ declare t text; begin
 foreach t in array array['bons_commande','nettoyages','non_conformites','releve_temperatures','taches_planning'] loop
  execute format('create policy perimetre_indetermine on public.%I as restrictive for all to authenticated using (public.patisgest_tous_sites_autorises()) with check (public.patisgest_tous_sites_autorises())',t);
 end loop;
end $$;

-- La vue propriétaire contourne RLS : ajouter la même restriction explicite.
do $$ declare definition text; begin
 select pg_get_viewdef('public.labo_bons_commande'::regclass,true) into definition;
 if definition is null then raise exception 'Vue labo_bons_commande absente'; end if;
 execute format('create or replace view public.labo_bons_commande with (security_barrier=true) as select * from (%s) filtre where public.patisgest_tous_sites_autorises()',regexp_replace(definition,';\s*$',''));
end $$;

-- Les RPC SECURITY DEFINER ne respectent pas les policies de leurs tables.
do $$ declare x record; f record; def text; n integer; begin
 for x in select * from (values ('creer_commande','achats'),('recevoir_commande','achats'),('maj_non_conformite','qualite')) as v(nom,module) loop
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  if n<>1 then raise exception 'RPC absente ou ambigue : %',x.nom; end if;
  select pg_get_functiondef(p.oid) src into f from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  def:=regexp_replace(f.src,E'\\mbegin\\M',format('begin perform public.patisgest_exiger_modules(array[%L]); perform public.patisgest_exiger_tous_sites();',x.module),'i');
  if def=f.src then raise exception 'Garde impossible : %',x.nom; end if;
  execute def;
 end loop;
end $$;
commit;
