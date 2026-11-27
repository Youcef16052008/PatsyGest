    v_pu := replace(v_parts[3], ',', '.')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000 or v_pu is null or v_pu < 0 or v_pu > 1000000000 then
      raise exception '%', 'Quantite ou prix invalide a la ligne ' || v_idx || '.';
    end if;

    select count(*) into v_cnt from public.articles a
     where a.client_id = v_client and upper(a.code) = upper(v_code) and a.niveau = 'produit';
    if v_cnt = 0 then
      raise exception '%', 'Code produit inconnu a la ligne ' || v_idx || ' : ' || v_code || '. Aucun import n''a ete effectue.';
    end if;
    if v_cnt > 1 then
      raise exception '%', 'Code produit ambigu a la ligne ' || v_idx || ' : ' || v_code || '.';
    end if;
    select a.id, a.code, a.tva into v_article from public.articles a
     where a.client_id = v_client and upper(a.code) = upper(v_code) and a.niveau = 'produit';
    if v_article.tva is null or v_article.tva < 0 or v_article.tva > 100 then
      raise exception '%', 'TVA invalide pour ' || v_article.code || '.';
    end if;

    v_line_ht := round(v_qty * v_pu, 2);
    v_line_ttc := round(v_qty * v_pu * (1 + v_article.tva / 100), 2);
    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;
    v_lines := v_lines || jsonb_build_object(
      'articleId', v_article.id, 'code', v_article.code, 'qty', v_qty, 'pu', v_pu,
      'tva', v_article.tva, 'totalHT', v_line_ht, 'totalTTC', v_line_ttc);
  end loop;
  if v_idx < 1 then raise exception 'Ajoutez entre 1 et 100 lignes.'; end if;

  begin
    insert into public.z_imports (client_id, site_id, date_z, caisse, numero_z, lignes, total_ht, total_ttc, imported_by)
    values (v_client, p_site_id, p_date, v_caisse, v_numero, v_lines, v_total_ht, v_total_ttc, v_auth)
    returning id into v_z_id;
  exception when unique_violation then
    select z.id into v_z_id from public.z_imports z
     where z.client_id = v_client and z.date_z = p_date and z.site_id = p_site_id
       and z.caisse = v_caisse and z.numero_z = v_numero;
    return jsonb_build_object('z_import_id', v_z_id, 'sale_id', null, 'duplicate', true,
      'lines', jsonb_array_length(v_lines), 'totalHT', v_total_ht, 'totalTTC', v_total_ttc, 'missing', 0);
  end;

  select count(*) into v_similar from public.z_imports z
   where z.client_id = v_client and z.date_z = p_date and z.site_id = p_site_id
     and z.id <> v_z_id and abs(z.total_ht - v_total_ht) < 0.005;
  if v_similar > 0 and not coalesce(p_confirm, false) then
    raise exception 'Un autre Z du meme jour a le meme total HT. Verifiez et confirmez cet import distinct.';
  end if;

  v_ticket := 'Z-' || v_numero || '-' || to_char(p_date, 'YYMMDD') || '-' || substr(md5(v_caisse), 1, 4);
  v_numero_vente := 'Z-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
  insert into public.ventes (client_id, site_id, numero, ticket, date_vente, source, lignes, manquants, total_ht, total_ttc)
  values (v_client, p_site_id, v_numero_vente, v_ticket, p_date, 'z-import', '[]'::jsonb, '[]'::jsonb, 0, 0)
  returning id into v_sale_id;

  for i in 0 .. jsonb_array_length(v_lines) - 1 loop
    v_remaining := (v_lines->i->>'qty')::numeric;
    v_consumed := '[]'::jsonb;
    v_line_missing := 0;
    for r in
      select l.id, l.qte_rest, l.numero from public.lots l
       where l.client_id = v_client
         and l.article_id = (v_lines->i->>'articleId')::uuid
         and l.site_id = p_site_id
         and not l.bloque
         and l.qte_rest > 0
         and (l.dlc is null or l.dlc >= p_date)
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(r.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, (v_lines->i->>'articleId')::uuid, r.id, p_site_id, 'vente', -v_take,
              (v_lines->i->>'pu')::numeric, v_ticket, 'Vente Z');
    end loop;
    if v_remaining > 0 then
      v_line_missing := v_remaining;
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, (v_lines->i->>'articleId')::uuid, null, p_site_id, 'vente', -v_remaining,
              (v_lines->i->>'pu')::numeric, v_ticket, 'Vente Z sans stock');
      v_manquants := v_manquants || jsonb_build_object('articleId', (v_lines->i->>'articleId')::uuid, 'qty', v_remaining);
      v_missing_total := v_missing_total + v_remaining;
    end if;
    v_lignes_out := v_lignes_out || ((v_lines->i) || jsonb_build_object('lots', v_consumed, 'missing', v_line_missing));
  end loop;

  update public.ventes v
     set lignes = v_lignes_out, manquants = v_manquants,
         total_ht = v_total_ht, total_ttc = v_total_ttc
   where v.id = v_sale_id;
  update public.z_imports z set vente_id = v_sale_id where z.id = v_z_id;

  return jsonb_build_object(
    'z_import_id', v_z_id, 'sale_id', v_sale_id, 'duplicate', false,
    'lines', jsonb_array_length(v_lines), 'totalHT', v_total_ht,
    'totalTTC', v_total_ttc, 'missing', v_missing_total);
end;
$$;

revoke all on function public.importer_z(date, uuid, text, text, text, boolean) from public, anon, authenticated;
grant execute on function public.importer_z(date, uuid, text, text, text, boolean) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 7. Clôture : flux produits + bilan espèces facultatif séparé
-- ---------------------------------------------------------------------
drop function if exists public.saisir_cloture(date, uuid, jsonb, boolean);

create or replace function public.saisir_cloture(
  p_date date,
  p_site_id uuid,
  p_lignes jsonb,
  p_revise boolean default false,
  p_caisse_bilan jsonb default null
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
  v_site_client uuid;
  v_existing int;
  v_revision int := 1;
  l jsonb;
  v_article uuid;
  v_seen uuid[] := '{}';
  v_enriched jsonb := '[]'::jsonb;
  v_art record;
  v_produit numeric;
  v_vendu numeric;
  v_reporte numeric;
  v_jete numeric;
  v_casse numeric;
  v_offert numeric;
  v_caisse jsonb := null;
  v_fond numeric;
  v_sorties numeric;
  v_comptees numeric;
  v_motif_s text;
  v_id uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then raise exception 'Role non autorise.'; end if;
  if p_date is null or p_date > current_date then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site introuvable ou hors perimetre.'; end if;

  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Liste de produits invalide (1 a 100).';
  end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  if v_existing > 0 and not coalesce(p_revise, false) then
    raise exception 'Une cloture existe deja pour ce site et cette date. Cochez la correction pour creer une nouvelle revision.';
  end if;
  v_revision := v_existing + 1;

  for l in select value from jsonb_array_elements(p_lignes) loop
    v_article := (l->>'articleId')::uuid;
    if v_article is null or v_article = any(v_seen) then
      raise exception 'Produit invalide ou en double.';
    end if;
    v_seen := array_append(v_seen, v_article);

    select a.id, a.code, a.nom, a.unite, a.pv_ht, a.niveau into v_art
      from public.articles a where a.id = v_article and a.client_id = v_client;
    if not found or v_art.niveau <> 'produit' then
      raise exception 'Produit fini introuvable ou hors perimetre.';
    end if;

    v_produit := round(coalesce((l->>'produit')::numeric, 0), 4);
    v_vendu   := round(coalesce((l->>'vendu')::numeric, 0), 4);
    v_reporte := round(coalesce((l->>'reporte')::numeric, 0), 4);
    v_jete    := round(coalesce((l->>'jete')::numeric, 0), 4);
    v_casse   := round(coalesce((l->>'casse')::numeric, 0), 4);
    v_offert  := round(coalesce((l->>'offert')::numeric, 0), 4);
    if least(v_produit, v_vendu, v_reporte, v_jete, v_casse, v_offert) < 0 then
      raise exception 'Quantite negative interdite en cloture.';
    end if;

    v_enriched := v_enriched || jsonb_build_object(
      'articleId', v_art.id,
      'code', v_art.code,
      'name', v_art.nom,
      'unit', v_art.unite,
      'priceHT', coalesce(v_art.pv_ht, 0),
      'produit', v_produit,
      'vendu', v_vendu,
      'reporte', v_reporte,
      'jete', v_jete,
      'casse', v_casse,
      'offert', v_offert
    );
  end loop;

  if p_caisse_bilan is not null and jsonb_typeof(p_caisse_bilan) = 'object'
     and (p_caisse_bilan ? 'especesComptees') then
    v_fond     := round(coalesce((p_caisse_bilan->>'fondInitial')::numeric, 0), 2);
    v_sorties  := round(coalesce((p_caisse_bilan->>'sortiesEspeces')::numeric, 0), 2);
    v_comptees := round((p_caisse_bilan->>'especesComptees')::numeric, 2);
    v_motif_s  := trim(coalesce(p_caisse_bilan->>'motifSortie', ''));
    if v_comptees is null or least(v_fond, v_sorties, v_comptees) < 0
       or greatest(v_fond, v_sorties, v_comptees) > 1000000000 then
      raise exception 'Bilan especes : montant invalide.';
    end if;
    if length(v_motif_s) > 160 then
      raise exception 'Motif de sortie trop long (160 caracteres maximum).';
    end if;
    v_caisse := jsonb_build_object(
      'fondInitial', v_fond,
      'sortiesEspeces', v_sorties,
      'especesComptees', v_comptees,
      'motifSortie', v_motif_s
    );
  end if;

  insert into public.clotures (client_id, site_id, date_cloture, revision, lignes, caisse_bilan)
  values (v_client, p_site_id, p_date, v_revision, v_enriched, v_caisse)
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_caisse is not null);
end;
$$;

revoke all on function public.saisir_cloture(date, uuid, jsonb, boolean, jsonb) from public, anon, authenticated;
grant execute on function public.saisir_cloture(date, uuid, jsonb, boolean, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 8. Restauration de sauvegarde : inclut `demandes_reassort` (compatible v1)
-- ---------------------------------------------------------------------
create or replace function public.restaurer_sauvegarde(p_dump jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth   uuid := auth.uid();
  v_client uuid;
  v_role   text;
  v_tbl    text;
  v_lignes jsonb;
  v_n      int;
  v_insere jsonb := '{}'::jsonb;
  v_ignore jsonb := '{}'::jsonb;
  v_ordre  text[] := array[
    'sites','fournisseurs','articles','conversions','parametres_couts',
    'recette_familles','recette_versions','lots','mouvements','historique_prix',
    'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
    'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
    'non_conformites','taches_planning'
  ];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role is distinct from 'proprietaire' then
    raise exception 'Role non autorise : restauration reservee au proprietaire.';
  end if;
  if p_dump is null or jsonb_typeof(p_dump) <> 'object' then
    raise exception 'Sauvegarde illisible.';
  end if;
  if p_dump->>'client_id' is distinct from v_client::text then
    raise exception 'Cette sauvegarde appartient a un autre etablissement.';
  end if;
  if jsonb_typeof(p_dump->'tables') <> 'array' then
    raise exception 'Sauvegarde sans tables.';
  end if;
  if not exists (select 1 from public.clients where id = v_client) then
    raise exception 'Etablissement introuvable : creez la fiche client avant de restaurer.';
  end if;

  foreach v_tbl in array v_ordre loop
    select t->'lignes' into v_lignes
      from jsonb_array_elements(p_dump->'tables') t
     where t->>'table' = v_tbl;
    if v_lignes is null or jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
      continue;
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_lignes) l
       where l ? 'client_id' and l->>'client_id' is distinct from v_client::text
    ) then
      raise exception 'Ligne etrangere detectee dans la table % : restauration refusee.', v_tbl;
    end if;

    begin
      if v_tbl = 'sites' then
        insert into public.sites select r.* from jsonb_populate_recordset(null::public.sites, v_lignes) r;
      elsif v_tbl = 'fournisseurs' then
        insert into public.fournisseurs select r.* from jsonb_populate_recordset(null::public.fournisseurs, v_lignes) r;
      elsif v_tbl = 'articles' then
        insert into public.articles select r.* from jsonb_populate_recordset(null::public.articles, v_lignes) r;
      elsif v_tbl = 'conversions' then
        insert into public.conversions select r.* from jsonb_populate_recordset(null::public.conversions, v_lignes) r;
      elsif v_tbl = 'parametres_couts' then
        insert into public.parametres_couts select r.* from jsonb_populate_recordset(null::public.parametres_couts, v_lignes) r;
      elsif v_tbl = 'recette_familles' then
        insert into public.recette_familles select r.* from jsonb_populate_recordset(null::public.recette_familles, v_lignes) r;
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
