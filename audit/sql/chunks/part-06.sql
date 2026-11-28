      elsif v_tbl = 'recette_versions' then
        insert into public.recette_versions select r.* from jsonb_populate_recordset(null::public.recette_versions, v_lignes) r;
      elsif v_tbl = 'lots' then
        insert into public.lots select r.* from jsonb_populate_recordset(null::public.lots, v_lignes) r;
      elsif v_tbl = 'mouvements' then
        insert into public.mouvements select r.* from jsonb_populate_recordset(null::public.mouvements, v_lignes) r;
      elsif v_tbl = 'historique_prix' then
        insert into public.historique_prix select r.* from jsonb_populate_recordset(null::public.historique_prix, v_lignes) r;
      elsif v_tbl = 'bons_commande' then
        insert into public.bons_commande select r.* from jsonb_populate_recordset(null::public.bons_commande, v_lignes) r;
      elsif v_tbl = 'ordres_fabrication' then
        insert into public.ordres_fabrication select r.* from jsonb_populate_recordset(null::public.ordres_fabrication, v_lignes) r;
      elsif v_tbl = 'ventes' then
        insert into public.ventes select r.* from jsonb_populate_recordset(null::public.ventes, v_lignes) r;
      elsif v_tbl = 'z_imports' then
        insert into public.z_imports select r.* from jsonb_populate_recordset(null::public.z_imports, v_lignes) r;
      elsif v_tbl = 'clotures' then
        insert into public.clotures select r.* from jsonb_populate_recordset(null::public.clotures, v_lignes) r;
      elsif v_tbl = 'transferts' then
        insert into public.transferts select r.* from jsonb_populate_recordset(null::public.transferts, v_lignes) r;
      elsif v_tbl = 'demandes_reassort' then
        insert into public.demandes_reassort select r.* from jsonb_populate_recordset(null::public.demandes_reassort, v_lignes) r;
      elsif v_tbl = 'cakes' then
        insert into public.cakes select r.* from jsonb_populate_recordset(null::public.cakes, v_lignes) r;
      elsif v_tbl = 'releve_temperatures' then
        insert into public.releve_temperatures select r.* from jsonb_populate_recordset(null::public.releve_temperatures, v_lignes) r;
      elsif v_tbl = 'nettoyages' then
        insert into public.nettoyages select r.* from jsonb_populate_recordset(null::public.nettoyages, v_lignes) r;
      elsif v_tbl = 'non_conformites' then
        insert into public.non_conformites select r.* from jsonb_populate_recordset(null::public.non_conformites, v_lignes) r;
      elsif v_tbl = 'taches_planning' then
        insert into public.taches_planning select r.* from jsonb_populate_recordset(null::public.taches_planning, v_lignes) r;
      end if;
      get diagnostics v_n = row_count;
      v_insere := v_insere || jsonb_build_object(v_tbl, v_n);
    exception
      when unique_violation then
        v_ignore := v_ignore || jsonb_build_object(v_tbl, jsonb_array_length(v_lignes));
    end;
  end loop;

  return jsonb_build_object('insere', v_insere, 'ignore', v_ignore);
end;
$fn$;

revoke all on function public.restaurer_sauvegarde(jsonb) from public, anon, authenticated;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated, service_role;

-- ===== 22-cake-production.sql =====
-- Dossier gâteau : association explicite et création atomique d'un OF.
-- Les anciennes commandes ne sont pas modifiées automatiquement.

alter table public.cakes add column if not exists version_id uuid references public.recette_versions(id);
alter table public.cakes add column if not exists site_id uuid references public.sites(id);
alter table public.cakes add column if not exists qte_fabrication numeric(12,3);
alter table public.cakes add column if not exists of_id uuid references public.ordres_fabrication(id);
-- Empêche les références inter-établissements, y compris lors d'une restauration.
create unique index if not exists cake_version_tenant_unique on public.recette_versions(client_id,id);
create unique index if not exists cake_site_tenant_unique on public.sites(client_id,id);
create unique index if not exists cake_of_tenant_unique on public.ordres_fabrication(client_id,id);
do $$ begin
  if not exists(select 1 from pg_constraint where conname='cakes_version_tenant_fk' and conrelid='public.cakes'::regclass) then
    alter table public.cakes add constraint cakes_version_tenant_fk foreign key(client_id,version_id) references public.recette_versions(client_id,id);
    alter table public.cakes add constraint cakes_site_tenant_fk foreign key(client_id,site_id) references public.sites(client_id,id);
    alter table public.cakes add constraint cakes_of_tenant_fk foreign key(client_id,of_id) references public.ordres_fabrication(client_id,id);
  end if;
end $$;
create unique index if not exists cakes_of_id_unique on public.cakes(of_id) where of_id is not null;

-- Liste minimale sans ingrédients ni coûts, accessible également au vendeur.
create or replace function public.cake_options_production()
returns table(version_id uuid, nom text, version integer, rendement_qte numeric, rendement_unite text)
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_role text;
begin
  select u.client_id, u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
  if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  return query select rv.id, rf.nom::text, rv.version, rv.rendement_qte::numeric, rv.rendement_unite::text
    from public.recette_versions rv join public.recette_familles rf on rf.id=rv.famille_id and rf.client_id=v_client
    where rv.client_id=v_client and rv.active and rf.produit_id is not null
      and case when jsonb_typeof(rv.ingredients)='array' then jsonb_array_length(rv.ingredients)>0 else false end
    order by rf.nom, rv.version desc;
end; $$;
revoke all on function public.cake_options_production() from public, anon;
grant execute on function public.cake_options_production() to authenticated, service_role;

-- Peut aussi compléter un ancien devis avant confirmation ; jamais après.
create or replace function public.affecter_production_cake(p_id uuid, p_version_id uuid, p_site_id uuid, p_qte numeric)
returns void language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_role text; c record;
begin
  select u.client_id,u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
  if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  select * into c from public.cakes where id=p_id and client_id=v_client for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.statut not in ('devis','acompte') or c.of_id is not null then raise exception 'Production deja confirmee.'; end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 or p_qte <> round(p_qte,3) then raise exception 'Quantite invalide (3 decimales maximum).'; end if;
  if not exists(select 1 from public.sites where id=p_site_id and client_id=v_client) then raise exception 'Site invalide.'; end if;
  if not exists(select 1 from public.cake_options_production() x where x.version_id=p_version_id) then raise exception 'Version de recette active invalide.'; end if;
  update public.cakes set version_id=p_version_id, site_id=p_site_id, qte_fabrication=p_qte where id=p_id;
end; $$;
revoke all on function public.affecter_production_cake(uuid,uuid,uuid,numeric) from public, anon;
grant execute on function public.affecter_production_cake(uuid,uuid,uuid,numeric) to authenticated, service_role;

create or replace function public.creer_cake_production(p_client_nom text,p_telephone text,p_date_event date,p_nb_parts int,p_prix_ht numeric,p_options jsonb,p_notes text,p_cgv boolean,p_version_id uuid,p_site_id uuid,p_qte numeric)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare r jsonb;
begin
  r := public.creer_cake(p_client_nom,p_telephone,p_date_event,p_nb_parts,p_prix_ht,p_options,p_notes,p_cgv);
  perform public.affecter_production_cake((r->>'cake_id')::uuid,p_version_id,p_site_id,p_qte);
  return r;
end; $$;
revoke all on function public.creer_cake_production(text,text,date,integer,numeric,jsonb,text,boolean,uuid,uuid,numeric) from public, anon;
grant execute on function public.creer_cake_production(text,text,date,integer,numeric,jsonb,text,boolean,uuid,uuid,numeric) to authenticated, service_role;

-- Seulement les identifiants/numéros utiles à la traçabilité ; jamais les coûts.
create or replace function public.cake_liens_production()
returns table(cake_id uuid, of_id uuid, of_numero text, lots jsonb)
language plpgsql security definer set search_path = '' as $$
declare v_client uuid; v_role text;
begin
  select u.client_id,u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
  if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  return query select c.id,o.id,o.numero,coalesce((select jsonb_agg(jsonb_build_object('numero',l->>'numero','lotId',l->>'lotId')) from jsonb_array_elements(o.lots_produits) l),'[]'::jsonb)
    from public.cakes c join public.ordres_fabrication o on o.id=c.of_id and o.client_id=v_client where c.client_id=v_client;
end; $$;
revoke all on function public.cake_liens_production() from public, anon;
grant execute on function public.cake_liens_production() to authenticated, service_role;

create or replace function public.evoluer_cake(p_id uuid, p_transition text, p_montant numeric)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  c record;
  v_paid numeric;
  v_new text;
  v_type text;
  v_montant numeric := nullif(p_montant, 0);
  v_req numeric;
  v_ttc numeric;
  v_version record;
  v_of uuid;
  v_numero text;
  v_besoins jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_transition is null or p_transition not in ('payer','confirme','produit','livre','annule') then
    raise exception 'Transition invalide.';
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;

  v_paid := coalesce(c.acompte, 0);
  v_ttc := round(c.prix_ht * (1 + coalesce(c.tva_pct,0) / 100), 2);

  if p_transition = 'payer' then
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Paiement impossible depuis le statut %.', c.statut;
    end if;
    if v_montant is null or v_montant <= 0 or v_montant > (v_ttc - v_paid) or v_montant <> round(v_montant,2) then
      raise exception 'Montant de paiement invalide.';
    end if;
    v_type := case when c.statut in ('devis','acompte') then 'acompte' else 'solde' end;
    update public.cakes k
      set acompte = v_paid + v_montant,
          paiements = coalesce(k.paiements, '[]'::jsonb) || jsonb_build_object(
            'at', now(), 'type', v_type, 'montant', v_montant, 'by', v_auth),
          statut = case when k.statut = 'devis' then 'acompte' else k.statut end
     where k.id = p_id
     ;
    v_new := case when c.statut = 'devis' then 'acompte' else c.statut end;

  elsif p_transition = 'confirme' then
    if c.statut in ('confirme','produit','livre') and c.of_id is not null then
      return jsonb_build_object('statut',c.statut,'paid',v_paid,'balance',v_ttc-v_paid,'of_id',c.of_id,'duplicate',true);
    end if;
    if c.statut <> 'acompte' then
      raise exception 'Confirmation possible uniquement depuis l''acompte (statut actuel : %).', c.statut;
    end if;
    v_req := ceil(c.prix_ht * 30)::numeric / 100;
    if v_paid < v_req then
      raise exception 'Acompte insuffisant : au moins % HT requis (30 %%).', v_req;
    end if;
    if c.version_id is null or c.site_id is null or c.qte_fabrication is null then
      raise exception 'Choisissez une recette, un site et une quantite avant confirmation.';
    end if;
    if not exists(select 1 from public.sites where id=c.site_id and client_id=v_client) then raise exception 'Site invalide.'; end if;
    select rv.id,rv.version,rv.famille_id,rv.rendement_qte,rv.ingredients,rf.nom,rf.produit_id
      into v_version from public.recette_versions rv join public.recette_familles rf on rf.id=rv.famille_id and rf.client_id=v_client
      where rv.id=c.version_id and rv.client_id=v_client;
    if not found or v_version.produit_id is null or coalesce(v_version.rendement_qte,0)<=0 then raise exception 'Version de recette invalide.'; end if;
    v_besoins := public.patisgest_besoins_de_version(v_client,c.version_id,c.qte_fabrication/v_version.rendement_qte,0);
    v_numero := 'OF-' || upper(substr(md5(gen_random_uuid()::text),1,8));
    insert into public.ordres_fabrication(client_id,famille_id,version_id,site_id,numero,qte_prevue,date_prevue,statut,snapshot,besoins,client_ref)
      values(v_client,v_version.famille_id,c.version_id,c.site_id,v_numero,c.qte_fabrication,c.date_event,'planifie',
        jsonb_build_object('recette',v_version.nom,'version',v_version.version,'produitId',v_version.produit_id,'scale',c.qte_fabrication/v_version.rendement_qte,'devis',c.numero),
        v_besoins,'cake:' || c.id::text) returning id into v_of;
    update public.cakes k set statut = 'confirme', of_id=v_of where k.id = p_id;
    v_new := 'confirme';

  elsif p_transition = 'produit' then
    if c.statut <> 'confirme' then
      raise exception 'Production possible uniquement depuis confirmé (statut actuel : %).', c.statut;
    end if;
    if c.of_id is not null and not exists(select 1 from public.ordres_fabrication o where o.id=c.of_id and o.client_id=v_client and o.statut='termine' and jsonb_array_length(o.lots_produits)>0) then
      raise exception 'Terminez l OF et creez le lot avant de marquer produit.';
    end if;
    update public.cakes k set statut = 'produit' where k.id = p_id;
    v_new := 'produit';

  elsif p_transition = 'livre' then
    if c.statut <> 'produit' then
      raise exception 'Livraison possible uniquement depuis produit (statut actuel : %).', c.statut;
    end if;
    if v_paid < v_ttc then
      raise exception 'Le solde doit etre entierement enregistre avant livraison.';
    end if;
    update public.cakes k set statut = 'livre' where k.id = p_id;
    v_new := 'livre';

  else -- annule
    if c.of_id is not null then raise exception 'Un OF est lie : traitez son devenir au laboratoire avant toute annulation.'; end if;
    if c.statut not in ('devis','acompte','confirme','produit') then
      raise exception 'Annulation impossible depuis le statut %.', c.statut;
    end if;
    update public.cakes k set statut = 'annule' where k.id = p_id;
    v_new := 'annule';
  end if;

  return jsonb_build_object(
    'statut', v_new,
    'paid', v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0),
    'balance', v_ttc - (v_paid + coalesce(case when p_transition = 'payer' then v_montant else 0 end, 0)));
end;
$$;

revoke execute on function public.evoluer_cake(uuid, text, numeric) from public, anon;
grant execute on function public.evoluer_cake(uuid, text, numeric) to authenticated, service_role;

-- ===== 23-controle-modules.sql =====
-- Appliquée au pilote (controle_modules_23, 20261119045242). Ne pas rejouer.
-- Couverture, compatibilité et parcours réels encore non validés.
-- Accès par compte : l'absence de ligne conserve les droits habituels du rôle.
-- Le réglage n'accorde jamais de nouveaux privilèges de rôle.

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

-- ===== 24-index-exploitation.sql =====
-- =====================================================================
-- Migration 24 — Index d'exploitation multi-tenant.
--
-- Pourquoi maintenant : le pilote ne compte qu'un établissement et
-- 8 ventes, donc tout est instantané même sans index. Le modèle visé
-- (50 comptes · 100 boutiques · dizaines de tickets par jour) met
-- toutes les boutiques dans les MÊMES tables, séparées par client_id.
-- Relevé du 2026-11-19 sur la base pilote (evepzygucfxarpdnflzv) :
--   ventes (8 lignes)      → 2 index : pkey + (client_id, ticket)
--   mouvements (7)         → 1 index : pkey
--   lots (13)              → 1 index : pkey
--   clotures / OF / etc.   → 1 index : pkey
-- Chaque écran filtre client_id puis trie par date : sans index
-- composite, PostgreSQL balaie la table entière à chaque affichage,
-- pour toutes les boutiques à la fois.
--
-- Portée volontairement limitée : uniquement les prédicats réellement
-- écrits dans src/ (relevés fichier par fichier) et dans les RPC
-- FEFO des migrations 06 à 11. Aucun index « au cas où ».
--
-- Coût : quelques Mo pour 1,8 M tickets/an. Aucun verrou long sur des
-- tables de cette taille. Sur une base déjà volumineuse, remplacer
-- chaque `create index` par `create index concurrently` (hors
-- transaction) pour ne pas bloquer la caisse.
--
-- Idempotent : `if not exists`, rejouable sans effet.
-- =====================================================================

-- ------------------------------------------------------------- ventes
-- lireVentesJours : eq(client_id) + date_vente entre … order by id
-- Clôture / reconstitution : order by date_vente desc limit 500
create index if not exists ventes_client_date_idx
  on public.ventes (client_id, date_vente);

-- lireHistoriqueCaisse : order by created_at desc, id desc limit 40
create index if not exists ventes_client_created_idx
  on public.ventes (client_id, created_at desc, id desc);

-- --------------------------------------------------------- mouvements
-- Journal immuable : lecture d'un lot, d'un article ou d'une période.
create index if not exists mouvements_client_date_idx
  on public.mouvements (client_id, date_mvt desc);

create index if not exists mouvements_client_lot_idx
  on public.mouvements (client_id, lot_id);

-- ---------------------------------------------------------------- lots
-- Cœur du FEFO (migrations 06, 07, 08, 10, 11) : le prédicat est
--   client_id = … and article_id = … and site_id = …
--   and not bloque and qte_rest > 0
-- suivi de `order by congele, dlc nulls last, date_reception, id`.
-- Index partiel : il ne contient que les lots consommables, donc il
-- reste petit même après des années d'historique épuisé.
create index if not exists lots_fefo_idx
  on public.lots (client_id, article_id, site_id, congele, dlc, date_reception, id)
  where qte_rest > 0 and not bloque;

-- Traçabilité / rappel de lot : recherche par numéro.
create index if not exists lots_client_numero_idx
  on public.lots (client_id, numero);

-- ---------------------------------------------------------- production
-- lireProduction : eq(client_id) + order by date_prevue
create index if not exists ordres_client_date_idx
  on public.ordres_fabrication (client_id, date_prevue);

-- --------------------------------------------------------- clôtures
create index if not exists clotures_client_date_idx
  on public.clotures (client_id, date_cloture desc);

-- ----------------------------------------------------- qualité (HACCP)
create index if not exists temperatures_client_date_idx
  on public.releve_temperatures (client_id, date_releve desc);

create index if not exists nettoyages_client_date_idx
  on public.nettoyages (client_id, date_nettoyage desc);

create index if not exists non_conformites_client_date_idx
  on public.non_conformites (client_id, date_nc desc);

-- ----------------------------------------------------------- planning
create index if not exists taches_client_date_idx
  on public.taches_planning (client_id, date_tache);

-- ------------------------------------------------ achats / prix / Z
create index if not exists historique_prix_client_date_idx
  on public.historique_prix (client_id, article_id, date_prix desc);

create index if not exists z_imports_client_date_idx
  on public.z_imports (client_id, date_z desc);

-- ------------------------------------------------- cakes et transferts
create index if not exists cakes_client_event_idx
  on public.cakes (client_id, date_event);

create index if not exists transferts_client_date_idx
  on public.transferts (client_id, date_transfert desc);

-- ------------------------------------------------ listes de référence
-- Les sélecteurs trient les articles et les sites par nom (lireArticles,
-- lireSites, écrans Stocks/Caisse/Clôture).
create index if not exists articles_client_nom_idx
  on public.articles (client_id, nom);

create index if not exists sites_client_nom_idx
  on public.sites (client_id, nom);

-- -------------------------------------------- confirmation de lecture
-- À exécuter après application pour vérifier que les 14 index existent :
--
--   select tablename, indexname from pg_indexes
--    where schemaname = 'public' and indexname like '%_idx'
--    order by tablename, indexname;

-- ===== 25-domaines-boutiques.sql =====
-- =====================================================================
-- Migration 25 — Domaines des boutiques en ligne (prérequis vitrine)
--
-- Objectif produit : chaque pâtisserie a un sous-domaine gratuit
-- (`elyasmine.patisgest.dz`), et l'offre Pro peut recevoir son propre
-- domaine (`patisserie-elyasmine.com`) via un CNAME → Cloudflare for SaaS.
--
-- ⚠️ Trois corrections par rapport au plan « évident » qu'on lit souvent :
--
--  1. `subdomain NOT NULL` casserait tout : la base pilote contient déjà
--     2 sites sans sous-domaine. La colonne est donc NULLABLE, et la
--     contrainte finale n'exige un sous-domaine QUE pour les sites dont
--     la vitrine est publiée (`publication <> 'aucune'`).
--
--  2. Un sous-domaine n'existe pas en double dans le monde : un client
--     pouvait prendre « el-yasmine » avant qu'un autre ne le veuille.
--     Le format est donc verrouillé (minuscules, chiffres, tirets) pour
--     qu'il soit aussi un nom DNS valide, et la réservation se fait via
--     une RPC (migration suivante) et non par un UPDATE direct.
--
--  3. Pas de `UNIQUE` global sur `custom_domain` sans normalisation : la
--     casse et le « www. » créeraient deux entrées pour le même site.
--     On normalise en minuscules et on interdit le préfixe www. : le
--     visiteur arrive sur le domaine nu, il n'y a rien à distinguer.
--
-- Rien n'est publié par cette migration : elle prépare le schéma. Le
-- routage par hôte est un chantier distinct (voir NOTE-COUT-MINIMAL.md).
-- Idempotent : rejouable.
-- =====================================================================

-- ------------------------------------------------------- sous-domaine
alter table public.sites
  add column if not exists subdomain text,
  add column if not exists custom_domain text,
  -- 'aucune' = pas de vitrine ; 'brouillon' = réservée, pas visible ;
  -- 'publiee' = la vitrine répond. Le défaut protège les sites existants :
  -- deux boutiques ne deviennent pas publiques par accident.
  add column if not exists publication text not null default 'aucune',
  add column if not exists vitrine_publiee_le timestamptz;

-- Contraintes de forme, nommées pour être modifiables plus tard.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_subdomain_forme') then
    alter table public.sites add constraint sites_subdomain_forme
      check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sites_custom_domain_forme') then
    alter table public.sites add constraint sites_custom_domain_forme
      check (
        custom_domain is null
        or (
          custom_domain = lower(custom_domain)
          and custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
          and custom_domain not like 'www.%'
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sites_publication_valeurs') then
    alter table public.sites add constraint sites_publication_valeurs
      check (publication in ('aucune', 'brouillon', 'publiee'));
  end if;

  -- Une vitrine publiée DOIT avoir une adresse : sinon elle serait
  -- inaccessible tout en apparaissant comme publiée dans l'interface.
  if not exists (select 1 from pg_constraint where conname = 'sites_publiee_a_une_adresse') then
    alter table public.sites add constraint sites_publiee_a_une_adresse
      check (publication <> 'publiee' or subdomain is not null or custom_domain is not null);
  end if;
end $$;

-- --------------------------------------------------------- unicité
-- Un sous-domaine est unique dans TOUT le service, pas par client :
-- il devient un nom DNS. Index partiels : les NULL restent autorisés.
create unique index if not exists sites_subdomain_unique
  on public.sites (lower(subdomain)) where subdomain is not null;

create unique index if not exists sites_custom_domain_unique
  on public.sites (lower(custom_domain)) where custom_domain is not null;

-- Résolution `host → site` : c'est la requête faite à CHAQUE visite
-- d'une vitrine. Sans cet index, chaque page vue balaie tous les sites.
create index if not exists sites_publication_idx
  on public.sites (publication) where publication = 'publiee';

-- ------------------------------------------------- mots réservés
-- Un client ne doit pas pouvoir prendre « app », « api », « www »… :
-- ces noms portent l'application elle-même.
create table if not exists public.sous_domaines_reserves (
  nom text primary key,
  raison text
);

insert into public.sous_domaines_reserves (nom, raison) values
  ('www', 'site principal'),
  ('app', 'application de gestion'),
  ('api', 'API'),
  ('admin', 'administration'),
  ('mail', 'e-mail'),
  ('smtp', 'e-mail'),
  ('ftp', 'transfert de fichiers'),
  ('cdn', 'assets'),
  ('static', 'assets'),
  ('assets', 'assets'),
  ('status', 'page de statut'),
  ('support', 'support'),
  ('aide', 'support'),
  ('blog', 'contenu'),
  ('demo', 'démonstration'),
  ('test', 'test'),
  ('staging', 'recette'),
  ('dev', 'développement'),
  ('patisgest', 'marque')
on conflict (nom) do nothing;

-- Lecture publique nécessaire ? Non : cette table ne contient aucune
-- donnée personnelle, mais elle est lue par la fonction de réservation
-- (SECURITY DEFINER) et non par le client. RLS activée sans policy =
-- invisible pour `anon` et `authenticated`, ce qui est le but.
alter table public.sous_domaines_reserves enable row level security;

-- ------------------------------------------------------ cohérence
-- Le site doit appartenir au même client que le sous-domaine réservé :
-- impossible de réserver pour un autre établissement.
create or replace function public.patisgest_reserver_sous_domaine(
  p_site_id uuid,
  p_sous_domaine text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_nom text := lower(trim(coalesce(p_sous_domaine, '')));
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  if public.patisgest_mon_role() not in ('proprietaire') then
    raise exception 'Réservé au propriétaire.';
  end if;

  select s.client_id into v_client
    from public.sites s
   where s.id = p_site_id
     and s.client_id = public.patisgest_mon_client();
  if v_client is null then
    raise exception 'Site introuvable dans cet établissement.';
  end if;

  if v_nom !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'Sous-domaine invalide : minuscules, chiffres et tirets uniquement.';
  end if;
  if length(v_nom) < 3 then
    raise exception 'Sous-domaine trop court (3 caractères minimum).';
  end if;
  if exists (select 1 from public.sous_domaines_reserves r where r.nom = v_nom) then
    raise exception 'Ce sous-domaine est réservé.';
  end if;
  if exists (
    select 1 from public.sites s
     where lower(s.subdomain) = v_nom and s.id <> p_site_id
  ) then
    raise exception 'Ce sous-domaine est déjà pris.';
  end if;

  update public.sites
     set subdomain = v_nom
   where id = p_site_id;
end;
$$;

revoke all on function public.patisgest_reserver_sous_domaine(uuid, text) from public;
grant execute on function public.patisgest_reserver_sous_domaine(uuid, text) to authenticated;

-- ------------------------------------------------ vérification
-- Doit renvoyer 4 colonnes et 5 contraintes (les 3 existantes + 3 ajoutées,
-- moins celles déjà présentes) :
--
--   select column_name from information_schema.columns
--    where table_name = 'sites'
--      and column_name in ('subdomain','custom_domain','publication','vitrine_publiee_le');
--
--   select conname from pg_constraint
--    where conrelid = 'public.sites'::regclass and conname like 'sites_%';
