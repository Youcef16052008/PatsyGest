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
