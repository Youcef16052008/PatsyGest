-- =====================================================================
-- Migration 10 — Achats : bons de commande multi-lignes + réceptions.
-- Projet : evepzygucfxarpdnflzv (appliquée à distance le 2026-11-17).
-- (colonnes statut/lignes/notes déjà présentes ; contrôles ici)
-- =====================================================================

-- =====================================================================
-- RPC : creer_commande — BC multi-lignes (1..100), sans écriture RLS
-- =====================================================================
create or replace function public.creer_commande(
  p_fournisseur_id uuid,
  p_lignes jsonb,
  p_notes text
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
  v_four_client uuid;
  v_numero text;
  v_id uuid;
  v_lignes jsonb := '[]'::jsonb;
  v_article uuid;
  v_qte numeric;
  v_pu numeric;
  l jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_fournisseur_id is null then raise exception 'Fournisseur obligatoire.'; end if;
  if p_lignes is null or jsonb_typeof(p_lignes) <> 'array' or jsonb_array_length(p_lignes) < 1
     or jsonb_array_length(p_lignes) > 100 then
    raise exception 'Ajoutez au moins une ligne (100 maximum).';
  end if;
  if p_notes is not null and length(p_notes) > 500 then
    raise exception 'Notes trop longues (500 caracteres maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire','labo') then raise exception 'Role non autorise.'; end if;

  select f.client_id into v_four_client from public.fournisseurs f where f.id = p_fournisseur_id;
  if v_four_client is null then raise exception 'Fournisseur introuvable.'; end if;
  if v_four_client <> v_client then raise exception 'Fournisseur hors perimetre.'; end if;

  for l in select value from jsonb_array_elements(p_lignes) loop
    begin
      v_article := (l->>'articleId')::uuid;
    exception when invalid_text_representation then
      raise exception 'Article de ligne invalide.';
    end;
    v_qte := (l->>'qte')::numeric;
    v_pu := (l->>'pu')::numeric;
    if v_qte is null or v_qte <= 0 or v_qte > 100000000 then
      raise exception 'Quantite de ligne invalide.';
    end if;
    if v_pu is null or v_pu < 0 or v_pu > 100000000 then
      raise exception 'Prix unitaire de ligne invalide.';
    end if;
    if not exists (select 1 from public.articles a where a.id = v_article and a.client_id = v_client) then
      raise exception 'Article introuvable ou hors perimetre.';
    end if;
    v_lignes := v_lignes || jsonb_build_object('articleId', v_article, 'qte', v_qte, 'pu', v_pu, 'recu', 0);
  end loop;

  v_numero := 'BC-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));
  insert into public.bons_commande (client_id, fournisseur_id, numero, date_bc, statut, lignes, notes)
  values (v_client, p_fournisseur_id, v_numero, current_date, 'commande', v_lignes, nullif(trim(coalesce(p_notes,'')),''))
  returning id into v_id;

  return jsonb_build_object('commande_id', v_id, 'numero', v_numero, 'lignes', jsonb_array_length(v_lignes));
end;
$$;

revoke execute on function public.creer_commande(uuid, jsonb, text) from public, anon;
grant execute on function public.creer_commande(uuid, jsonb, text) to authenticated, service_role;

-- =====================================================================
-- RPC : recevoir_commande — réception partielle/totale → lots + mouvements
-- + historique des prix (alerte >10 %) ; statut partiel/recu
-- =====================================================================
create or replace function public.recevoir_commande(
  p_commande_id uuid,
  p_site_id uuid,
  p_receptions jsonb
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
  v_bc record;
  v_site_client uuid;
  v_lignes jsonb;
  v_idx integer;
  v_qte numeric;
  v_numero text;
  v_dlc date;
  v_line jsonb;
  v_rest numeric;
  v_lot_id uuid;
  v_n_lots integer := 0;
  v_all_done boolean := true;
  r jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if p_commande_id is null or p_site_id is null then raise exception 'Commande et site obligatoires.'; end if;
  if p_receptions is null or jsonb_typeof(p_receptions) <> 'array' or jsonb_array_length(p_receptions) < 1
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
