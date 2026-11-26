-- =====================================================================
-- 53 — Caisse : portée du ticket d'idempotence (site, source, contenu)
--
-- PROBLÈME (mesuré sur le corps installé par 21→50) :
--   `vendre_panier` retrouve un ticket existant par
--       where client_id = v_client and ticket = v_ticket
--   sans `site_id` ni `source`, et rend `duplicate: true` avec les totaux de
--   la vente trouvée. Trois conséquences réelles :
--     1) un rejeu de ticket sur un AUTRE site rend la vente de l'autre site
--        (sale_id et totaux étrangers) et ne déduit aucun stock ici ;
--     2) un ticket déjà utilisé par un IMPORT Z (`source = 'z-import'`,
--        ticket « Z-<n°>-<jjmmaa>-<hash> ») est confirmé comme vente caisse
--        d'un autre site, ou comme celle d'un autre caissier ;
--     3) un panier rejoué avec un CONTENU différent (onglet figé) est
--        silencieusement avalé : la vraie vente n'est jamais enregistrée.
--
-- CORRECTIF : tout conflit de ticket qui n'est pas un rejeu STRICT
-- (même site, même source « caisse », même mode de règlement, mêmes
-- articles, mêmes quantités arrondies à 4 décimales) lève :
--   « Ticket deja utilise pour une autre vente. » (SQLSTATE 23505)
-- Un rejeu strict reste idempotent et ne déduit jamais le stock deux fois.
--
-- Portée : `vendre_article` délègue à `vendre_panier` (vérifié sur la base
-- déployée) : un seul corps à corriger. `importer_z` n'est pas touché : il
-- insère directement sans passer par `vendre_panier`.
--
-- Forme : CREATE OR REPLACE seulement. Aucun DROP, aucune chirurgie de
-- `pg_get_functiondef`, aucune dépendance à un brouillon (ni
-- `patisgest_exiger_site`). `SECURITY DEFINER` et `SET search_path = ''`
-- conservés. Le corps reproduit à l'identique celui installé par 21→50,
-- gardes injectées comprises (rôle labo interdite, module `caisse`), pour que
-- 36 (dates) et 44 (retrait « carte ») restent rejouables sans erreur.
--
-- Non appliquée au pilote : validation humaine explicite requise.
-- =====================================================================
begin;

create or replace function public.vendre_panier(
  p_site_id uuid,
  p_lignes jsonb,
  p_ticket text,
  p_mode_paiement text default 'especes'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
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
  v_demande jsonb;
  v_stocke jsonb;
  r record;
begin if public.patisgest_mon_role() = 'labo' then raise exception 'Reserve au comptoir.' using errcode = '42501'; end if; perform public.patisgest_exiger_modules(string_to_array('caisse', '|'));
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if length(v_ticket) < 1 or length(v_ticket) > 80 then
    raise exception 'Ticket invalide.';
  end if;
  if v_mode not in ('especes', 'cheque_virement') then
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

  -- Contenu normalisé de la demande : identifiants -> uuid, quantités sommes
  -- et arrondies à 4 décimales, tri déterministe. Sert à comparer un rejeu.
  select jsonb_agg(jsonb_build_array(d.article_id, d.qte) order by d.article_id)
    into v_demande
    from (
      select (coalesce(x->>'articleId', x->>'article_id'))::uuid as article_id,
             round(sum((x->>'qte')::numeric), 4) as qte
        from jsonb_array_elements(p_lignes) x
       group by (coalesce(x->>'articleId', x->>'article_id'))::uuid
    ) d;

  -- Idempotence : le rejeu d'un ticket déjà enregistré ne déduit jamais deux fois le stock.
  select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement, v.site_id, v.source, v.lignes
    into v_existing
    from public.ventes v
   where v.client_id = v_client and v.ticket = v_ticket
   limit 1;
  if v_existing.id is not null then
    -- 53 : un ticket n'est réutilisable que sur le même site, pour une vente
    -- de caisse, avec le même règlement et exactement le même panier.
    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from 'caisse' then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
    select jsonb_agg(jsonb_build_array((x->>'articleId')::uuid, (x->>'qty')::numeric)
                     order by (x->>'articleId')::uuid)
      into v_stocke
      from jsonb_array_elements(coalesce(v_existing.lignes, '[]'::jsonb)) x;
    if v_existing.mode_paiement is distinct from v_mode or v_stocke is distinct from v_demande then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
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
    -- Course entre deux transactions sur le même ticket : on refait la même
    -- vérification que ci-dessus, jamais un « duplicate » aveugle.
    select v.id, v.numero, v.total_ht, v.total_ttc, v.mode_paiement, v.site_id, v.source, v.lignes
      into v_existing
      from public.ventes v
     where v.client_id = v_client and v.ticket = v_ticket
     limit 1;
    if v_existing.id is null then
      raise;
    end if;
    if v_existing.site_id is distinct from p_site_id or v_existing.source is distinct from 'caisse' then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
    select jsonb_agg(jsonb_build_array((x->>'articleId')::uuid, (x->>'qty')::numeric)
                     order by (x->>'articleId')::uuid)
      into v_stocke
      from jsonb_array_elements(coalesce(v_existing.lignes, '[]'::jsonb)) x;
    if v_existing.mode_paiement is distinct from v_mode or v_stocke is distinct from v_demande then
      raise exception 'Ticket deja utilise pour une autre vente.' using errcode = '23505';
    end if;
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
$function$;

-- Frontière d'autorisation inchangée (rejouable, sans DROP).
revoke all on function public.vendre_panier(uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.vendre_panier(uuid, jsonb, text, text) to authenticated, service_role;

insert into public.app_schema_version (id, version) values (1, 53)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

commit;
