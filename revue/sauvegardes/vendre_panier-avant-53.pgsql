-- Sauvegarde du corps de `public.vendre_panier` sur le PILOTE
-- (evepzygucfxarpdnflzv), prise le 2026-11-26 **avant** la migration 53.
--
-- Obtenue par `pg_get_functiondef` en lecture seule, avec `app_schema_version = 51`.
-- Ce n'est PAS le corps de `21-prix-demain-panier.sql` : comparé ligne à
-- ligne, le corps installé porte des éléments absents de la chaîne 01→51 du
-- dépôt (garde `patisgest_mon_role() = 'labo'`, `patisgest_exiger_modules`,
-- fuseau `Africa/Algiers`). La fonction du pilote a donc été posée hors de la
-- chaîne versionnée, à une date antérieure. C'est la seule source de vérité
-- pour un retour arrière, et c'est pourquoi elle est conservée ici telle quelle.
--
-- Retour arrière : exécuter ce fichier entier, puis
-- `update public.app_schema_version set version = 51 where id = 1;`
-- (la 53 fait `insert ... values (1, 53)`, elle ne met pas à jour une ligne).
--
-- Différences connues avec le corps que la 53 installe, mesurées le 2026-11-26 :
--   1. la 53 ajoute le contrôle de portée du ticket (site, source, panier) —
--      c'est son objet, et la raison d'être de cette sauvegarde ;
--   2. la 53 retire `carte` de la liste des modes de règlement (c'est le
--      changement de la migration 44, non appliquée au pilote) — sans effet
--      sur les données : 0 vente en `carte` sur 9.
--
-- Marqueur de la version 53 : « Ticket deja utilise pour une autre vente. »
-- ABSENT d'ici — c'est précisément ce que la 53 ajoute.

CREATE OR REPLACE FUNCTION public.vendre_panier(p_site_id uuid, p_lignes jsonb, p_ticket text, p_mode_paiement text DEFAULT 'especes'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_site_client uuid;
  v_ticket text := trim(coalesce(p_ticket, ''));
  v_mode text := coalesce(nullif(trim(coalesce(p_mode_paiement, '')), ''), 'especes');
  v_existing record;
  v_sale_id uuid;
  v_numero text;
  v_item record;
  v_art record;
  v_remaining numeric;
  v_line_missing numeric;
  v_missing_total numeric := 0;
  v_take numeric;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_consumed jsonb;
  v_all_lots jsonb := '[]'::jsonb;
  v_lignes_out jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  r record;
begin if public.patisgest_mon_role() = 'labo' then raise exception 'Reserve au comptoir.' using errcode = '42501'; end if; perform public.patisgest_exiger_modules(string_to_array('caisse', '|'));
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if length(v_ticket) < 1 or length(v_ticket) > 80 then
    raise exception 'Ticket invalide.';
  end if;
  if v_mode not in ('especes', 'carte', 'cheque_virement') then
    raise exception 'Mode de reglement invalide.';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array'
     or jsonb_array_length(p_lignes) < 1 or jsonb_array_length(p_lignes) > 50 then
    raise exception 'Le panier doit contenir entre 1 et 50 produits.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a vendre.';
  end if;

  -- Idempotence : le rejeu d'un ticket déjà enregistré ne déduit jamais deux fois le stock.
  select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement
    into v_existing
    from public.ventes v
   where v.client_id = v_client and v.ticket = v_ticket
   limit 1;
  if v_existing.id is not null then
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'numero', v_existing.numero,
      'duplicate', true,
      'missing', 0,
      'totalHT', v_existing.total_ht,
      'totalTTC', v_existing.total_ttc,
      'modePaiement', v_existing.mode_paiement,
      'lots', '[]'::jsonb
    );
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  v_numero := 'V-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);

  begin
    insert into public.ventes
      (client_id, site_id, numero, ticket, date_vente, source, mode_paiement, lignes, manquants, total_ht, total_ttc)
    values
      (v_client, p_site_id, v_numero, v_ticket, (now() at time zone 'Africa/Algiers')::date, 'caisse', v_mode, '[]'::jsonb, '[]'::jsonb, 0, 0)
    returning id into v_sale_id;
  exception when unique_violation then
    select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement
      into v_existing
      from public.ventes v
     where v.client_id = v_client and v.ticket = v_ticket
     limit 1;
    return jsonb_build_object(
      'sale_id', v_existing.id,
      'numero', v_existing.numero,
      'duplicate', true,
      'missing', 0,
      'totalHT', coalesce(v_existing.total_ht, 0),
      'totalTTC', coalesce(v_existing.total_ttc, 0),
      'modePaiement', v_existing.mode_paiement,
      'lots', '[]'::jsonb
    );
  end;

  -- Fusion des doublons et tri déterministe par article_id (zéro interblocage FOR UPDATE).
  for v_item in
    select
      (coalesce(x->>'articleId', x->>'article_id'))::uuid as article_id,
      round(sum((x->>'qte')::numeric), 4) as qte
    from jsonb_array_elements(p_lignes) x
    group by (coalesce(x->>'articleId', x->>'article_id'))::uuid
    order by (coalesce(x->>'articleId', x->>'article_id'))::uuid asc
  loop
    if v_item.article_id is null or v_item.qte is null or v_item.qte <= 0 or v_item.qte > 100000000 then
      raise exception 'Ligne de panier invalide (produit ou quantite).';
    end if;

    select a.id, a.client_id, a.niveau, a.nom, a.code, a.pv_ht, a.tva
      into v_art
      from public.articles a where a.id = v_item.article_id;
    if v_art.client_id is null then raise exception 'Article introuvable.'; end if;
    if v_art.client_id <> v_client then raise exception 'Article hors perimetre.'; end if;
    if v_art.niveau <> 'produit' then raise exception 'Seuls les produits finis peuvent etre vendus en caisse.'; end if;
    if v_art.pv_ht is null or v_art.pv_ht <= 0 or v_art.tva is null or v_art.tva < 0 or v_art.tva > 100 then
      raise exception 'Prix ou TVA article invalide.';
    end if;

    v_remaining := v_item.qte;
    v_line_missing := 0;
    v_consumed := '[]'::jsonb;

    -- FEFO éligible : ni lot bloqué, ni lot périmé (dlc < (now() at time zone 'Africa/Algiers')::date).
    for r in
      select l.id, l.qte_rest, l.numero
        from public.lots l
       where l.client_id = v_client
         and l.article_id = v_art.id
         and l.site_id = p_site_id
         and not l.bloque
         and l.qte_rest > 0
         and (l.dlc is null or l.dlc >= (now() at time zone 'Africa/Algiers')::date)
       order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
         for update
    loop
      exit when v_remaining <= 0;
      v_take := least(r.qte_rest, v_remaining);
      update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
      v_remaining := round(v_remaining - v_take, 4);
      v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
      v_all_lots := v_all_lots || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take, 'articleId', v_art.id);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_art.id, r.id, p_site_id, 'vente', -v_take, v_art.pv_ht, v_ticket, 'Vente');
    end loop;

    if v_remaining > 0 then
      v_line_missing := v_remaining;
      v_missing_total := round(v_missing_total + v_remaining, 4);
      insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
      values (v_client, v_art.id, null, p_site_id, 'vente', -v_remaining, v_art.pv_ht, v_ticket, 'Vente sans stock');
      v_manquants := v_manquants || jsonb_build_object('articleId', v_art.id, 'qty', v_remaining);
    end if;

    v_line_ht := round(v_item.qte * v_art.pv_ht, 2);
    v_line_ttc := round(v_item.qte * v_art.pv_ht * (1 + v_art.tva / 100), 2);
    v_total_ht := v_total_ht + v_line_ht;
    v_total_ttc := v_total_ttc + v_line_ttc;

    v_lignes_out := v_lignes_out || jsonb_build_object(
      'articleId', v_art.id,
      'code', v_art.code,
      'nom', v_art.nom,
      'qty', v_item.qte,
      'pu', v_art.pv_ht,
      'tva', v_art.tva,
      'totalHT', v_line_ht,
      'totalTTC', v_line_ttc,
      'lots', v_consumed,
      'missing', v_line_missing
    );
  end loop;

  update public.ventes v
     set lignes = v_lignes_out,
         manquants = v_manquants,
         total_ht = round(v_total_ht, 2),
         total_ttc = round(v_total_ttc, 2)
   where v.id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'numero', v_numero,
    'duplicate', false,
    'missing', v_missing_total,
    'totalHT', round(v_total_ht, 2),
    'totalTTC', round(v_total_ttc, 2),
    'modePaiement', v_mode,
    'lines', jsonb_array_length(v_lignes_out),
    'lots', v_all_lots
  );
end;
$function$
