    -- BFS : miroirs de transfert (source qte<0) + lots produits par les OF
    -- consommateurs, profondeur max3.
    while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < 3 loop
      v_next := '{}';
      for v_outer in select unnest(v_frontier) loop
        if v_outer = any(v_visited) then continue; end if;
        v_visited := array_append(v_visited, v_outer);
        v_touches := array_append(v_touches, v_outer);
        for v_m in
          select m.type, m.qte, m.ref from public.mouvements m
           where m.client_id = v_client and m.lot_id = v_outer
        loop
          if v_m.type = 'transfert' and v_m.qte < 0 then
            for v_hit in
              select distinct m2.lot_id from public.mouvements m2
               where m2.client_id = v_client and m2.ref = v_m.ref
                 and m2.type = 'transfert' and m2.lot_id is not null and m2.lot_id <> v_outer
            loop
              if not (v_hit = any(v_visited)) then v_next := array_append(v_next, v_hit); end if;
            end loop;
          elsif v_m.type = 'production' and v_m.qte < 0 then
            select o.id, o.lots_produits into v_of from public.ordres_fabrication o
             where o.client_id = v_client and o.numero = v_m.ref;
            if found and v_of.lots_produits is not null then
              for v_p in select value from jsonb_array_elements(v_of.lots_produits) loop
                begin
                  v_hit := (v_p->>'lotId')::uuid;
                exception when invalid_text_representation then continue;
                end;
                if v_hit is not null and not (v_hit = any(v_visited)) then
                  v_next := array_append(v_next, v_hit);
                end if;
              end loop;
            end if;
          end if;
        end loop;
      end loop;
      v_frontier := v_next;
      v_depth := v_depth + 1;
    end loop;
  else
    v_touches := array[p_lot_id];
  end if;

  if coalesce(p_bloque, false) then
    update public.lots l set bloque = true, bloque_motif = v_motif
     where l.id = any(v_touches) and l.client_id = v_client;
  else
    -- Déblocage : uniquement le lot choisi (jamais propagé).
    update public.lots l set bloque = false, bloque_motif = null
     where l.id = p_lot_id and l.client_id = v_client;
    v_touches := array[p_lot_id];
  end if;

  return jsonb_build_object(
    'lot_id', p_lot_id,
    'bloque', coalesce(p_bloque, false),
    'touches', coalesce(array_length(v_touches, 1), 0));
end;
$$;
revoke execute on function public.bloquer_lot(uuid, boolean, text, boolean) from public, anon;
grant execute on function public.bloquer_lot(uuid, boolean, text, boolean) to authenticated, service_role;

create or replace function public.rappel_lot(p_lot_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_lot record;
  v_frontier uuid[] := array[p_lot_id];
  v_next uuid[];
  v_visited uuid[] := '{}';
  v_outer uuid;
  v_hit uuid;
  v_m record;
  v_depth int := 0;
  v_ventes jsonb := '[]'::jsonb;
  v_of_cons jsonb := '[]'::jsonb;
  v_transferts jsonb := '[]'::jsonb;
  v_desc jsonb := '[]'::jsonb;
  v_of_prod jsonb := null;
  v_of record;
  v_t record;
  v_p jsonb;
  v_dir text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if p_lot_id is null then raise exception 'Lot obligatoire.'; end if;

  select l.id, l.numero, l.article_id, l.site_id, l.dlc, l.bloque, l.bloque_motif,
         a.code, a.nom
    into v_lot
    from public.lots l join public.articles a on a.id = l.article_id
   where l.id = p_lot_id and l.client_id = v_client;
  if not found then raise exception 'Lot introuvable.'; end if;

  -- OF producteur du lot (contexte)
  select jsonb_build_object('numero', o.numero, 'statut', o.statut) into v_of_prod
    from public.ordres_fabrication o
   where o.client_id = v_client
     and o.lots_produits @> jsonb_build_array(jsonb_build_object('lotId', p_lot_id::text))
   limit 1;

  while coalesce(array_length(v_frontier, 1), 0) > 0 and v_depth < 3 loop
    v_next := '{}';
    for v_outer in select unnest(v_frontier) loop
      if v_outer = any(v_visited) then continue; end if;
      v_visited := array_append(v_visited, v_outer);
      if v_outer <> p_lot_id then
        v_desc := v_desc || (select coalesce(jsonb_agg(jsonb_build_object(
            'id', l.id, 'numero', l.numero, 'code', a.code, 'nom', a.nom,
            'dlc', l.dlc, 'site_id', l.site_id, 'bloque', l.bloque)), '[]'::jsonb)
          from public.lots l join public.articles a on a.id = l.article_id
         where l.id = v_outer and l.client_id = v_client);
      end if;
      for v_m in
        select m.type, m.qte, m.ref from public.mouvements m
         where m.client_id = v_client and m.lot_id = v_outer
      loop
        if v_m.type = 'vente' then
          v_ventes := v_ventes || (select coalesce(jsonb_agg(jsonb_build_object(
              'ticket', vt.ticket, 'date_vente', vt.date_vente, 'total_ht', vt.total_ht,
              'site_id', vt.site_id)), '[]'::jsonb)
            from public.ventes vt
           where vt.client_id = v_client and vt.ticket = v_m.ref);
        elsif v_m.type = 'production' and v_m.qte < 0 then
          select jsonb_build_object('numero', o.numero, 'statut', o.statut) into v_t
            from public.ordres_fabrication o
           where o.client_id = v_client and o.numero = v_m.ref;
          if found then v_of_cons := v_of_cons || to_jsonb(v_t); end if;
          select o.id, o.lots_produits into v_of from public.ordres_fabrication o
           where o.client_id = v_client and o.numero = v_m.ref;
          if found and v_of.lots_produits is not null then
            for v_p in select value from jsonb_array_elements(v_of.lots_produits) loop
              begin
                v_hit := (v_p->>'lotId')::uuid;
              exception when invalid_text_representation then continue;
              end;
              if v_hit is not null and not (v_hit = any(v_visited)) then
                v_next := array_append(v_next, v_hit);
              end if;
            end loop;
          end if;
        elsif v_m.type = 'transfert' then
          v_dir := case when v_m.qte < 0 then 'depart' else 'arrivee' end;
          if not exists (select 1 from jsonb_array_elements(v_transferts) e
                          where e->>'ref' = v_m.ref and e->>'direction' = v_dir) then
            v_transferts := v_transferts || jsonb_build_object('ref', v_m.ref, 'direction', v_dir);
          end if;
          if v_m.qte < 0 then
            for v_hit in
              select distinct m2.lot_id from public.mouvements m2
               where m2.client_id = v_client and m2.ref = v_m.ref
                 and m2.type = 'transfert' and m2.lot_id is not null and m2.lot_id <> v_outer
            loop
              if not (v_hit = any(v_visited)) then v_next := array_append(v_next, v_hit); end if;
            end loop;
          end if;
        end if;
      end loop;
    end loop;
    v_frontier := v_next;
    v_depth := v_depth + 1;
  end loop;

  -- Ventes des lots descendants (via leurs mouvements de vente)
  declare
    v_desc_ventes jsonb := '[]'::jsonb;
    v_d uuid;
  begin
    for v_d in select unnest(v_visited) loop
      if v_d = p_lot_id then continue; end if;
      v_desc_ventes := v_desc_ventes || (select coalesce(jsonb_agg(jsonb_build_object(
          'ticket', vt.ticket, 'date_vente', vt.date_vente, 'total_ht', vt.total_ht,
          'code', a.code, 'nom', a.nom)), '[]'::jsonb)
        from public.mouvements m
        join public.ventes vt on vt.client_id = m.client_id and vt.ticket = m.ref
        join public.articles a on a.id = m.article_id
       where m.client_id = v_client and m.lot_id = v_d and m.type = 'vente');
    end loop;
    return jsonb_build_object(
      'lot', jsonb_build_object(
        'id', v_lot.id, 'numero', v_lot.numero, 'code', v_lot.code, 'nom', v_lot.nom,
        'dlc', v_lot.dlc, 'site_id', v_lot.site_id,
        'bloque', v_lot.bloque, 'bloque_motif', v_lot.bloque_motif),
      'of_producteur', v_of_prod,
      'ventes', coalesce(v_ventes, '[]'::jsonb),
      'of_consigneurs', coalesce(v_of_cons, '[]'::jsonb),
      'transferts', coalesce(v_transferts, '[]'::jsonb),
      'descendants', coalesce(v_desc, '[]'::jsonb),
      'ventes_descendants', coalesce(v_desc_ventes, '[]'::jsonb));
  end;
end;
$$;
revoke execute on function public.rappel_lot(uuid) from public, anon;
grant execute on function public.rappel_lot(uuid) to authenticated, service_role;

-- ===== 14-cake-edition-cgv-ticket.sql =====
-- =====================================================================
-- Migration 14 — Cake Design complet : édition, preuve CGV, TVA, ticket.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * cakes.tva_pct / cgv_accepted_at / cgv_version : TVA configurable et
--     preuve d'acceptation des CGV horodatée + version
--   * editer_cake  : édition d'un devis (statut 'devis' uniquement —
--                    verrouillé ensuite), régénère le rétroplanning
--   * accepter_cgv : enregistre l'acceptation (tous les rôles, comme
--                    creer_cake)
--   * Paiements/transitions : déjà couverts par evoluer_cake (09).
--   * Ticket imprimable : UI (cake-ticket.tsx, format80 mm).
-- Rejouable.
-- =====================================================================

alter table public.cakes add column if not exists tva_pct numeric not null default 0;
alter table public.cakes add column if not exists cgv_accepted_at timestamptz;
alter table public.cakes add column if not exists cgv_version text;

create or replace function public.editer_cake(
  p_id uuid,
  p_client_nom text,
  p_telephone text,
  p_date_event date,
  p_nb_parts int,
  p_prix_ht numeric,
  p_tva_pct numeric,
  p_notes text,
  p_options jsonb
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
  c record;
  v_opts jsonb := '[]'::jsonb;
  o jsonb;
  v_nom text;
  v_cout numeric;
  v_min int;
begin
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
  if p_tva_pct is null or p_tva_pct < 0 or p_tva_pct > 100 then
    raise exception 'TVA invalide (0 a 100).';
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
        raise exception 'Option : cout invalide.';
      end if;
      if v_min is null or v_min < 0 or v_min > 100000 then
        raise exception 'Option : duree invalide.';
      end if;
      v_opts := v_opts || jsonb_build_object('name', v_nom, 'cout', v_cout, 'minutes', v_min);
    end loop;
  end if;

  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;
  if c.statut <> 'devis' then
    raise exception 'Edition possible uniquement depuis le devis (statut actuel : %).', c.statut;
  end if;

  update public.cakes k set
    client_nom = trim(p_client_nom),
    telephone = nullif(trim(coalesce(p_telephone, '')), ''),
    date_event = p_date_event,
    retro = jsonb_build_array(
      jsonb_build_object('date', p_date_event - 3, 'task', 'Valider le devis', 'done', false),
      jsonb_build_object('date', p_date_event - 1, 'task', 'Préparer structure + crémage', 'done', false),
      jsonb_build_object('date', p_date_event, 'task', 'Décorer + livrer', 'done', false)),
    nb_parts = p_nb_parts,
    prix_ht = p_prix_ht,
    tva_pct = p_tva_pct,
    options = coalesce(nullif(v_opts, '[]'::jsonb), k.options),
    notes = nullif(trim(coalesce(p_notes, '')), '')
   where k.id = p_id
   returning k.numero, k.prix_ht, k.tva_pct into c;

  return jsonb_build_object('cake_id', p_id, 'numero', c.numero, 'prix_ht', c.prix_ht, 'tva_pct', c.tva_pct);
end;
$$;
revoke execute on function public.editer_cake(uuid, text, text, date, int, numeric, numeric, text, jsonb) from public, anon;
grant execute on function public.editer_cake(uuid, text, text, date, int, numeric, numeric, text, jsonb) to authenticated, service_role;

create or replace function public.accepter_cgv(p_id uuid, p_version text)
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
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo','vendeur') then raise exception 'Role non autorise.'; end if;
  if p_version is null or length(trim(p_version)) < 1 or length(trim(p_version)) > 50 then
    raise exception 'Version des CGV requise (50 max).';
  end if;
  select k.* into c from public.cakes k where k.id = p_id for update;
  if not found then raise exception 'Devis introuvable.'; end if;
  if c.client_id <> v_client then raise exception 'Devis hors perimetre.'; end if;
  update public.cakes k set
    cgv = true,
    cgv_accepted_at = now(),
    cgv_version = trim(p_version)
   where k.id = p_id;
  return jsonb_build_object('cake_id', p_id, 'cgv', true, 'version', trim(p_version));
end;
$$;
revoke execute on function public.accepter_cgv(uuid, text) from public, anon;
grant execute on function public.accepter_cgv(uuid, text) to authenticated, service_role;

-- ===== 15-parametres-couts.sql =====
-- =====================================================================
-- Migration 15 — Paramètres de coûts (Sprint3, RC-04).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * parametres_couts :1 ligne par tenant — taux horaire + charges %,
--     entrées de la MO chargée RC-04 = (min ÷ 60) × taux × (1 + charges %).
--   * Fiche de coût RC-01..RC-10 : lib cost-sheet.ts + tests (10 recettes
--     de référence au centime) — calcul côté app, aucune RPC.
--   * Caisse hors-ligne : file localStorage + idempotence par ticket
--     (vendre_article, migration06) — pas de DDL.
-- Rejouable.
-- =====================================================================

create table if not exists public.parametres_couts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null unique references public.clients(id) on delete cascade,
  taux_horaire numeric not null default 0,
  charges_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  constraint pc_taux_positif check (taux_horaire >= 0 and taux_horaire <= 1000000),
  constraint pc_charges_positif check (charges_pct >= 0 and charges_pct <= 1000)
);
alter table public.parametres_couts enable row level security;
create policy select_pc on public.parametres_couts for select using (client_id = public.patisgest_mon_client());
create policy insert_pc on public.parametres_couts for insert to authenticated with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy update_pc on public.parametres_couts for update to authenticated using (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo')) with check (client_id = public.patisgest_mon_client() and public.patisgest_mon_role() in ('proprietaire','labo'));

-- ===== 16-creer-of-idempotent.sql =====
-- =====================================================================
-- Migration 16 — Idempotence de creer_of (Sprint4 : file OF hors-ligne).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * ordres_fabrication.client_ref : référence fournie par le client
--     (file hors-ligne) — index unique partiel par tenant : resynchroniser
--     la file ne crée jamais2 OF (réponse duplicate:true).
--   * creer_of(..., p_client_ref) : avant insertion, retourne l'OF
--     existant si le client_ref est déjà connu.
-- Rejouable. Le corps complet ci-dessous =07-of-production.sql mis à jour.
-- =====================================================================

alter table public.ordres_fabrication add column if not exists client_ref text;
create unique index if not exists ofs_client_ref_uniq
  on public.ordres_fabrication (client_id, client_ref) where client_ref is not null;

create or replace function public.creer_of(
  p_version_id uuid,
  p_site_id uuid,
  p_qte_prevue numeric,
  p_date_prevue date,
  p_client_ref text default null
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
  v_famille uuid;
  v_fam_client_check uuid;
  v_produit uuid;
  v_fam_nom text;
  v_ver_client uuid;
  v_version integer;
  v_rendement numeric;
  v_ingredients jsonb;
  v_site_client uuid;
  v_scale numeric;
  v_besoins jsonb := '[]'::jsonb;
  v_snapshot jsonb;
  v_numero text;
  v_of_id uuid;
  v_code text;
  v_qty numeric;
  v_article uuid;
  b jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_version_id is null or p_site_id is null then
    raise exception 'Recette et site obligatoires.';
  end if;
  if p_qte_prevue is null or p_qte_prevue <= 0 or p_qte_prevue > 100000000 then
    raise exception 'Quantite prevue invalide.';
  end if;
  if p_date_prevue is null then
    raise exception 'Date prevue obligatoire.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a creer des OF.';
  end if;

  -- Idempotence hors-ligne : un meme client_ref ne cre jamais2 OF
  -- (resynchronisation de la file sans reseau ->0 doublon).
  if p_client_ref is not null and length(p_client_ref) between 1 and 64 then
    select o.id, o.numero, o.besoins into v_of_id, v_numero, v_besoins
      from public.ordres_fabrication o
     where o.client_id = v_client and o.client_ref = p_client_ref
     limit 1;
    if v_of_id is not null then
      return jsonb_build_object('of_id', v_of_id, 'numero', v_numero,
        'besoins', coalesce(v_besoins, '[]'::jsonb), 'duplicate', true);
    end if;
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then
    raise exception 'Site introuvable.';
  end if;
  if v_site_client <> v_client then
    raise exception 'Site hors perimetre.';
  end if;

  select rv.client_id, rv.famille_id, rv.version, rv.rendement_qte, rv.ingredients
    into v_ver_client, v_famille, v_version, v_rendement, v_ingredients
    from public.recette_versions rv where rv.id = p_version_id;
  if v_ver_client is null then
    raise exception 'Version de recette introuvable.';
  end if;
  if v_ver_client <> v_client then
    raise exception 'Version hors perimetre.';
  end if;

  select rf.client_id, rf.produit_id, rf.nom into v_fam_client_check, v_produit, v_fam_nom
    from public.recette_familles rf where rf.id = v_famille;
  if not found then
    raise exception 'Famille de recette introuvable.';
  end if;
  if v_fam_client_check <> v_client then
    raise exception 'Famille hors perimetre.';
  end if;
  if v_ingredients is null or jsonb_typeof(v_ingredients) <> 'array'
     or jsonb_array_length(v_ingredients) = 0 then
    raise exception 'Recette sans ingredients.';
  end if;
  if v_produit is null then
    raise exception 'Produit de la famille introuvable.';
  end if;

  v_scale := case when coalesce(v_rendement, 0) > 0 then p_qte_prevue / v_rendement else 1 end;

  -- Besoins etendus cote serveur : articles (avec parage + conversions
  -- d'unites) OU sous-recettes en version figee (profondeur max3), doublons
  -- fusionnes. Le client ne fournit jamais les besoins.
  v_besoins := public.patisgest_besoins_de_version(v_client, p_version_id, v_scale, 0);

  v_numero := 'OF-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  v_snapshot := jsonb_build_object(
    'recette', v_fam_nom,
    'version', v_version,
    'produitId', v_produit,
    'scale', v_scale
  );

  insert into public.ordres_fabrication
    (client_id, famille_id, version_id, site_id, numero, qte_prevue,
     qte_realisee, date_prevue, date_lancement, statut, snapshot, besoins,
     consommations, manquants, lots_produits, cout_reel, client_ref)
  values
    (v_client, v_famille, p_version_id, p_site_id, v_numero, p_qte_prevue,
     0, p_date_prevue, null, 'planifie', v_snapshot, v_besoins,
     '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 0,
     nullif(trim(coalesce(p_client_ref, '')), ''))
  returning id into v_of_id;

  return jsonb_build_object('of_id', v_of_id, 'numero', v_numero,
    'besoins', v_besoins, 'duplicate', false);
end;
$$;

-- ===== 17-confidentialite-couts-rls.sql =====
-- =====================================================================
-- Migration 17 — Confidentialité des coûts (revue indépendante 2026-11-17).
--
-- Problème mesuré avant cette migration, avec le JWT d'un compte VENDEUR :
--   select count(*) from public.parametres_couts;   -- 1  (taux horaire + charges)
--   select mo_min from public.recette_versions;     -- 30.00, energie, frais generaux
-- Les policies SELECT ne filtraient que le TENANT, jamais le ROLE : la
-- structure de coût (RC-01..RC-10) était lisible via l'API REST.
-- SPRINT2.md le signalait déjà ; « RLS3 » dans SPRINT3.md désignait
-- seulement 3 policies, pas une restriction par rôle.
--
-- Décision (cahier RG-15.2) : propriétaire + labo lisent les coûts ;
-- le vendeur encaisse et ne voit que des prix de vente.
--
-- Effets de bord traités ici :
--   * creer_of(uuid,uuid,numeric,date) — 4 args, surcharge historique
--     encore exécutable par `anon` et contournant l'idempotence client_ref
--     de la migration 16 : supprimée (l'app n'appelle que la version 5 args).
--   * rls_auto_enable() — utilitaire de DDL exposé à anon/authenticated :
--     révoqué.
-- Principe : `revoke all on function` d'abord, pour ne laisser aucun droit
-- résiduel hérité de PUBLIC.
-- Rejouable (drop policy if exists / create or replace).
-- =====================================================================

-- ---------------------------------------------------------------- RLS coûts
-- parametres_couts : taux horaire + charges % (RC-04)
drop policy if exists select_pc on public.parametres_couts;
create policy select_pc on public.parametres_couts
  for select to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo'));

-- recette_versions : mo_min, energie, emballage, frais_generaux, cuisson_perte_pct
drop policy if exists recette_versions_tenant_read on public.recette_versions;
create policy recette_versions_cost_read on public.recette_versions
  for select to authenticated using (
    client_id in (select u.client_id from public.utilisateurs u
                   where u.auth_user_id = auth.uid())
    and public.patisgest_mon_role() in ('proprietaire', 'labo'));

-- ------------------------------------------------- RPC simuler_recette
-- SECURITY DEFINER : elle contourne la RLS, donc elle doit vérifier le rôle
-- elle-même. Corps inchangé (relevé sur la base le 2026-11-17), + garde rôle.
create or replace function public.simuler_recette(p_produit_id uuid, p_qte numeric)
returns jsonb
language plpgsql
stable security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_fam record;
  v_ver record;
  v_scale numeric;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  -- Simuler une recette, c'est lire sa structure de coût.
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise : simulation reservee aux roles proprietaire et labo.';
  end if;
  if p_produit_id is null then raise exception 'Produit obligatoire.'; end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;

  select rf.id, rf.code, rf.nom into v_fam
    from public.recette_familles rf
   where rf.client_id = v_client and rf.produit_id = p_produit_id
   limit 1;
  if not found then raise exception 'Aucune recette pour ce produit.'; end if;

  select rv.id, rv.version, rv.rendement_qte, rv.rendement_unite, rv.ingredients into v_ver
    from public.recette_versions rv
   where rv.famille_id = v_fam.id and rv.active = true
   limit 1;
  if not found then raise exception 'Aucune version active pour ce produit.'; end if;
  if v_ver.rendement_qte is null or v_ver.rendement_qte <= 0 then
    raise exception 'Rendement invalide.';
  end if;

  v_scale := p_qte / v_ver.rendement_qte;
  return jsonb_build_object(
    'famille', jsonb_build_object('code', v_fam.code, 'nom', v_fam.nom),
    'version', v_ver.version,
    'rendement_qte', v_ver.rendement_qte,
    'rendement_unite', v_ver.rendement_unite,
    'scale', round(v_scale, 6),
    'besoins', public.patisgest_besoins_de_version(v_client, v_ver.id, v_scale, 0));
end;
$fn$;
revoke all on function public.simuler_recette(uuid, numeric) from public, anon, authenticated;
grant execute on function public.simuler_recette(uuid, numeric) to authenticated, service_role;

-- ---------------------------------------- Surcharge creer_of obsolète (4 args)
-- La migration 16 a livré creer_of(...,p_client_ref). L'ancienne signature
-- restait joignable (y compris par `anon`) et créait un OF sans idempotence.
revoke all on function public.creer_of(uuid, uuid, numeric, date) from public, anon, authenticated;
drop function if exists public.creer_of(uuid, uuid, numeric, date);

-- creer_of 5 args : n'était accordée qu'à authenticated, mais l'ACL portait
-- aussi le droit par défaut `=X` (PUBLIC), que `anon` héritait -> révoqué.
revoke execute on function public.creer_of(uuid, uuid, numeric, date, text) from public;

-- --------------------------------------------------- outil DDL non exposé
revoke all on function public.rls_auto_enable() from public, anon, authenticated;

-- ===== 18-restauration-sauvegarde.sql =====
-- =====================================================================
-- Migration 18 — US-15.2 : restauration d'une sauvegarde complète.
--
-- Constat mesuré sur la base (2026-11-17), policies par table :
--   ventes, clotures, recette_versions, recette_familles,
--   ordres_fabrication, transferts, bons_commande, cakes,
--   historique_prix, fournisseurs, z_imports  → SELECT seulement.
-- Ces tables s'écrivent par des RPC SECURITY DEFINER, jamais en direct.
-- Conséquence : une restauration faite par un simple INSERT côté client
-- échouerait au milieu et laisserait une base à moitié restaurée, en
-- annonçant un succès partiel. C'est exactement le « données identiques »
-- de CA-15 que l'on veut pouvoir prouver.
--
-- Cette migration fournit public.restaurer_sauvegarde(jsonb) :
--   * SECURITY DEFINER + garde de rôle explicite (proprietaire seulement),
--     même principe que simuler_recette / creer_of en migration 17 ;
--   * une seule transaction : tout ou rien ;
--   * client_id forcé à celui de l'appelant, TOUTE autre valeur est refusée
--     (empêche un dump forgé d'écrire chez un autre tenant) ;
--   * ordre topologique imposé, insertion colonne par colonne via jsonb_populate_record ;
--   * les lignes déjà présentes (même PK) sont comptées, pas fatales.
--
-- Rejouable (create or replace + revoke/grant).
-- =====================================================================

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
  -- Ordre topologique : une table n'apparaît qu'après celles qu'elle référence.
  v_ordre  text[] := array[
    'sites','fournisseurs','articles','conversions','parametres_couts',
    'recette_familles','recette_versions','lots','mouvements','historique_prix',
    'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
    'transferts','cakes','releve_temperatures','nettoyages','non_conformites',
    'taches_planning'
  ];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  -- Restaurer, c'est réécrire toutes les données de l'établissement.
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

  -- La racine doit exister : 21 cles etrangeres pointent vers clients.id.
  -- Une base vierge sans la ligne clients ne peut pas etre restauree ; on le
  -- dit explicitement au lieu d'echouer sur une violation de FK a mi-parcours.
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

    -- Garde multi-tenant : toute ligne portant un client_id étranger fait
    -- échouer la restauration AVANT d'écrire quoi que ce soit.
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
        -- Lignes déjà présentes : on ne double pas, on le signale.
        v_ignore := v_ignore || jsonb_build_object(v_tbl, jsonb_array_length(v_lignes));
    end;
  end loop;

  return jsonb_build_object('insere', v_insere, 'ignore', v_ignore);
end;
$fn$;

-- Aucun droit hérité de PUBLIC, puis exécution limitée aux comptes connectés.
revoke all on function public.restaurer_sauvegarde(jsonb) from public, anon, authenticated;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated, service_role;
