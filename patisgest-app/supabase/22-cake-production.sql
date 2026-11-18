-- Dossier gâteau : association explicite et création atomique d'un OF.
-- Les anciennes commandes ne sont pas modifiées automatiquement.
begin;
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

commit;
