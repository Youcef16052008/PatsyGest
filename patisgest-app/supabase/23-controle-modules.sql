-- BROUILLON : NE PAS DEPLOYER. Couverture, compatibilite et parcours labo non valides.
-- Accès par compte : l'absence de ligne conserve les droits habituels du rôle.
-- Le réglage n'accorde jamais de nouveaux privilèges de rôle.
begin;
create table if not exists public.acces_modules (
  utilisateur_id uuid not null references public.utilisateurs(id) on delete cascade,
  module text not null check(module in ('stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation')),
  actif boolean not null,
  primary key(utilisateur_id,module)
);
alter table public.acces_modules enable row level security;
revoke all on public.acces_modules from public, anon, authenticated;

create or replace function public.patisgest_module_autorise(p_module text)
returns boolean language sql stable security definer set search_path='' as $$
  select coalesce((select coalesce(a.actif,true) from public.utilisateurs u
    left join public.acces_modules a on a.utilisateur_id=u.id and a.module=p_module
    where u.auth_user_id=auth.uid() limit 1),false)
$$;
revoke all on function public.patisgest_module_autorise(text) from public,anon;
grant execute on function public.patisgest_module_autorise(text) to authenticated,service_role;

create or replace function public.patisgest_exiger_modules(p_modules text[])
returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(select 1 from unnest(p_modules) m where public.patisgest_module_autorise(m)) then
    raise exception 'Module desactive pour ce compte.' using errcode='42501';
  end if;
end $$;
revoke all on function public.patisgest_exiger_modules(text[]) from public,anon;
grant execute on function public.patisgest_exiger_modules(text[]) to authenticated,service_role;

create or replace function public.mes_modules_desactives()
returns text[] language sql stable security definer set search_path='' as $$
  select coalesce(array_agg(a.module order by a.module),array[]::text[])
  from public.utilisateurs u join public.acces_modules a on a.utilisateur_id=u.id
  where u.auth_user_id=auth.uid() and not a.actif
$$;
revoke all on function public.mes_modules_desactives() from public,anon;
grant execute on function public.mes_modules_desactives() to authenticated,service_role;

create or replace function public.lister_acces_modules()
returns table(utilisateur_id uuid,nom text,role text,modules_desactives text[])
language plpgsql stable security definer set search_path='' as $$
declare client uuid; r text;
begin
 select u.client_id,u.role::text into client,r from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
 if client is null or r is distinct from 'proprietaire' then raise exception 'Reserve au proprietaire.' using errcode='42501'; end if;
 return query select u.id,u.nom::text,u.role::text,coalesce(array_agg(a.module order by a.module) filter(where not a.actif),array[]::text[])
  from public.utilisateurs u left join public.acces_modules a on a.utilisateur_id=u.id where u.client_id=client group by u.id,u.nom,u.role order by u.nom,u.id;
end $$;
revoke all on function public.lister_acces_modules() from public,anon;
grant execute on function public.lister_acces_modules() to authenticated,service_role;

create or replace function public.modifier_acces_module(p_utilisateur_id uuid,p_module text,p_actif boolean)
returns void language plpgsql security definer set search_path='' as $$
declare client uuid; r text;
begin
 select u.client_id,u.role::text into client,r from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
 if client is null or r is distinct from 'proprietaire' then raise exception 'Reserve au proprietaire.' using errcode='42501'; end if;
 if p_module not in ('stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation') or p_module is null or p_actif is null then raise exception 'Parametre invalide.'; end if;
 if not exists(select 1 from public.utilisateurs u where u.id=p_utilisateur_id and u.client_id=client) then raise exception 'Compte introuvable.'; end if;
 if p_actif then delete from public.acces_modules where utilisateur_id=p_utilisateur_id and module=p_module;
 else insert into public.acces_modules(utilisateur_id,module,actif) values(p_utilisateur_id,p_module,false) on conflict(utilisateur_id,module) do update set actif=false; end if;
end $$;
revoke all on function public.modifier_acces_module(uuid,text,boolean) from public,anon;
grant execute on function public.modifier_acces_module(uuid,text,boolean) to authenticated,service_role;

-- Les RPC SECURITY DEFINER contournent RLS : ajouter une garde au début de
-- chaque fonction existante, sans modifier son corps métier ni sa signature.
-- Ne jamais ignorer une fonction absente ou déjà instrumentée.
do $$
declare x record; f record; def text; injected text; n integer;
begin
 for x in select * from (values
 ('creer_famille','recettes'),('creer_version','recettes'),('activer_version','recettes'),
 ('creer_of','production'),('demarrer_of','production'),('terminer_of','production'),
 ('creer_cake','cake-design'),('creer_cake_production','cake-design'),('affecter_production_cake','cake-design'),('cake_options_production','cake-design'),('cake_liens_production','cake-design'),('evoluer_cake','cake-design'),('editer_cake','cake-design'),('accepter_cgv','cake-design'),
 ('vendre_article','caisse'),('vendre_panier','caisse'),('importer_z','caisse'),
 ('creer_commande','achats'),('recevoir_commande','achats'),('receptionner_lot','stocks|achats'),
 ('creer_demande_reassort','planning'),('traiter_demandes_reassort','planning|transferts'),('transferer_article','transferts'),
 ('saisir_cloture','cloture'),('maj_non_conformite','qualite'),('rappel_lot','tracabilite'),('bloquer_lot','tracabilite'),('simuler_recette','simulation|recettes')
 ) as t(nom,modules) loop
   select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
    where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
   if n <> 1 then raise exception 'Signature RPC ambiguë ou absente : % (%)',x.nom,n; end if;
   select p.oid, pg_get_functiondef(p.oid) as src into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=x.nom and p.prosecdef limit 1;
   if not found then raise exception 'RPC absente : %',x.nom; end if;
   def:=f.src;
   if position('patisgest_exiger_modules' in def)>0 then continue; end if;
   injected:=regexp_replace(def, E'\\mbegin\\M', format('begin perform public.patisgest_exiger_modules(string_to_array(%L, %L));', x.modules,'|'), 'i');
   if injected=def then raise exception 'Garde impossible sur RPC %',x.nom; end if;
   execute injected;
 end loop;
end $$;

-- La restauration contourne RLS et peut réécrire tous les modules. Elle ne
-- doit pas permettre de contourner un module désactivé pour le propriétaire.
alter function public.restaurer_sauvegarde(jsonb) rename to patisgest_restaurer_sauvegarde_interne;
revoke all on function public.patisgest_restaurer_sauvegarde_interne(jsonb) from public,anon,authenticated;
create function public.restaurer_sauvegarde(p_dump jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m text;
begin
 foreach m in array array['stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation'] loop
  perform public.patisgest_exiger_modules(array[m]);
 end loop;
 return public.patisgest_restaurer_sauvegarde_interne(p_dump);
end $$;
revoke all on function public.restaurer_sauvegarde(jsonb) from public,anon;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated,service_role;

-- Tables à usage exclusif et écritures directes : les policies restrictives
-- s'ajoutent aux politiques de tenant/rôle, jamais ne les remplacent.
do $$ declare x record;
begin
 for x in select * from (values
 ('releve_temperatures','qualite','all'),('nettoyages','qualite','all'),('non_conformites','qualite','all'),
 ('transferts','transferts','all'),('taches_planning','planning','all'),('demandes_reassort','planning|transferts','all'),
 ('recette_familles','recettes|production|cake-design|planning','select'),('recette_versions','recettes|production|cake-design','select'),
 ('ordres_fabrication','production|planning|cake-design','select'),('cakes','cake-design','select'),
 ('bons_commande','achats','select'),('historique_prix','achats|simulation','select'),
 ('parametres_couts','simulation','insert'),('parametres_couts','simulation','update'),
 ('ventes','caisse|cloture|planning','select'),('z_imports','caisse|cloture','select'),('clotures','cloture|planning','select'),
 ('articles','stocks','insert'),('articles','stocks','update'),('lots','stocks','insert'),('lots','stocks','update'),('mouvements','stocks','insert'),('fournisseurs','achats','insert'),
 ('conversions','recettes','insert'),('conversions','recettes','update'),('conversions','recettes','delete')
 ) as t(table_name,modules,cmd) loop
  execute format('drop policy if exists %I on public.%I','module_guard_'||x.cmd,x.table_name);
  if x.cmd='insert' then
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|');
  elsif x.cmd='update' then
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m))) with check (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|',x.modules,'|');
  elsif x.cmd='delete' then
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|');
  else
    execute format('create policy %I on public.%I as restrictive for %s to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.cmd,x.modules,'|');
  end if;
 end loop;
end $$;
commit;
