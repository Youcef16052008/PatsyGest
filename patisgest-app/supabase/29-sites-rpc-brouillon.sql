-- BROUILLON : sécurise certaines RPC à paramètre de site et d'OF. Les RPC
-- de rappel, blocage, devis, réassort et toutes les données sans site restent
-- à traiter ; NE PAS DEPLOYER et ne pas activer de nouveaux comptes.
begin;
create function public.patisgest_exiger_site(p_site uuid) returns void
language plpgsql stable security definer set search_path='' as $$
begin
 if not public.patisgest_site_autorise(p_site) then
  raise exception 'Site non autorise.' using errcode='42501';
 end if;
end $$;
revoke all on function public.patisgest_exiger_site(uuid) from public,anon;
grant execute on function public.patisgest_exiger_site(uuid) to authenticated,service_role;

create function public.patisgest_exiger_site_of(p_of uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare s uuid;
begin
 select site_id into s from public.ordres_fabrication where id=p_of and client_id=public.patisgest_mon_client();
 perform public.patisgest_exiger_site(s);
end $$;
revoke all on function public.patisgest_exiger_site_of(uuid) from public,anon;
grant execute on function public.patisgest_exiger_site_of(uuid) to authenticated,service_role;

-- Toute ambiguïté de signature ou absence de garde interrompt la migration.
do $$ declare x record; f record; n integer; def text; begin
 for x in select * from (values
  ('creer_of','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('creer_demande_reassort','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('receptionner_lot','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('recevoir_commande','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('vendre_panier','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('vendre_article','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('importer_z','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('saisir_cloture','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('creer_cake_production','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('affecter_production_cake','p_site_id','perform public.patisgest_exiger_site(p_site_id);'),
  ('demarrer_of','p_of_id','perform public.patisgest_exiger_site_of(p_of_id);'),
  ('terminer_of','p_of_id','perform public.patisgest_exiger_site_of(p_of_id);'),
  ('transferer_article','p_from_site_id','perform public.patisgest_exiger_site(p_from_site_id); perform public.patisgest_exiger_site(p_to_site_id);')
 ) as liste(nom,arg,garde) loop
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  if n<>1 then raise exception 'RPC absente ou ambigue : % (%)',x.nom,n; end if;
  select p.oid,pg_get_functiondef(p.oid) src,pg_get_function_identity_arguments(p.oid) args into f
   from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  if position(x.arg || ' uuid' in f.args)=0 or (x.nom='transferer_article' and position('p_to_site_id uuid' in f.args)=0) then raise exception 'Signature RPC inattendue : %',x.nom; end if;
  def:=regexp_replace(f.src,E'\\mbegin\\M','begin ' || x.garde,'i');
  if def=f.src then raise exception 'Garde site impossible : %',x.nom; end if;
  execute def;
 end loop;
end $$;
commit;
