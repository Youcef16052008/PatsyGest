-- BROUILLON : garde conservatrice. Le rappel et le blocage peuvent traverser
-- plusieurs sites dans leurs graphes et réponses. Un employé ne peut les
-- utiliser que s'il a accès à TOUS les sites du client. Cela limite une
-- fonctionnalité pour les équipes partielles ; ne pas déployer sans UX adaptée.
begin;
create function public.patisgest_exiger_tracabilite_sites(p_lot uuid) returns void
language plpgsql stable security definer set search_path='' as $$
declare s uuid; c uuid := public.patisgest_mon_client();
begin
 select site_id into s from public.lots where id=p_lot and client_id=c;
 perform public.patisgest_exiger_site(s);
 if public.patisgest_mon_role() is distinct from 'proprietaire' and exists (
  select 1 from public.sites st where st.client_id=c and not public.patisgest_site_autorise(st.id)
 ) then
  raise exception 'Tracabilite indisponible sans acces a tous les sites.' using errcode='42501';
 end if;
end $$;
revoke all on function public.patisgest_exiger_tracabilite_sites(uuid) from public,anon;
grant execute on function public.patisgest_exiger_tracabilite_sites(uuid) to authenticated,service_role;

do $$ declare nom text; f record; n integer; def text; begin
 foreach nom in array array['rappel_lot','bloquer_lot'] loop
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace
   where ns.nspname='public' and p.proname=nom and p.prosecdef;
  if n<>1 then raise exception 'RPC absente ou ambigue : % (%)',nom,n; end if;
  select pg_get_functiondef(p.oid) src,pg_get_function_identity_arguments(p.oid) args into f
   from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=nom and p.prosecdef;
  if position('p_lot_id uuid' in f.args)=0 then raise exception 'Signature RPC inattendue : %',nom; end if;
  def:=regexp_replace(f.src,E'\\mbegin\\M','begin perform public.patisgest_exiger_tracabilite_sites(p_lot_id);','i');
  if def=f.src then raise exception 'Garde impossible : %',nom; end if;
  execute def;
 end loop;
end $$;
commit;
