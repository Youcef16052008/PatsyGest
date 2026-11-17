-- =====================================================================
-- Migration 13 — Traçabilité : rapport de rappel & blocage en cascade.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * lots.bloque_motif  : motif du blocage
--   * rappel_lot         : rapport en cascade (ventes, OFs consommateurs,
--                          transferts départ/arrivée, lots descendants
--                          produits ou transférés, profondeur max3,
--                          ventes des descendants) — lecture tous rôles
--   * bloquer_lot        : blocage avec motif, propagation facultative
--                          aux descendants ; déblocage jamais propagé
--                          (propriétaire + labo)
-- Rejouable.
-- =====================================================================

alter table public.lots add column if not exists bloque_motif text;

create or replace function public.bloquer_lot(
  p_lot_id uuid,
  p_bloque boolean,
  p_motif text,
  p_descendants boolean
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
  v_lot record;
  v_motif text := nullif(trim(coalesce(p_motif, '')), '');
  v_frontier uuid[] := array[p_lot_id];
  v_next uuid[];
  v_visited uuid[] := '{}';
  v_outer uuid;
  v_hit uuid;
  v_m record;
  v_depth int := 0;
  v_touches uuid[] := '{}';
  v_of record;
  v_p jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  if p_lot_id is null then raise exception 'Lot obligatoire.'; end if;
  if coalesce(p_bloque, false) then
    if v_motif is null or length(v_motif) < 1 or length(v_motif) > 200 then
      raise exception 'Motif de blocage requis (200 max).';
    end if;
  end if;

  select l.id, l.client_id into v_lot from public.lots l where l.id = p_lot_id;
  if not found then raise exception 'Lot introuvable.'; end if;
  if v_lot.client_id <> v_client then raise exception 'Lot hors perimetre.'; end if;

  if coalesce(p_bloque, false) and coalesce(p_descendants, false) then
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
