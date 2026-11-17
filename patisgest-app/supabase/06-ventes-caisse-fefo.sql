-- =====================================================================
-- PatisGest - Sprint 2 : ventes caisse avec consommation FEFO atomique
-- A executer UNE fois dans Supabase > SQL Editor > Run.
--
-- Principes :
--   * Les ventes passent UNIQUEMENT par la fonction vendre_article()
--     (SECURITY DEFINER avec frontiere d'autorisation testee) qui cree
--     la vente, decremente les lots FEFO et ecrit les mouvements dans
--     UNE transaction ; aucune politique INSERT sur ventes.
--   * Tous les gestes internes sont revalide : appelant authentifie,
--     role autorise, article/site/lot du MEME client, quantite valide.
--   * Idempotence : unique (client_id, ticket) + rejeu du meme ticket.
--   * Les lots sont verrouilles (FOR UPDATE) : pas de survente.
--   * Aucun DELETE/UPDATE sur mouvements (journal immuable).
-- Idempotent : peut etre relance.
-- =====================================================================

-- Index d'idempotence (2 ventes existantes, tickets deja distincts).
create unique index if not exists ventes_client_ticket_key
  on public.ventes (client_id, ticket);

create or replace function public.vendre_article(
  p_article_id uuid,
  p_site_id uuid,
  p_qte numeric,
  p_ticket text
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
  v_article_tva numeric;
  v_article_pv numeric;
  v_site_client uuid;
  v_existing uuid;
  v_sale_id uuid;
  v_numero text;
  v_ticket text;
  v_remaining numeric;
  v_missing numeric := 0;
  v_take numeric;
  v_total_ht numeric;
  v_total_ttc numeric;
  v_consumed jsonb := '[]'::jsonb;
  v_lignes jsonb;
  v_manquants jsonb := '[]'::jsonb;
  r record;
begin
  -- ---- validation des entrees ----
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_article_id is null or p_site_id is null then
    raise exception 'Article et site obligatoires.';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantite invalide.';
  end if;
  v_ticket := trim(coalesce(p_ticket, ''));
  if length(v_ticket) < 1 or length(v_ticket) > 80 then
    raise exception 'Ticket invalide.';
  end if;

  -- ---- appelant : tenant + role (definer => controles explicites) ----
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a vendre.';
  end if;

  -- ---- idempotence : meme ticket => meme vente ----
  select id into v_existing
    from public.ventes
   where client_id = v_client and ticket = v_ticket
   limit 1;
  if v_existing is not null then
    return jsonb_build_object('sale_id', v_existing, 'duplicate', true, 'missing', 0, 'totalHT', 0, 'totalTTC', 0, 'lots', '[]'::jsonb);
  end if;

  -- ---- perimetre tenant : article et site ----
  select a.client_id, a.tva, a.pv_ht into v_article_client, v_article_tva, v_article_pv
    from public.articles a where a.id = p_article_id;
  if v_article_client is null then
    raise exception 'Article introuvable.';
  end if;
  if v_article_client <> v_client then
    raise exception 'Article hors perimetre.';
  end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then
    raise exception 'Site introuvable.';
  end if;
  if v_site_client <> v_client then
    raise exception 'Site hors perimetre.';
  end if;

  if v_article_pv is null or v_article_pv < 0 or v_article_tva is null or v_article_tva < 0 or v_article_tva > 100 then
    raise exception ' Prix ou TVA article invalide.';
  end if;

  v_remaining := round(p_qte, 4);
  v_numero := 'V-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' || substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);

  -- ---- insertion d'abord (garantit l'atomicite de l'idempotence) ----
  begin
    insert into public.ventes (client_id, site_id, numero, ticket, date_vente, source, lignes, manquants, total_ht, total_ttc)
    values (v_client, p_site_id, v_numero, v_ticket, current_date, 'caisse', '[]'::jsonb, '[]'::jsonb, 0, 0)
    returning id into v_sale_id;
  exception when unique_violation then
    select id into v_existing
      from public.ventes
     where client_id = v_client and ticket = v_ticket
     limit 1;
    return jsonb_build_object('sale_id', coalesce(v_existing, v_sale_id), 'duplicate', true, 'missing', 0, 'totalHT', 0, 'totalTTC', 0, 'lots', '[]'::jsonb);
  end;

  -- ---- consommation FEFO (lots verrouilles, perimetre tenant) ----
  for r in
    select l.id, l.qte_rest, l.numero
      from public.lots l
     where l.client_id = v_client
       and l.article_id = p_article_id
       and l.site_id = p_site_id
       and not l.bloque
       and l.qte_rest > 0
     order by l.congele asc, l.dlc asc nulls last, l.date_reception asc, l.id asc
       for update
  loop
    exit when v_remaining <= 0;
    v_take := least(r.qte_rest, v_remaining);
    update public.lots l set qte_rest = l.qte_rest - v_take where l.id = r.id;
    v_remaining := round(v_remaining - v_take, 4);
    v_consumed := v_consumed || jsonb_build_object('lotId', r.id, 'numero', r.numero, 'qty', v_take);
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, r.id, p_site_id, 'vente', -v_take, v_article_pv, v_ticket, 'Vente');
  end loop;

  -- ---- manque : ecart sans lot, jamais de stock negatif ----
  if v_remaining > 0 then
    v_missing := v_remaining;
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, p_article_id, null, p_site_id, 'vente', -v_remaining, v_article_pv, v_ticket, 'Vente sans stock');
    v_manquants := jsonb_build_array(jsonb_build_object('articleId', p_article_id, 'qty', v_remaining));
  end if;

  -- ---- totaux en centimes coherents (somme arrondie) ----
  v_total_ht := round(p_qte * v_article_pv, 2);
  v_total_ttc := round(p_qte * v_article_pv * (1 + v_article_tva / 100), 2);
  v_lignes := jsonb_build_array(jsonb_build_object(
    'articleId', p_article_id,
    'qty', p_qte,
    'pu', v_article_pv,
    'tva', v_article_tva,
    'totalHT', v_total_ht,
    'totalTTC', v_total_ttc,
    'lots', v_consumed,
    'missing', v_missing
  ));

  update public.ventes v
     set lignes = v_lignes,
         manquants = v_manquants,
         total_ht = v_total_ht,
         total_ttc = v_total_ttc
   where v.id = v_sale_id;

  return jsonb_build_object(
    'sale_id', v_sale_id,
    'duplicate', false,
    'missing', v_missing,
    'totalHT', v_total_ht,
    'totalTTC', v_total_ttc,
    'lots', v_consumed
  );
end;
$$;

-- Frontiere d'autorisation : execution uniquement pour les roles applicatifs.
revoke execute on function public.vendre_article(uuid, uuid, numeric, text) from public, anon;
grant execute on function public.vendre_article(uuid, uuid, numeric, text) to authenticated, service_role;
