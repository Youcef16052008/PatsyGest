-- BROUILLON : isolation des dossiers cake par site ; ne pas déployer isolément.
-- Les anciens devis sans site restent réservés au propriétaire. Un employé doit
-- créer son devis et l'affectation de production dans une transaction unique.
begin;
create function public.patisgest_exiger_cake(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare c record; v_client uuid := public.patisgest_mon_client();
begin
 select k.site_id,k.of_id into c from public.cakes k where k.id=p_id and k.client_id=v_client for update;
 if not found then raise exception 'Devis hors perimetre.' using errcode='42501'; end if;
 if c.site_id is null then
  if public.patisgest_mon_role() is distinct from 'proprietaire' then raise exception 'Devis hors perimetre.' using errcode='42501'; end if;
 else perform public.patisgest_exiger_site(c.site_id); end if;
 if c.of_id is not null then perform public.patisgest_exiger_site_of(c.of_id); end if;
end $$;
revoke all on function public.patisgest_exiger_cake(uuid) from public,anon,authenticated;

-- Empêcher qu'un membre crée un devis orphelin inaccessible ou accède aux
-- valeurs financières via la création ou l'édition depuis le laboratoire.
alter function public.creer_cake(text,text,date,integer,numeric,jsonb,text,boolean) rename to patisgest_creer_cake_interne;
revoke all on function public.patisgest_creer_cake_interne(text,text,date,integer,numeric,jsonb,text,boolean) from public,anon,authenticated;
-- Le corps historique local réédité utilisait cakes.agent_id, colonne absente
-- du schéma pilote et de la reconstruction. Corps autonome, sans cette colonne.
create or replace function public.patisgest_creer_cake_interne(
  p_client_nom text, p_telephone text, p_date_event date, p_nb_parts int,
  p_prix_ht numeric, p_options jsonb, p_notes text, p_cgv boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_id uuid;
  v_numero text;
  v_retro jsonb;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
  v_cout numeric;
  v_min int;
  v_nom text;
begin
  perform public.patisgest_exiger_modules(array['cake-design']);
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;

  if p_client_nom is null or length(trim(p_client_nom)) < 1 or length(trim(p_client_nom)) > 100 then
    raise exception 'Nom du client requis (1 a 100 caracteres).';
  end if;
  if p_telephone is not null and length(p_telephone) > 40 then
    raise exception 'Telephone trop long (40 max).';
  end if;
  if p_date_event is null or p_date_event < DATE '2000-01-04' then
    raise exception 'Date d''evenement invalide.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 a 10000).';
  end if;
  if p_prix_ht is null or p_prix_ht <= 0 or p_prix_ht > 100000000000 then
    raise exception 'Prix HT invalide.';
  end if;
  if coalesce(p_notes, '') <> '' and length(p_notes) > 500 then
    raise exception 'Notes trop longues (500 max).';
  end if;

  if p_options is not null and jsonb_typeof(p_options) = 'array' then
    if jsonb_array_length(p_options) > 50 then
      raise exception 'Trop d''options (50 max).';
    end if;
    for o in select value from jsonb_array_elements(p_options) loop
      v_nom := trim(coalesce(o->>'name', ''));
      v_cout := (o->>'cout')::numeric;
      v_min := (o->>'minutes')::integer;
      if v_nom = '' or length(v_nom) > 100 then raise exception 'Option : nom requis (100 max).'; end if;
      if v_cout is null or v_cout < 0 or v_cout > 1000000000 then
        raise exception 'Option : cout invalide.'; end if;
      if v_min is null or v_min < 0 or v_min > 100000 then
        raise exception 'Option : duree invalide.'; end if;
      v_opts := v_opts || jsonb_build_object('name', v_nom, 'cout', v_cout, 'minutes', v_min);
    end loop;
  end if;

  v_numero := 'DEV-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_retro := jsonb_build_array(
    jsonb_build_object('date', p_date_event - 3, 'task', 'Valider le devis', 'done', false),
    jsonb_build_object('date', p_date_event - 1, 'task', 'Préparer structure + crémage', 'done', false),
    jsonb_build_object('date', p_date_event, 'task', 'Décorer + livrer', 'done', false));

  insert into public.cakes (
    client_id, numero, client_nom, telephone, date_event, retro, nb_parts,
    options, prix_ht, acompte, statut, notes, cgv)
  values (
    v_client, v_numero, trim(p_client_nom), nullif(trim(coalesce(p_telephone, '')), ''),
    p_date_event, v_retro, p_nb_parts, v_opts, p_prix_ht, 0, 'devis',
    nullif(trim(coalesce(p_notes, '')), ''), coalesce(p_cgv, false))
  returning id into v_id;

  return jsonb_build_object('cake_id', v_id, 'numero', v_numero);
end;
$$;
create function public.creer_cake(p_client_nom text,p_telephone text,p_date_event date,p_nb_parts integer,p_prix_ht numeric,p_options jsonb,p_notes text,p_cgv boolean)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform public.patisgest_exiger_modules(array['cake-design']);
 if public.patisgest_mon_role() is distinct from 'proprietaire' then raise exception 'Creation sans site reservee au proprietaire.' using errcode='42501'; end if;
 return public.patisgest_creer_cake_interne(p_client_nom,p_telephone,p_date_event,p_nb_parts,p_prix_ht,p_options,p_notes,p_cgv);
end $$;
revoke all on function public.creer_cake(text,text,date,integer,numeric,jsonb,text,boolean) from public,anon;
grant execute on function public.creer_cake(text,text,date,integer,numeric,jsonb,text,boolean) to authenticated,service_role;

alter function public.affecter_production_cake(uuid,uuid,uuid,numeric) rename to patisgest_affecter_cake_interne;
revoke all on function public.patisgest_affecter_cake_interne(uuid,uuid,uuid,numeric) from public,anon,authenticated;
create function public.affecter_production_cake(p_id uuid,p_version_id uuid,p_site_id uuid,p_qte numeric)
returns void language plpgsql security definer set search_path='' as $$
begin
 perform public.patisgest_exiger_modules(array['cake-design']);
 perform public.patisgest_exiger_cake(p_id);
 perform public.patisgest_exiger_site(p_site_id);
 perform public.patisgest_affecter_cake_interne(p_id,p_version_id,p_site_id,p_qte);
end $$;
revoke all on function public.affecter_production_cake(uuid,uuid,uuid,numeric) from public,anon;
grant execute on function public.affecter_production_cake(uuid,uuid,uuid,numeric) to authenticated,service_role;

-- Seul le dossier créé dans cette transaction contourne le contrôle ancien
-- site nul ; un appel externe ne peut pas invoquer les fonctions internes.
create or replace function public.creer_cake_production(p_client_nom text,p_telephone text,p_date_event date,p_nb_parts integer,p_prix_ht numeric,p_options jsonb,p_notes text,p_cgv boolean,p_version_id uuid,p_site_id uuid,p_qte numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r jsonb;
begin
 perform public.patisgest_exiger_modules(array['cake-design']);
 if public.patisgest_mon_role() not in ('proprietaire','vendeur') or public.patisgest_mon_role() is null then raise exception 'Creation reservee au comptoir.' using errcode='42501'; end if;
 perform public.patisgest_exiger_site(p_site_id);
 r:=public.patisgest_creer_cake_interne(p_client_nom,p_telephone,p_date_event,p_nb_parts,p_prix_ht,p_options,p_notes,p_cgv);
 perform public.patisgest_affecter_cake_interne((r->>'cake_id')::uuid,p_version_id,p_site_id,p_qte);
 return r;
end $$;

-- Les RPC de mutation et leurs erreurs n'accèdent jamais à un autre site.
-- Édition retournant prix et TVA : le labo doit passer par une future RPC
-- expurgée ; interdiction conservatrice en attendant.
do $$ declare x record; f record; def text; n integer; begin
 for x in select * from (values
  ('editer_cake','perform public.patisgest_exiger_cake(p_id); if public.patisgest_mon_role() = ''labo'' then raise exception ''Edition reservee au comptoir.'' using errcode=''42501''; end if;'),
  ('accepter_cgv','perform public.patisgest_exiger_cake(p_id);'),
  ('evoluer_cake','perform public.patisgest_exiger_cake(p_id);')
 ) as v(nom,garde) loop
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  if n<>1 then raise exception 'RPC absente ou ambigue : %',x.nom; end if;
  select pg_get_functiondef(p.oid) src, pg_get_function_identity_arguments(p.oid) args into f from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.proname=x.nom and p.prosecdef;
  if position('p_id uuid' in f.args)=0 then raise exception 'Signature inattendue : %',x.nom; end if;
  def:=regexp_replace(f.src,E'\\mbegin\\M','begin '||x.garde,'i');
  if def=f.src then raise exception 'Garde impossible : %',x.nom; end if;
  execute def;
 end loop;
end $$;

-- Ne pas renvoyer de références d'autres sites depuis une RPC definer, même
-- si un ancien JSON d'OF contient des identifiants incorrects ou mal formés.
create or replace function public.cake_liens_production()
returns table(cake_id uuid,of_id uuid,of_numero text,lots jsonb)
language plpgsql security definer set search_path='' as $$
declare v_client uuid; v_role text;
begin
 perform public.patisgest_exiger_modules(array['cake-design']);
 select u.client_id,u.role::text into v_client,v_role from public.utilisateurs u where u.auth_user_id=auth.uid() limit 1;
 if v_client is null or v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.' using errcode='42501'; end if;
 return query select c.id,o.id,o.numero,coalesce((select jsonb_agg(jsonb_build_object('numero',l.numero,'lotId',l.id))
  from jsonb_array_elements(case when jsonb_typeof(o.lots_produits)='array' then o.lots_produits else '[]'::jsonb end) x
  join public.lots l on l.id::text=x->>'lotId' and l.client_id=v_client and public.patisgest_site_autorise(l.site_id)), '[]'::jsonb)
 from public.cakes c join public.ordres_fabrication o on o.id=c.of_id and o.client_id=v_client
 where c.client_id=v_client and (public.patisgest_site_autorise(c.site_id) or (c.site_id is null and v_role='proprietaire'))
 and public.patisgest_site_autorise(o.site_id);
end $$;
commit;
