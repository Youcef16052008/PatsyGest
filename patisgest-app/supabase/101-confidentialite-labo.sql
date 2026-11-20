-- BROUILLON : NE PAS DEPLOYER. Couverture, compatibilite et parcours labo non valides.
-- Confidentialité labo : aucune table financière brute n'est lisible par ce rôle.
-- Les vues ci-dessous exposent exclusivement les champs opérationnels nécessaires.
begin;
do $$ declare t text; begin
 foreach t in array array['articles','lots','mouvements','recette_versions','ordres_fabrication','cakes','ventes','clotures','transferts','bons_commande','historique_prix','parametres_couts','z_imports'] loop
  execute format('drop policy if exists labo_sans_finance on public.%I',t);
  execute format('create policy labo_sans_finance on public.%I as restrictive for select to authenticated using (public.patisgest_mon_role() <> %L)',t,'labo');
 end loop;
end $$;

-- Les paramètres globaux de charges ne sont pas des prix fixes à saisir par le labo.
create policy labo_sans_parametres_couts_insert on public.parametres_couts as restrictive for insert to authenticated
 with check (public.patisgest_mon_role() = 'proprietaire');
create policy labo_sans_parametres_couts_update on public.parametres_couts as restrictive for update to authenticated
 using (public.patisgest_mon_role() = 'proprietaire') with check (public.patisgest_mon_role() = 'proprietaire');

create or replace view public.labo_articles with (security_barrier=true) as
 select id,client_id,code,nom,niveau,unite,seuil,allergenes,traces,created_at from public.articles
 where client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo' and (public.patisgest_module_autorise('stocks') or public.patisgest_module_autorise('recettes') or public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning') or public.patisgest_module_autorise('transferts') or public.patisgest_module_autorise('tracabilite') or public.patisgest_module_autorise('achats') or public.patisgest_module_autorise('cake-design') or public.patisgest_module_autorise('qualite'));
create or replace view public.labo_lots with (security_barrier=true) as
 select id,client_id,article_id,site_id,fournisseur_id,numero,qte_init,qte_rest,dlc,date_reception,ref,congele,bloque,created_at,bloque_motif from public.lots
 where client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo' and (public.patisgest_module_autorise('stocks') or public.patisgest_module_autorise('recettes') or public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning') or public.patisgest_module_autorise('transferts') or public.patisgest_module_autorise('tracabilite') or public.patisgest_module_autorise('achats') or public.patisgest_module_autorise('cake-design') or public.patisgest_module_autorise('qualite'));
create or replace view public.labo_recette_versions with (security_barrier=true) as
 select v.id,v.client_id,v.famille_id,v.version,v.rendement_qte,v.rendement_unite,v.cuisson_perte_pct,v.mo_min,v.active,v.created_at,
  coalesce((select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
   'articleId',case when jsonb_typeof(x.val->'articleId')='string' then x.val->>'articleId' end,
   'code',case when jsonb_typeof(x.val->'code')='string' and length(x.val->>'code')<=40 then x.val->>'code' end,
   'subVersionId',case when jsonb_typeof(x.val->'subVersionId')='string' then x.val->>'subVersionId' end,
   'q',case when jsonb_typeof(x.val->'q')='number' then x.val->'q' end,
   'u',case when jsonb_typeof(x.val->'u')='string' then x.val->>'u' end,
   'parage',case when jsonb_typeof(x.val->'parage')='number' then x.val->'parage' end)) order by x.pos)
   from jsonb_array_elements(case when jsonb_typeof(v.ingredients)='array' then v.ingredients else '[]'::jsonb end) with ordinality x(val,pos)), '[]'::jsonb) ingredients
 from public.recette_versions v where v.client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo'
 and (public.patisgest_module_autorise('recettes') or public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning'));
-- Historique de quantités seulement : aucune ligne, total ou valeur de prix brute.
create or replace view public.labo_ventes_quantites with (security_barrier=true) as
 select v.id,v.client_id,v.site_id,v.date_vente,v.source,
  coalesce((select jsonb_agg(jsonb_build_object(
   'articleId',case when jsonb_typeof(x.val->'articleId')='string' and x.val->>'articleId' ~* '^[0-9a-f-]{36}$' then x.val->>'articleId' end,
   'qty',case when jsonb_typeof(x.val->'qty')='number' then x.val->'qty' end) order by x.pos)
   from jsonb_array_elements(case when jsonb_typeof(v.lignes)='array' then v.lignes else '[]'::jsonb end) with ordinality x(val,pos)), '[]'::jsonb) lignes
 from public.ventes v where v.client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo' and public.patisgest_module_autorise('planning');
create or replace view public.labo_ordres_fabrication with (security_barrier=true) as
 select id,client_id,famille_id,version_id,site_id,numero,qte_prevue,qte_realisee,date_prevue,date_lancement,statut,client_ref,
  jsonb_build_object('recette',snapshot->>'recette','version',snapshot->>'version','devis',snapshot->>'devis') snapshot,
  created_at from public.ordres_fabrication
 where client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo' and (public.patisgest_module_autorise('production') or public.patisgest_module_autorise('planning'));
create or replace view public.labo_cakes with (security_barrier=true) as
 select id,client_id,numero,client_nom,telephone,date_event,nb_parts,statut,cgv,version_id,site_id,qte_fabrication,of_id,created_at from public.cakes
 where client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo' and (public.patisgest_module_autorise('cake-design') or public.patisgest_module_autorise('planning'));
-- Lignes de commande : conserver l'ordre (index utilisé à la réception) et
-- reconstruire explicitement chaque entrée au lieu de retirer des clés au hasard.
create or replace view public.labo_bons_commande with (security_barrier=true) as
 select b.id,b.client_id,b.fournisseur_id,b.numero,b.date_bc,b.statut,b.created_at,
  coalesce((select jsonb_agg(jsonb_build_object('articleId',case when jsonb_typeof(l.v->'articleId')='string' and l.v->>'articleId' ~* '^[0-9a-f-]{36}$' then l.v->>'articleId' else null end,'qte',case when jsonb_typeof(l.v->'qte')='number' then l.v->'qte' else null end,'recu',case when jsonb_typeof(l.v->'recu')='number' then l.v->'recu' else null end) order by l.ord)
   from jsonb_array_elements(case when jsonb_typeof(b.lignes)='array' then b.lignes else '[]'::jsonb end) with ordinality as l(v,ord)), '[]'::jsonb) lignes
 from public.bons_commande b where b.client_id=public.patisgest_mon_client() and public.patisgest_mon_role()='labo' and public.patisgest_module_autorise('achats');
revoke all on public.labo_articles,public.labo_lots,public.labo_recette_versions,public.labo_ordres_fabrication,public.labo_cakes,public.labo_bons_commande,public.labo_ventes_quantites from public,anon;
grant select on public.labo_articles,public.labo_lots,public.labo_recette_versions,public.labo_ordres_fabrication,public.labo_cakes,public.labo_bons_commande,public.labo_ventes_quantites to authenticated,service_role;

-- Les sorties des RPC SECURITY DEFINER ne bénéficient pas des policies.
-- Terminer l'OF reste possible, mais son coût n'est renvoyé qu'au propriétaire.
alter function public.terminer_of(uuid,numeric,text,date) rename to patisgest_terminer_of_interne;
revoke all on function public.patisgest_terminer_of_interne(uuid,numeric,text,date) from public,anon,authenticated;
create function public.terminer_of(p_of_id uuid,p_qte numeric,p_numero_lot text,p_dlc date)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 r:=public.patisgest_terminer_of_interne(p_of_id,p_qte,p_numero_lot,p_dlc);
 if public.patisgest_mon_role()='labo' then r:=r-'cout_unitaire'-'cout_estime'; end if;
 return r;
end $$;
revoke all on function public.terminer_of(uuid,numeric,text,date) from public,anon;
grant execute on function public.terminer_of(uuid,numeric,text,date) to authenticated,service_role;

-- Le labo ne peut consulter le paiement ou sonder l'acompte par messages d'erreur.
alter function public.evoluer_cake(uuid,text,numeric) rename to patisgest_evoluer_cake_interne;
revoke all on function public.patisgest_evoluer_cake_interne(uuid,text,numeric) from public,anon,authenticated;
create function public.evoluer_cake(p_id uuid,p_transition text,p_montant numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 if public.patisgest_mon_role()='labo' and p_transition not in ('produit','annule') then raise exception 'Transition reservee au comptoir.' using errcode='42501'; end if;
 r:=public.patisgest_evoluer_cake_interne(p_id,p_transition,p_montant);
 if public.patisgest_mon_role()='labo' then r:=r-'paid'-'balance'; end if;
 return r;
end $$;
revoke all on function public.evoluer_cake(uuid,text,numeric) from public,anon;
grant execute on function public.evoluer_cake(uuid,text,numeric) to authenticated,service_role;

-- Rappel : les références de vente sont utiles, pas leurs montants.
alter function public.rappel_lot(uuid) rename to patisgest_rappel_lot_interne;
revoke all on function public.patisgest_rappel_lot_interne(uuid) from public,anon,authenticated;
create function public.rappel_lot(p_lot_id uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare r jsonb; v jsonb; d jsonb;
begin
 r:=public.patisgest_rappel_lot_interne(p_lot_id);
 if public.patisgest_mon_role()='labo' then
  select coalesce(jsonb_agg(jsonb_build_object('ticket',x->'ticket','date_vente',x->'date_vente','site_id',x->'site_id')),'[]'::jsonb)
   into v from jsonb_array_elements(coalesce(r->'ventes','[]'::jsonb)) x;
  select coalesce(jsonb_agg(jsonb_build_object('ticket',x->'ticket','date_vente',x->'date_vente','code',x->'code','nom',x->'nom')),'[]'::jsonb)
   into d from jsonb_array_elements(coalesce(r->'ventes_descendants','[]'::jsonb)) x;
  r:=jsonb_set(jsonb_set(r,'{ventes}',v),'{ventes_descendants}',d);
 end if;
 return r;
end $$;
revoke all on function public.rappel_lot(uuid) from public,anon;
grant execute on function public.rappel_lot(uuid) to authenticated,service_role;

-- Les RPC de caisse révèlent des prix dans leurs réponses JSON.
do $$ declare x record; f record; def text; injected text; n integer;
begin
 for x in select unnest(array['vendre_article','vendre_panier','importer_z']) nom loop
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  if n <> 1 then raise exception 'Signature RPC ambiguë ou absente : % (%)',x.nom,n; end if;
  select p.oid,pg_get_functiondef(p.oid) src into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=x.nom and p.prosecdef limit 1;
  if not found then raise exception 'RPC absente : %',x.nom; end if;
  def:=f.src;
  injected:=regexp_replace(def,E'\\mbegin\\M', 'begin if public.patisgest_mon_role() = ''labo'' then raise exception ''Reserve au comptoir.'' using errcode = ''42501''; end if;', 'i');
  if injected=def then raise exception 'Garde impossible : %',x.nom; end if;
  execute injected;
 end loop;
end $$;
commit;
