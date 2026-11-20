-- BROUILLON : durcir la restauration JSON partielle, pas une sauvegarde complète.
-- Ne pas déployer avant validation du catalogue réel, des JSON et du rollback.
-- L'ancienne fonction ignore une table entière à la première collision et ne
-- vérifie pas les clés étrangères vers d'autres établissements.
begin;
alter function public.restaurer_sauvegarde(jsonb) rename to patisgest_restaurer_garde_interne;
revoke all on function public.patisgest_restaurer_garde_interne(jsonb) from public,anon,authenticated,service_role;
create function public.restaurer_sauvegarde(p_dump jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 c uuid := public.patisgest_equipe_proprietaire(); r jsonb; f record; conflit boolean;
 tables constant text[] := array['sites','fournisseurs','articles','conversions','parametres_couts',
  'recette_familles','recette_versions','lots','mouvements','historique_prix','bons_commande',
  'ordres_fabrication','ventes','z_imports','clotures','transferts','demandes_reassort',
  'cakes','releve_temperatures','nettoyages','non_conformites','taches_planning'];
begin
 if cardinality(public.mes_modules_desactives()) > 0 then
  raise exception 'Restauration indisponible : modules desactives.' using errcode='42501';
 end if;
 r := public.patisgest_restaurer_garde_interne(p_dump);
 -- Refuser intégralement une collision, au lieu de conserver une restauration
 -- partielle ou d'annoncer qu'une table était déjà complète.
 if jsonb_typeof(r->'ignore') is distinct from 'object' or r->'ignore' <> '{}'::jsonb then
  raise exception 'Conflit de restauration : aucune ligne ajoutee.';
 end if;
 -- Les FK simples ou composites entre tables avec client_id doivent rester
 -- dans le tenant. Le contrôle se fait après insertion, dans la transaction :
 -- une erreur annule tous les changements. Il ne vérifie pas les liens JSON.
 for f in
  select ch.relname enfant,pa.relname parent,
   string_agg(format('p.%I = e.%I',ap.attname,ae.attname),' and ' order by ck.n) jointure
  from pg_catalog.pg_constraint co
  join pg_catalog.pg_class ch on ch.oid=co.conrelid
  join pg_catalog.pg_namespace nc on nc.oid=ch.relnamespace and nc.nspname='public'
  join pg_catalog.pg_class pa on pa.oid=co.confrelid
  join pg_catalog.pg_namespace np on np.oid=pa.relnamespace and np.nspname='public'
  join lateral unnest(co.conkey) with ordinality ck(attnum,n) on true
  join lateral unnest(co.confkey) with ordinality pk(attnum,n) on pk.n=ck.n
  join pg_catalog.pg_attribute ae on ae.attrelid=ch.oid and ae.attnum=ck.attnum
  join pg_catalog.pg_attribute ap on ap.attrelid=pa.oid and ap.attnum=pk.attnum
  where co.contype='f' and ch.relname=any(tables)
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=ch.oid and a.attname='client_id' and not a.attisdropped)
   and exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=pa.oid and a.attname='client_id' and not a.attisdropped)
  group by co.oid,ch.relname,pa.relname
 loop
  execute format('select exists(select 1 from public.%I e join public.%I p on %s where e.client_id=$1 and p.client_id is distinct from $1)',f.enfant,f.parent,f.jointure)
   into conflit using c;
  if conflit then raise exception 'Lien inter-etablissement : restauration refusee.' using errcode='42501'; end if;
 end loop;
 return r;
end $$;
revoke all on function public.restaurer_sauvegarde(jsonb) from public,anon;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated,service_role;
commit;
