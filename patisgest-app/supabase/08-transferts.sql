-- =====================================================================
-- PatisGest - Sprint 2 : transferts de stock entre sites
--   * transferer_article : consomme en FEFO sur le site de depart et
--     recree les lots miroirs (meme numero, DLC, PU, congele) sur le
--     site d'arrivee, avec les deux mouvements, en UNE transaction.
-- Contrairement aux ventes et aux OF, un transfert ne peut PAS creer
-- de manque : le stock disponible (hors lots bloques) doit couvrir la
-- quantite. Toutes les ecritures passent par la fonction (SECURITY
-- DEFINER, frontiere d'autorisation testee) : aucune politique
-- INSERT/UPDATE sur transferts. Rejouable (idempotent au niveau DDL).
-- =====================================================================

create or replace function public.transferer_article(
  p_article_id uuid,
  p_from_site_id uuid,
  p_to_site_id uuid,
  p_qte numeric,
  p_motif text
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
  v_article_client uuid;
  v_from_client uuid;
  v_to_client uuid;
  v_available numeric;
  v_remaining numeric;
  v_take numeric;
  v_transfert_id uuid;
  v_ref text;
  v_lignes jsonb := '[]'::jsonb;
  v_ligne jsonb;
  v_lot record;
  v_dest_id uuid;
  v_motif text;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_article_id is null or p_from_site_id is null or p_to_site_id is null then
    raise exception 'Article et sites obligatoires.';
  end if;
  if p_from_site_id = p_to_site_id then
    raise exception 'Sites de depart et d arrivee distincts requis.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;
  v_motif := nullif(trim(coalesce(p_motif, '')), '');
  if v_motif is not null and length(v_motif) > 120 then
    raise exception 'Motif trop long (120 caractères maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a transférer.';
  end if;

  select a.client_id into v_article_client from public.articles a where a.id = p_article_id;
  if v_article_client is null then
    raise exception 'Article introuvable.';
  end if;
  if v_article_client <> v_client then
    raise exception 'Article hors perimetre.';
  end if;

  select s.client_id into v_from_client from public.sites s where s.id = p_from_site_id;
  if v_from_client is null then
    raise exception 'Site de depart introuvable.';
  end if;
  if v_from_client <> v_client then
    raise exception 'Site de depart hors perimetre.';
  end if;

  select s.client_id into v_to_client from public.sites s where s.id = p_to_site_id;
  if v_to_client is null then
    raise exception 'Site d arrivee introuvable.';
  end if;
  if v_to_client <> v_client then
    raise exception 'Site d arrivee hors perimetre.';
  end if;

  -- Stock disponible au depart (hors lots bloques) : pas de manque autorisé.
  select coalesce(sum(l.qte_rest), 0) into v_available
    from public.lots l
   where l.client_id = v_client
     and l.article_id = p_article_id
     and l.site_id = p_from_site_id
     and not l.bloque
     and l.qte_rest > 0;
  if p_qte > v_available then
    raise exception '%', 'Stock disponible insuffisant pour ce transfert (disponible : ' || v_available || ').';
  end if;

  v_remaining := round(p_qte, 4);
  v_ref := 'TR-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  for v_lot in
    select l.id, l.numero, l.qte_rest, l.pu, l.dlc, l.congele, l.date_reception, l.fournisseur_id
      from public.lots l
     where l.client_id = v_client
       and l.article_id = p_article_id
       and l.site_id = p_from_site_id
       and not l.bloque
       and l.qte_rest > 0
     order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
       for update
  loop
    exit when v_remaining <= 0;
    v_take := least(v_lot.qte_rest, v_remaining);
    update public.lots l set qte_rest = l.qte_rest - v_take where l.id = v_lot.id;
    v_remaining := round(v_remaining - v_take, 4);

    insert into public.lots
      (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, date_reception, ref, congele, bloque)
    values
      (v_client, p_article_id, p_to_site_id, v_lot.fournisseur_id, v_lot.numero, v_take, v_take,
       v_lot.pu, v_lot.dlc, v_lot.date_reception, v_ref, v_lot.congele, false)
    returning id into v_dest_id;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, v_lot.id, p_from_site_id, 'transfert', -v_take, v_lot.pu, v_ref, 'Transfert');
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, v_dest_id, p_to_site_id, 'transfert', v_take, v_lot.pu, v_ref, 'Transfert');

    v_ligne := jsonb_build_object(
      'articleId', p_article_id,
      'fromLotId', v_lot.id,
      'toLotId', v_dest_id,
      'numero', v_lot.numero,
      'qty', v_take
    );
    v_lignes := v_lignes || v_ligne;
  end loop;

  if v_remaining > 0 then
    raise exception 'Stock disponible insuffisant pour ce transfert.';
  end if;

  insert into public.transferts
    (client_id, date_transfert, from_site_id, to_site_id, motif, lignes)
  values
    (v_client, current_date, p_from_site_id, p_to_site_id, v_motif, v_lignes)
  returning id into v_transfert_id;

  return jsonb_build_object(
    'transfert_id', v_transfert_id,
    'ref', v_ref,
    'lots', jsonb_array_length(v_lignes),
    'qte', p_qte
  );
end;
$$;

revoke execute on function public.transferer_article(uuid, uuid, uuid, numeric, text) from public, anon;
grant execute on function public.transferer_article(uuid, uuid, uuid, numeric, text) to authenticated, service_role;
