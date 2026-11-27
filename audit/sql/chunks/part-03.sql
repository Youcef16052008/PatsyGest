     or jsonb_array_length(p_receptions) > 100 then
    raise exception 'Reception invalide (1 a 100 lignes).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;

  select b.* into v_bc from public.bons_commande b where b.id = p_commande_id for update;
  if not found then raise exception 'Commande introuvable.'; end if;
  if v_bc.client_id <> v_client then raise exception 'Commande hors perimetre.'; end if;
  if v_bc.statut = 'recu' then raise exception 'Commande deja entierement recue.'; end if;

  v_lignes := coalesce(v_bc.lignes, '[]'::jsonb);
  if jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
    raise exception 'Commande sans lignes.';
  end if;

  for r in select value from jsonb_array_elements(p_receptions) loop
    v_idx := (r->>'index')::integer;
    v_qte := (r->>'qte')::numeric;
    v_numero := trim(coalesce(r->>'numero',''));
    begin
      v_dlc := (r->>'dlc')::date;
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'DLC invalide.';
    end;
    if v_idx is null or v_idx < 0 or v_idx >= jsonb_array_length(v_lignes) then
      raise exception 'Ligne de commande inexistante.';
    end if;
    if v_qte is null or v_qte <= 0 or v_qte > 100000000 then
      raise exception 'Quantite recue invalide.';
    end if;
    if length(v_numero) < 1 or length(v_numero) > 80 then
      raise exception 'Numero de lot invalide.';
    end if;
    if v_dlc is null or v_dlc < current_date then
      raise exception 'DLC invalide (doit etre au moins au jour).';
    end if;

    v_line := v_lignes->v_idx;
    v_rest := (v_line->>'qte')::numeric - coalesce((v_line->>'recu')::numeric, 0);
    if v_qte > v_rest then
      raise exception '%', 'Quantite superieure au reste a recevoir (reste : ' || v_rest || ').';
    end if;

    insert into public.lots
      (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, date_reception, ref)
    values
      (v_client, (v_line->>'articleId')::uuid, p_site_id, v_bc.fournisseur_id, v_numero, v_qte, v_qte,
       (v_line->>'pu')::numeric, v_dlc, current_date, v_bc.numero)
    returning id into v_lot_id;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, (v_line->>'articleId')::uuid, v_lot_id, p_site_id, 'reception', v_qte,
            (v_line->>'pu')::numeric, v_bc.numero, 'Reception');

    insert into public.historique_prix (client_id, article_id, fournisseur_id, date_prix, pu)
    values (v_client, (v_line->>'articleId')::uuid, v_bc.fournisseur_id, current_date, (v_line->>'pu')::numeric);

    v_lignes := jsonb_set(v_lignes, array[v_idx::text, 'recu'],
      to_jsonb(coalesce((v_lignes->v_idx->>'recu')::numeric, 0) + v_qte));
    v_n_lots := v_n_lots + 1;
  end loop;

  for v_idx in 0 .. jsonb_array_length(v_lignes) - 1 loop
    if coalesce((v_lignes->v_idx->>'recu')::numeric, 0) < (v_lignes->v_idx->>'qte')::numeric then
      v_all_done := false;
      exit;
    end if;
  end loop;

  update public.bons_commande b
     set lignes = v_lignes,
         statut = case when v_all_done then 'recu' else 'partiel' end
   where b.id = p_commande_id;

  return jsonb_build_object(
    'commande_id', p_commande_id,
    'numero', v_bc.numero,
    'statut', case when v_all_done then 'recu' else 'partiel' end,
    'lots', v_n_lots
  );
end;
$$;

revoke execute on function public.recevoir_commande(uuid, uuid, jsonb) from public, anon;
grant execute on function public.recevoir_commande(uuid, uuid, jsonb) to authenticated, service_role;

-- ===== 11-import-z.sql =====
-- =====================================================================
-- Migration 11 — Import Z sécurisé : journal des imports + RPC
-- (format strict, codes résolus côté serveur, FEFO, idempotence,
--  confirmation si même total HT le même jour).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
-- =====================================================================

create table if not exists public.z_imports (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  site_id uuid not null references public.sites(id) on delete cascade,
  date_z date not null,
  caisse text not null,
  numero_z text not null,
  lignes jsonb not null default '[]'::jsonb,
  total_ht numeric not null default 0,
  total_ttc numeric not null default 0,
  vente_id uuid references public.ventes(id) on delete set null,
  imported_by uuid,
  imported_at timestamptz not null default now()
);
alter table public.z_imports enable row level security;
create unique index if not exists z_imports_unique
  on public.z_imports (client_id, date_z, site_id, caisse, numero_z);
-- Lecture tenant uniquement : aucune policy d'écriture → tout passe par la RPC.
create policy select_z_imports on public.z_imports
  for select using (client_id = public.patisgest_mon_client());

-- =====================================================================
-- RPC : importer_z — aperçu revérifié, résolution des codes, FEFO,
-- idempotence (date + caisse + n° Z), total similaire → confirmation.
-- =====================================================================
create or replace function public.importer_z(
  p_date date,
  p_site_id uuid,
  p_caisse text,
  p_numero_z text,
  p_csv text,
  p_confirm boolean
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
  v_caisse text;
  v_numero text;
  v_rows text[];
  v_row text;
  v_parts text[];
  v_idx int := 0;
  v_code text;
  v_qty numeric;
  v_pu numeric;
  v_tva numeric;
  v_cnt int;
  v_article record;
  v_line_ht numeric;
  v_line_ttc numeric;
  v_total_ht numeric := 0;
  v_total_ttc numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_z_id uuid;
  v_similar int;
  v_ticket text;
  v_numero_vente text;
  v_sale_id uuid;
  v_lignes_out jsonb := '[]'::jsonb;
  v_manquants jsonb := '[]'::jsonb;
  v_missing_total numeric := 0;
  v_remaining numeric;
  v_take numeric;
  v_consumed jsonb;
  v_line_missing numeric;
  r record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  if p_date is null or p_date > current_date then raise exception 'Date de Z invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is null then raise exception 'Site introuvable.'; end if;
  if v_site_client <> v_client then raise exception 'Site hors perimetre.'; end if;
  v_caisse := upper(trim(coalesce(p_caisse, '')));
  v_numero := upper(trim(coalesce(p_numero_z, '')));
  if length(v_caisse) < 1 or length(v_caisse) > 80 then raise exception 'Caisse requise (80 max).'; end if;
  if length(v_numero) < 1 or length(v_numero) > 80 then raise exception 'Numero Z requis (80 max).'; end if;
  if p_csv is null or length(trim(p_csv)) < 1 or length(p_csv) > 50000 then
    raise exception 'Donnees Z requises (50000 max).';
  end if;

  v_rows := regexp_split_to_array(trim(p_csv), E'\\r?\\n');
  foreach v_row in array v_rows loop
    v_row := trim(v_row);
    if v_row = '' then continue; end if;
    v_idx := v_idx + 1;
    if v_idx > 100 then raise exception 'Trop de lignes (100 maximum).'; end if;
    v_parts := regexp_split_to_array(v_row, ';');
    if coalesce(array_length(v_parts, 1), 0) <> 3 then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : utilisez code;quantite;prix HT (sans en-tete).';
    end if;
    v_code := trim(v_parts[1]);
    if v_code = '' or v_code !~ '^[0-9A-Za-z._-]+$' then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : code produit.';
    end if;
    if v_parts[2] !~ '^[0-9]+([.,][0-9]{1,4})?$' or v_parts[3] !~ '^[0-9]+([.,][0-9]{1,2})?$' then
      raise exception '%', 'Ligne ' || v_idx || ' invalide : utilisez code;quantite;prix HT (sans en-tete).';
    end if;
    v_qty := replace(v_parts[2], ',', '.')::numeric;
    v_pu := replace(v_parts[3], ',', '.')::numeric;
    if v_qty is null or v_qty <= 0 or v_qty > 1000000
       or v_pu is null or v_pu < 0 or v_pu > 1000000000 then
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
    v_lignes_out := v_lignes_out || (v_lines->i) || jsonb_build_object('lots', v_consumed, 'missing', v_line_missing);
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

revoke execute on function public.importer_z(date, uuid, text, text, text, boolean) from public, anon;
grant execute on function public.importer_z(date, uuid, text, text, text, boolean) to authenticated, service_role;

-- ===== 12-sous-recettes-conversions.sql =====
-- =====================================================================
-- Migration 12 — Sous-recettes & conversions d'unités (MOD-04 / D2).
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
--   * conversions     : facteurs par tenant (RLS complet, rôles labo)
--   * creer_famille   : famille liée à un article (produit/semifini)
--   * creer_version   : version immuable — lignes article OU sous-recette
--                       (pointeur vers version figée, anti-cycle BFS
--                       max3, conversions exigées à la création)
--   * activer_version : une seule active par famille
--   * creer_of        : besoins via patisgest_besoins_de_version
--                       (expansion récursive + parage + conversions,
--                       doublons fusionnés)
-- Rejouable (idempotent au niveau DDL sauf insertions de données).
-- =====================================================================

-- ------------------------------------------------------------ conversions
create table if not exists public.conversions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  unite_from text not null,
  unite_to text not null,
  facteur numeric not null,
  created_at timestamptz not null default now(),
  constraint conversions_paires_differentes check (unite_from <> unite_to),
  constraint conversions_facteur_positif check (facteur > 0 and facteur <= 1000000000),
  constraint conversions_unites_len check (length(unite_from) between 1 and 10 and length(unite_to) between 1 and 10),
  constraint conversions_unique unique (client_id, unite_from, unite_to)
);
alter table public.conversions enable row level security;
create policy select_conversions on public.conversions
  for select using (client_id = public.patisgest_mon_client());
create policy insert_conversions on public.conversions
  for insert to authenticated with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy update_conversions on public.conversions
  for update to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'))
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'));
create policy delete_conversions on public.conversions
  for delete to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire','labo'));

-- Convertit qte de p_from vers p_to : identité, facteur direct ou inverse.
-- Interne uniquement (aucun grant) : appelé par les RPC SECURITY DEFINER.
create or replace function public.patisgest_convertir(
  p_client uuid, p_qte numeric, p_from text, p_to text
)
returns numeric
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_f numeric;
begin
  if p_from = p_to then return p_qte; end if;
  select c.facteur into v_f from public.conversions c
   where c.client_id = p_client and c.unite_from = p_from and c.unite_to = p_to;
  if v_f is not null then return round(p_qte * v_f, 6); end if;
  select c.facteur into v_f from public.conversions c
   where c.client_id = p_client and c.unite_from = p_to and c.unite_to = p_from;
  if v_f is not null and v_f <> 0 then return round(p_qte / v_f, 6); end if;
  return null;
end;
$fn$;
revoke execute on function public.patisgest_convertir(uuid, numeric, text, text) from public, anon, authenticated;
-- ------------------------------------------------------------ creer_famille
create or replace function public.creer_famille(p_code text, p_nom text, p_produit_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_prod record;
  v_id uuid;
  v_code text;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  v_code := upper(trim(coalesce(p_code, '')));
  if length(v_code) < 1 or length(v_code) > 20 then raise exception 'Code requis (20 max).'; end if;
  if p_nom is null or length(trim(p_nom)) < 1 or length(trim(p_nom)) > 100 then
    raise exception 'Nom requis (100 max).';
  end if;
  if p_produit_id is null then raise exception 'Produit obligatoire.'; end if;
  select a.id, a.client_id into v_prod from public.articles a where a.id = p_produit_id;
  if not found then raise exception 'Article introuvable.'; end if;
  if v_prod.client_id <> v_client then raise exception 'Article hors perimetre.'; end if;
  if exists (select 1 from public.recette_familles rf where rf.client_id = v_client and rf.code = v_code) then
    raise exception 'Code de recette deja utilise.';
  end if;
  insert into public.recette_familles (client_id, code, nom, produit_id)
  values (v_client, v_code, trim(p_nom), p_produit_id)
  returning id into v_id;
  return jsonb_build_object('famille_id', v_id, 'code', v_code);
end;
$fn$;
revoke execute on function public.creer_famille(text, text, uuid) from public, anon;
grant execute on function public.creer_famille(text, text, uuid) to authenticated, service_role;
-- ------------------------------------------------------------ creer_version
create or replace function public.creer_version(
  p_famille_id uuid,
  p_rendement_qte numeric,
  p_rendement_unite text,
  p_lignes jsonb,
  p_notes text,
  p_mo_min numeric,
  p_energie numeric,
  p_emballage numeric,
  p_frais_generaux numeric,
  p_cuisson_perte_pct numeric,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_fam record;
  v_version int;
  v_lignes jsonb := '[]'::jsonb;
  l jsonb;
  v_article uuid;
  v_sub uuid;
  v_art record;
  v_sub_rec record;
  v_q numeric;
  v_u text;
  v_conv numeric;
  v_id uuid;
  v_active boolean := coalesce(p_active, false);
  v_queue uuid[] := '{}';
  v_dqueue int[] := '{}';
  v_cur uuid;
  v_cur_d int;
  v_cur_fam uuid;
  v_cur_ing jsonb;
  v_next uuid;
  v_seen uuid[];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  if p_famille_id is null then raise exception 'Famille obligatoire.'; end if;
  if p_rendement_qte is null or p_rendement_qte <= 0 or p_rendement_qte > 100000000 then
    raise exception 'Rendement invalide.';
  end if;
  if p_rendement_unite is null or length(trim(p_rendement_unite)) < 1 or length(trim(p_rendement_unite)) > 10 then
    raise exception 'Unite de rendement requise (10 max).';
  end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) < 1
     or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Ajoutez1 a 100 lignes d ingredients.';
  end if;
  if coalesce(p_notes,'') <> '' and length(p_notes) > 500 then raise exception 'Notes trop longues.'; end if;
  if coalesce(p_mo_min,0) < 0 or coalesce(p_energie,0) < 0 or coalesce(p_emballage,0) < 0
     or coalesce(p_frais_generaux,0) < 0 or coalesce(p_cuisson_perte_pct,0) < 0
     or coalesce(p_cuisson_perte_pct,0) > 100 then
    raise exception 'Cout ou perte invalide.';
  end if;

  select rf.id, rf.client_id, rf.nom, rf.produit_id into v_fam
    from public.recette_familles rf where rf.id = p_famille_id;
  if not found then raise exception 'Famille introuvable.'; end if;
  if v_fam.client_id <> v_client then raise exception 'Famille hors perimetre.'; end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    v_q := (l->>'q')::numeric;
    v_u := nullif(trim(coalesce(l->>'u','')), '');
    if v_q is null or v_q <= 0 or v_q > 100000000 then
      raise exception 'Quantite de ligne invalide.';
    end if;
    if v_u is null or length(v_u) > 10 then
      raise exception 'Unite de ligne requise (10 max).';
    end if;

    begin
      v_article := nullif(l->>'articleId','')::uuid;
      v_sub := nullif(l->>'subVersionId','')::uuid;
    exception when invalid_text_representation then
      raise exception 'Ligne invalide : identifiant non valide.';
    end;
    if v_article is not null and v_sub is not null then
      raise exception 'Ligne ambiguë : article OU sous-recette, pas les deux.';
    end if;

    if v_article is not null then
      select a.id, a.unite, a.nom, a.code into v_art from public.articles a
       where a.id = v_article and a.client_id = v_client;
      if not found then raise exception 'Article introuvable ou hors perimetre.'; end if;
      if v_u <> v_art.unite then
        v_conv := public.patisgest_convertir(v_client, 1, v_u, v_art.unite);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_art.unite || ' (' || v_art.code || ').';
        end if;
      end if;
      v_lignes := v_lignes || jsonb_build_object(
        'articleId', v_article, 'code', v_art.code, 'nom', v_art.nom,
        'q', v_q, 'u', v_u, 'parage', coalesce((l->>'parage')::numeric, 0));

    elsif v_sub is not null then
      select rv.id, rv.client_id, rv.famille_id, rv.rendement_qte, rv.rendement_unite, rf.nom
        into v_sub_rec
        from public.recette_versions rv
        join public.recette_familles rf on rf.id = rv.famille_id
       where rv.id = v_sub;
      if not found then raise exception 'Sous-recette introuvable.'; end if;
      if v_sub_rec.client_id <> v_client then raise exception 'Sous-recette hors perimetre.'; end if;
      if v_sub_rec.famille_id = v_fam.id then raise exception 'Auto-reference de sous-recette interdite.'; end if;
      if v_u <> v_sub_rec.rendement_unite then
        v_conv := public.patisgest_convertir(v_client, 1, v_u, v_sub_rec.rendement_unite);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_sub_rec.rendement_unite || ' (sous-recette).';
        end if;
      end if;
      -- anti-cycle + profondeur : parcours BFS des sous-recettes (max3 generations)
      v_queue := array[v_sub];
      v_dqueue := array[1];
      v_seen := array[v_fam.id];
      while coalesce(array_length(v_queue, 1), 0) > 0 loop
        v_cur := v_queue[1];
        v_cur_d := v_dqueue[1];
        v_queue := v_queue[2:];
        v_dqueue := v_dqueue[2:];
        if v_cur_d > 3 then
          raise exception 'Sous-recettes trop profondes (3 generations maximum).';
        end if;
        select rv.famille_id, rv.ingredients into v_cur_fam, v_cur_ing
          from public.recette_versions rv where rv.id = v_cur;
        if not found then continue; end if;
        if v_cur_fam = v_fam.id then
          raise exception 'Cycle de sous-recettes detecte.';
        end if;
        if v_cur_fam = any(v_seen) then continue; end if;
        v_seen := array_append(v_seen, v_cur_fam);
        for v_next in
          select (x->>'subVersionId')::uuid from jsonb_array_elements(coalesce(v_cur_ing,'[]'::jsonb)) x
           where nullif(x->>'subVersionId','') is not null
        loop
          v_queue := array_append(v_queue, v_next);
          v_dqueue := array_append(v_dqueue, v_cur_d + 1);
        end loop;
      end loop;

      v_lignes := v_lignes || jsonb_build_object(
        'subVersionId', v_sub, 'subFamilleId', v_sub_rec.famille_id,
        'nom', v_sub_rec.nom, 'q', v_q, 'u', v_u);
    else
      raise exception 'Ligne sans article ni sous-recette.';
    end if;
  end loop;

  select coalesce(max(rv.version), 0) + 1 into v_version
    from public.recette_versions rv where rv.famille_id = p_famille_id;

  if v_active then
    update public.recette_versions rv set active = false
     where rv.famille_id = p_famille_id and rv.active = true;
  end if;

  insert into public.recette_versions
    (client_id, famille_id, version, rendement_qte, rendement_unite,
     cuisson_perte_pct, mo_min, energie, emballage, frais_generaux,
     ingredients, notes, active)
  values
    (v_client, p_famille_id, v_version, p_rendement_qte, trim(p_rendement_unite),
     coalesce(p_cuisson_perte_pct, 0), coalesce(p_mo_min, 0), coalesce(p_energie, 0),
     coalesce(p_emballage, 0), coalesce(p_frais_generaux, 0),
     v_lignes, nullif(trim(coalesce(p_notes,'')), ''), v_active)
  returning id into v_id;

  return jsonb_build_object('version_id', v_id, 'version', v_version, 'active', v_active);
end;
$fn$;
revoke execute on function public.creer_version(uuid, numeric, text, jsonb, text, numeric, numeric, numeric, numeric, numeric, boolean) from public, anon;
grant execute on function public.creer_version(uuid, numeric, text, jsonb, text, numeric, numeric, numeric, numeric, numeric, boolean) to authenticated, service_role;

-- ------------------------------------------------------------ activer_version
create or replace function public.activer_version(p_version_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_rec record;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;
  if p_version_id is null then raise exception 'Version obligatoire.'; end if;
  select rv.id, rv.client_id, rv.famille_id, rv.version into v_rec
    from public.recette_versions rv where rv.id = p_version_id;
  if not found then raise exception 'Version introuvable.'; end if;
  if v_rec.client_id <> v_client then raise exception 'Version hors perimetre.'; end if;
  update public.recette_versions rv set active = false
   where rv.famille_id = v_rec.famille_id and rv.active = true and rv.id <> v_rec.id;
  update public.recette_versions rv set active = true where rv.id = v_rec.id;
  return jsonb_build_object('famille_id', v_rec.famille_id, 'version', v_rec.version);
end;
$fn$;
revoke execute on function public.activer_version(uuid) from public, anon;
grant execute on function public.activer_version(uuid) to authenticated, service_role;

-- ------------------------------------------- patisgest_besoins_de_version
-- Expansion des besoins d'une version : articles (parage + conversions
-- d'unités) OU sous-recettes (récursion, profondeur max3), puis fusion
-- des doublons. Interne uniquement (aucun grant).
create or replace function public.patisgest_besoins_de_version(
  p_client uuid, p_version_id uuid, p_scale numeric, p_depth int
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_rec record;
  v_out jsonb := '[]'::jsonb;
  l jsonb;
  v_q numeric;
  v_u text;
  v_art record;
  v_conv numeric;
  v_qty numeric;
  v_sr numeric;
  v_su text;
  v_child_scale numeric;
  v_child jsonb;
  c jsonb;
begin
  if p_depth > 3 then
    raise exception 'Sous-recettes trop profondes (3 generations maximum).';
  end if;
  select rv.rendement_qte, rv.rendement_unite, rv.ingredients into v_rec
    from public.recette_versions rv
   where rv.id = p_version_id and rv.client_id = p_client;
  if not found then raise exception 'Version de recette introuvable.'; end if;
  if v_rec.ingredients is null or jsonb_typeof(v_rec.ingredients) <> 'array'
     or jsonb_array_length(v_rec.ingredients) = 0 then
    raise exception 'Recette sans ingredients.';
  end if;

  for l in select value from jsonb_array_elements(v_rec.ingredients) loop
    v_q := coalesce((l->>'q')::numeric, 0);
    v_u := nullif(l->>'u', '');
    if l->>'articleId' is not null or nullif(l->>'code','') is not null then
      if l->>'articleId' is not null then
        select a.id, a.code, a.nom, a.unite into v_art from public.articles a
         where a.id = (l->>'articleId')::uuid and a.client_id = p_client;
      else
        select a.id, a.code, a.nom, a.unite into v_art from public.articles a
         where a.client_id = p_client and a.code = nullif(l->>'code','')
         limit 1;
      end if;
      if not found then
        raise exception '%', 'Article ingredient introuvable : ' || coalesce(l->>'code', '?');
      end if;
      v_qty := v_q * (1 + coalesce((l->>'parage')::numeric, 0) / 100);
      if v_u is not null and v_u <> v_art.unite then
        v_conv := public.patisgest_convertir(p_client, v_qty, v_u, v_art.unite);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_art.unite || ' (' || v_art.code || ').';
        end if;
        v_qty := v_conv;
      end if;
      v_qty := round(v_qty * p_scale, 4);
      v_out := v_out || jsonb_build_object(
        'articleId', v_art.id, 'code', v_art.code, 'nom', v_art.nom,
        'qty', v_qty, 'unit', v_art.unite);

    elsif l->>'subVersionId' is not null then
      select rv.rendement_qte, rv.rendement_unite into v_sr, v_su
        from public.recette_versions rv
       where rv.id = (l->>'subVersionId')::uuid and rv.client_id = p_client;
      if not found then raise exception 'Sous-recette introuvable.'; end if;
      v_qty := v_q;
      if v_u is not null and v_u <> v_su then
        v_conv := public.patisgest_convertir(p_client, v_qty, v_u, v_su);
        if v_conv is null then
          raise exception '%', 'Conversion d unite manquante : ' || v_u || ' -> ' || v_su || ' (sous-recette).';
        end if;
        v_qty := v_conv;
      end if;
      if v_sr is null or v_sr <= 0 then raise exception 'Rendement de sous-recette invalide.'; end if;
      v_child_scale := (v_qty / v_sr) * p_scale;
      v_child := public.patisgest_besoins_de_version(p_client, (l->>'subVersionId')::uuid, v_child_scale, p_depth + 1);
      for c in select value from jsonb_array_elements(v_child) loop
        v_out := v_out || c;
      end loop;
    else
      raise exception 'Ingredient sans article ni sous-recette.';
    end if;
  end loop;

  select coalesce(jsonb_agg(sub.x), '[]'::jsonb) into v_out from (
    select jsonb_build_object(
      'articleId', x->>'articleId', 'code', x->>'code', 'nom', x->>'nom',
      'qty', round(sum((x->>'qty')::numeric), 4), 'unit', x->>'unit') as x
      from jsonb_array_elements(v_out) x
     group by x->>'articleId', x->>'code', x->>'nom', x->>'unit'
  ) sub;
  return coalesce(v_out, '[]'::jsonb);
end;
$fn$;
revoke execute on function public.patisgest_besoins_de_version(uuid, uuid, numeric, int) from public, anon, authenticated;

-- ------------------------------------------------------------ creer_of (mis à jour)
-- La boucle d'ingrédients est remplacée par l'appel ci-dessous (voir le
-- corps complet de creer_of dans07-of-production.sql ; seul ce fragment
-- change) :
--
--   v_scale := case when coalesce(v_rendement, 0) > 0 then p_qte_prevue / v_rendement else 1 end;
--   v_besoins := public.patisgest_besoins_de_version(v_client, p_version_id, v_scale, 0);
--
-- Compatibilité : les lignes seed à `code` (sans articleId) restent prises
-- en charge par le helper.

-- ===== 13-rappel-blocage-lots.sql =====
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
