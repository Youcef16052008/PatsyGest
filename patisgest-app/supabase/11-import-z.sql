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
