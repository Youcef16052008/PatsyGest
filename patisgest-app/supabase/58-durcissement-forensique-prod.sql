-- =====================================================================
-- Migration 58 — Durcissement forensique production (P0/P1).
--
-- Corrige sans réécrire les migrations 01..57 déjà appliquées :
--   1. `enregistrer_avoir` / `enregistrer_avoir_article` : verrou `FOR UPDATE`
--      sur `ventes` (anti double-remboursement TOCTOU), choix explicite
--      d'article sur ticket multiproduit, formule TTC alignée sur
--      `vendre_panier`, garde module `caisse` et date `Africa/Algiers`.
--   2. `valider_tiroir_jour` : garde module `cloture`, verrou consultatif
--      anti-course sur `max(revision) + 1`, déduction des avoirs espèces
--      du jour dans l'attendu vendeur, date `Africa/Algiers`.
--   3. `credits_clients` & `avoirs` : policies restrictives `module_guard_*`
--      (`caisse`), garde module sur `enregistrer_reglement_credit`, trigger
--      d'intégrité empêchant un vendeur de forger `statut`/`reglements`/`cree_par`
--      à l'insertion et soldant automatiquement si `montant_regle_da >= montant_total_da`.
--   4. Traçabilité & Loi 18-07 : triggers `journal_audit` sur `credits_clients`
--      et `transferts`, inclusion de `credits_clients` dans
--      `exporter_donnees_personnelles()`, `anonymiser_client()` et nouvelle
--      RPC `anonymiser_credit_client()`.
--   5. Provisioning & licence admin (`service_role` uniquement) :
--      `provisionner_espace_patisserie_admin` (transaction unique) et
--      `master_maj_licence_admin` (incrément atomique de `license_version`).
--
-- Additive only. Rejouable. Version de schéma -> 58.
-- =====================================================================
begin;

-- ---------------------------------------------------------------------------
-- 1. Avoirs & retours : verrou FOR UPDATE + multi-article + TTC aligné + module
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_avoir_article(
  p_vente_id uuid,
  p_mode text,
  p_motif text,
  p_qte numeric,
  p_article_id uuid default null
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
  v_email text;
  v_vente record;
  v_article record;
  v_article_cible uuid;
  v_vendu numeric := 0;
  v_deja numeric := 0;
  v_qte numeric := round(coalesce(p_qte, 0), 4);
  v_motif text := btrim(coalesce(p_motif, ''));
  v_lot_id uuid;
  v_pu numeric := 0;
  v_tva numeric := 0;
  v_ht numeric := 0;
  v_ttc numeric := 0;
  v_lot_cree boolean := false;
  v_numero text;
  v_avoir uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;

  if public.patisgest_mon_role() = 'labo' then
    raise exception 'Reserve au comptoir.' using errcode = '42501';
  end if;
  perform public.patisgest_exiger_modules(array['caisse']);

  select u.client_id, u.role::text, u.email into v_client, v_role, v_email
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Role non autorise a enregistrer un avoir.' using errcode = '42501';
  end if;

  if p_mode is null or p_mode not in ('remise_en_stock', 'destruction') then
    raise exception 'Mode d''avoir invalide : remise en stock ou destruction.';
  end if;
  if length(v_motif) < 3 or length(v_motif) > 500 then
    raise exception 'Motif obligatoire (3 a 500 caracteres).';
  end if;
  if v_qte <= 0 or v_qte > 100000000 then
    raise exception 'Quantite d''avoir invalide.';
  end if;
  if p_vente_id is null then
    raise exception 'Vente obligatoire.';
  end if;

  -- Verrou de ligne sur la vente : sérialise les avoirs concurrents sur un même ticket.
  select v.id, v.client_id, v.site_id, v.lignes into v_vente
    from public.ventes v
   where v.id = p_vente_id
   for update;
  if v_vente.id is null then
    raise exception 'Vente introuvable.';
  end if;
  if v_vente.client_id <> v_client then
    raise exception 'Vente hors perimetre.';
  end if;

  if p_article_id is not null then
    select (l->>'articleId')::uuid into v_article_cible
      from jsonb_array_elements(v_vente.lignes) l
     where (l->>'articleId')::uuid = p_article_id
     limit 1;
    if v_article_cible is null then
      raise exception 'Article absent de cette vente.';
    end if;
  else
    select (l->>'articleId')::uuid into v_article_cible
      from jsonb_array_elements(v_vente.lignes) l
     limit 1;
    if v_article_cible is null then
      raise exception 'Vente sans ligne : avoir impossible.';
    end if;
  end if;

  select a.id, a.client_id, a.nom into v_article
    from public.articles a
   where a.id = v_article_cible;
  if v_article.client_id is null or v_article.client_id <> v_client then
    raise exception 'Article de la vente hors perimetre.';
  end if;

  select coalesce(sum((l->>'qty')::numeric), 0) into v_vendu
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id;

  select coalesce(sum(a.qte), 0) into v_deja
    from public.avoirs a
   where a.vente_id = v_vente.id and a.article_id = v_article.id;

  if v_deja + v_qte > v_vendu then
    raise exception 'Quantite d''avoir superieure a la quantite vendue (% vendu, % deja rendu).',
      v_vendu, v_deja;
  end if;

  if p_mode = 'remise_en_stock' then
    select (lot->>'lotId')::uuid into v_lot_id
      from jsonb_array_elements(v_vente.lignes) l,
           lateral jsonb_array_elements(coalesce(l->'lots', '[]'::jsonb)) lot
     where (l->>'articleId')::uuid = v_article.id
     limit 1;

    if v_lot_id is not null then
      perform 1 from public.lots l
       where l.id = v_lot_id and l.client_id = v_client and l.site_id = v_vente.site_id
       for update;
      if not found then
        v_lot_id := null;
      end if;
    end if;

    if v_lot_id is not null then
      update public.lots l
         set qte_rest = l.qte_rest + v_qte
       where l.id = v_lot_id;
    else
      v_numero := 'RET-' || to_char(now() at time zone 'Africa/Algiers', 'YYMMDDHH24MISS') || '-' ||
                  substr(md5(v_auth::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 6);
      insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception, ref)
      values (v_client, v_article.id, v_vente.site_id, v_numero, v_qte, v_qte, 0, v_today, 'Retour client')
      returning id into v_lot_id;
      v_lot_cree := true;
    end if;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, v_lot_id, v_vente.site_id, 'avoir_remise', v_qte, 0,
            p_vente_id::text, 'Retour client : ' || v_motif);
  else
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, null, v_vente.site_id, 'avoir_destruction', -v_qte, 0,
            p_vente_id::text, 'Destruction : ' || v_motif);
  end if;

  select coalesce((l->>'pu')::numeric, 0), coalesce((l->>'tva')::numeric, 0)
    into v_pu, v_tva
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id
   limit 1;
  v_pu := coalesce(v_pu, 0);
  v_tva := coalesce(v_tva, 0);
  -- Aligné sur `vendre_panier` (migration 53) : arrondi direct sur qte * pu * (1 + tva/100).
  v_ht := round(v_qte * v_pu, 2);
  v_ttc := round(v_qte * v_pu * (1 + v_tva / 100), 2);

  v_numero := 'AV-' || to_char(now() at time zone 'Africa/Algiers', 'YYMMDDHH24MISS') || '-' ||
              substr(md5(v_auth::text || clock_timestamp()::text || gen_random_uuid()::text), 1, 6);
  insert into public.avoirs (client_id, vente_id, site_id, article_id, numero, qte, mode, motif,
                             pu_ht, tva_pct, total_ht, total_ttc,
                             lot_id, lot_retour_cree, acteur_id, acteur_email)
  values (v_client, v_vente.id, v_vente.site_id, v_article.id, v_numero, v_qte, p_mode, v_motif,
          v_pu, v_tva, v_ht, v_ttc,
          v_lot_id, v_lot_cree, v_auth, v_email)
  returning id into v_avoir;

  return jsonb_build_object(
    'avoir_id', v_avoir,
    'numero', v_numero,
    'mode', p_mode,
    'qte', v_qte,
    'total_ht', v_ht,
    'total_ttc', v_ttc,
    'article', v_article.nom,
    'article_id', v_article.id,
    'lot_id', v_lot_id,
    'lot_retour_cree', v_lot_cree
  );
end;
$fn$;

revoke all on function public.enregistrer_avoir_article(uuid, text, text, numeric, uuid) from public, anon;
grant execute on function public.enregistrer_avoir_article(uuid, text, text, numeric, uuid) to authenticated, service_role;

-- Compatibilité stricte 4 arguments : délègue au corps verrouillé ci-dessus.
create or replace function public.enregistrer_avoir(
  p_vente_id uuid,
  p_mode text,
  p_motif text,
  p_qte numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  perform v_today;
  return public.enregistrer_avoir_article(p_vente_id, p_mode, p_motif, p_qte, null);
end;
$fn$;

revoke all on function public.enregistrer_avoir(uuid, text, text, numeric) from public, anon;
grant execute on function public.enregistrer_avoir(uuid, text, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Clôture tiroir : garde module `cloture`, verrou révision, avoirs espèces
-- ---------------------------------------------------------------------------
create or replace function public.valider_tiroir_jour(
  p_date date,
  p_site_id uuid,
  p_fond_initial numeric,
  p_especes_comptees numeric,
  p_attendu numeric default 0,
  p_note text default ''
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
  v_existing int;
  v_revision int;
  v_ventes_especes numeric := 0;
  v_avoirs_especes numeric := 0;
  v_attendu_effectif numeric;
  v_bilan jsonb;
  v_id uuid;
  v_today date := (now() at time zone 'Africa/Algiers')::date;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Comptage tiroir reserve au comptoir.' using errcode = '42501';
  end if;
  perform public.patisgest_exiger_modules(array['cloture']);

  if p_date is null or p_date > v_today then raise exception 'Date invalide.'; end if;
  if p_site_id is null then raise exception 'Site obligatoire.'; end if;
  if p_fond_initial is null or p_fond_initial < 0 then raise exception 'Fond initial invalide.'; end if;
  if p_especes_comptees is null or p_especes_comptees < 0 then raise exception 'Montant compte invalide.'; end if;

  select s.client_id into v_site_client from public.sites s where s.id = p_site_id;
  if v_site_client is distinct from v_client then raise exception 'Site hors perimetre.'; end if;
  if not public.patisgest_site_autorise(p_site_id) then
    raise exception 'Site non autorise.' using errcode = '42501';
  end if;

  -- Sérialise les validations simultanées pour (tenant, site, date) -> révision sans collision.
  perform pg_advisory_xact_lock(
    hashtextextended(v_client::text || ':tiroir:' || p_site_id::text || ':' || p_date::text, 0)
  );

  if v_role = 'vendeur' then
    select coalesce(sum(v.total_ttc), 0) into v_ventes_especes
      from public.ventes v
     where v.client_id = v_client
       and v.site_id = p_site_id
       and v.date_vente = p_date
       and coalesce(v.mode_paiement, 'especes') = 'especes';

    select coalesce(sum(a.total_ttc), 0) into v_avoirs_especes
      from public.avoirs a
      join public.ventes v on v.id = a.vente_id
     where a.client_id = v_client
       and a.site_id = p_site_id
       and (a.cree_le at time zone 'Africa/Algiers')::date = p_date
       and coalesce(v.mode_paiement, 'especes') = 'especes';

    v_attendu_effectif := round((v_ventes_especes - v_avoirs_especes)::numeric, 2);
  else
    v_attendu_effectif := coalesce(p_attendu, 0);
  end if;

  select coalesce(max(c.revision), 0) into v_existing
    from public.clotures c
   where c.client_id = v_client and c.site_id = p_site_id and c.date_cloture = p_date;
  v_revision := v_existing + 1;

  v_bilan := jsonb_build_object(
    'fond_ouverture', round(p_fond_initial::numeric, 2),
    'especes_attendues', round(v_attendu_effectif::numeric, 2),
    'especes_comptees', round(p_especes_comptees::numeric, 2),
    'ecart', round((p_especes_comptees - (p_fond_initial + v_attendu_effectif))::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 250),
    'source', case when v_role = 'vendeur' then 'vendeur_aveugle' else 'dashboard_rapide' end,
    'valide_at', now()
  );

  insert into public.clotures (client_id, date_cloture, site_id, revision, lignes, caisse_bilan)
  values (v_client, p_date, p_site_id, v_revision, '[]'::jsonb, v_bilan)
  returning id into v_id;

  if v_role = 'vendeur' then
    return jsonb_build_object('id', v_id, 'revision', v_revision, 'blind', true);
  end if;
  return jsonb_build_object('id', v_id, 'revision', v_revision, 'caisse_bilan', v_bilan);
end;
$$;

revoke all on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) from public, anon;
grant execute on function public.valider_tiroir_jour(date, uuid, numeric, numeric, numeric, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Crédits clients & avoirs : gardes modules `caisse` + intégrité + audit
-- ---------------------------------------------------------------------------
create or replace function public.enregistrer_reglement_credit(
  p_credit_id uuid,
  p_montant_da numeric,
  p_note text default ''
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
  v_row public.credits_clients%rowtype;
  v_new_regle numeric(12,2);
  v_new_statut text;
  v_entry jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then
    raise exception 'Role non autorise.' using errcode = '42501';
  end if;
  perform public.patisgest_exiger_modules(array['caisse']);
  if p_montant_da is null or p_montant_da <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_row
    from public.credits_clients
   where id = p_credit_id and client_id = v_client
   for update;

  if not found then raise exception 'Credit introuvable.'; end if;
  if v_row.statut <> 'ouvert' then raise exception 'Ce credit est deja solde ou annule.'; end if;

  v_new_regle := round((v_row.montant_regle_da + p_montant_da)::numeric, 2);
  if v_new_regle > v_row.montant_total_da then
    raise exception 'Le montant depasse le reste a payer.';
  end if;

  v_new_statut := case when v_new_regle >= v_row.montant_total_da then 'solde' else 'ouvert' end;
  v_entry := jsonb_build_object(
    'montant_da', round(p_montant_da::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 200),
    'at', now(),
    'par', v_auth
  );

  update public.credits_clients
     set montant_regle_da = v_new_regle,
         statut = v_new_statut,
         reglements = reglements || jsonb_build_array(v_entry),
         updated_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'montant_regle_da', v_new_regle,
    'reste_da', round((v_row.montant_total_da - v_new_regle)::numeric, 2),
    'statut', v_new_statut
  );
end;
$$;

revoke all on function public.enregistrer_reglement_credit(uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_reglement_credit(uuid, numeric, text) to authenticated, service_role;

-- Policies restrictives de module sur `avoirs` et `credits_clients` (alignées sur migration 23).
drop policy if exists module_guard_select on public.avoirs;
create policy module_guard_select on public.avoirs
  as restrictive for select to authenticated
  using (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_select on public.credits_clients;
create policy module_guard_select on public.credits_clients
  as restrictive for select to authenticated
  using (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_insert on public.credits_clients;
create policy module_guard_insert on public.credits_clients
  as restrictive for insert to authenticated
  with check (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_update on public.credits_clients;
create policy module_guard_update on public.credits_clients
  as restrictive for update to authenticated
  using (public.patisgest_module_autorise('caisse'))
  with check (public.patisgest_module_autorise('caisse'));

drop policy if exists module_guard_delete on public.credits_clients;
create policy module_guard_delete on public.credits_clients
  as restrictive for delete to authenticated
  using (public.patisgest_module_autorise('caisse'));

-- Trigger d'intégrité `credits_clients` : empêche la forge à l'insertion vendeur
-- et maintient `statut = 'solde'` cohérent lorsque `montant_total_da` est ajusté.
create or replace function public.patisgest_credits_clients_integrite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := public.patisgest_mon_role();
  v_uid uuid := auth.uid();
begin
  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.cree_par := v_uid;
    end if;
    if v_role = 'vendeur' then
      if new.statut = 'annule' then
        raise exception 'Seul le proprietaire peut annuler un credit.' using errcode = '42501';
      end if;
      new.statut := case when new.montant_regle_da >= new.montant_total_da then 'solde' else 'ouvert' end;
      if new.montant_regle_da > 0 then
        new.reglements := jsonb_build_array(
          jsonb_build_object(
            'montant_da', round(new.montant_regle_da::numeric, 2),
            'note', 'Avance initiale',
            'at', now(),
            'par', v_uid
          )
        );
      else
        new.reglements := '[]'::jsonb;
      end if;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.statut = 'ouvert' and new.montant_regle_da >= new.montant_total_da then
      new.statut := 'solde';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.patisgest_credits_clients_integrite() from public, anon, authenticated;

drop trigger if exists credits_clients_integrite on public.credits_clients;
create trigger credits_clients_integrite
  before insert or update on public.credits_clients
  for each row execute function public.patisgest_credits_clients_integrite();

-- ---------------------------------------------------------------------------
-- 4. Journal d'audit (`credits_clients`, `transferts`) & Loi 18-07 complète
-- ---------------------------------------------------------------------------
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_credits_clients on public.credits_clients;
    create trigger audit_credits_clients
      after insert or update or delete on public.credits_clients
      for each row execute function public.patisgest_audit_ligne();

    if to_regclass('public.transferts') is not null then
      drop trigger if exists audit_transferts on public.transferts;
      create trigger audit_transferts
        after insert or update or delete on public.transferts
        for each row execute function public.patisgest_audit_ligne();
    end if;
  end if;
end
$audit$;

create or replace function public.exporter_donnees_personnelles()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_out jsonb;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Export reserve au proprietaire.';
  end if;

  select jsonb_build_object(
    'genere_le', now(),
    'commandes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'numero', c.numero,
        'client_nom', c.client_nom,
        'telephone', c.telephone,
        'date_evenement', c.date_event,
        'parts', c.nb_parts,
        'montant_ht', c.prix_ht,
        'statut', c.statut
      ) order by c.date_event desc)
        from public.cakes c where c.client_id = v_client
    ), '[]'::jsonb),
    'credits_clients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', cc.id,
        'nom_debiteur', cc.nom_debiteur,
        'telephone', cc.telephone,
        'type_compte', cc.type_compte,
        'montant_total_da', cc.montant_total_da,
        'montant_regle_da', cc.montant_regle_da,
        'statut', cc.statut,
        'cree_le', cc.created_at
      ) order by cc.created_at desc)
        from public.credits_clients cc where cc.client_id = v_client
    ), '[]'::jsonb),
    'comptes_utilisateurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email,
        'role', u.role,
        'cree_le', u.created_at
      ) order by u.created_at)
        from public.utilisateurs u where u.client_id = v_client
    ), '[]'::jsonb)
  ) into v_out;

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client,
          'EXP-' || to_char(now() at time zone 'Africa/Algiers', 'YYMMDDHH24MISS') || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          'export',
          'Export des donnees personnelles de l etablissement', 'etablissement',
          jsonb_array_length(coalesce(v_out->'commandes', '[]'::jsonb))
            + jsonb_array_length(coalesce(v_out->'credits_clients', '[]'::jsonb)),
          v_auth)
  on conflict (client_id, reference) do nothing;

  return v_out;
end;
$fn$;

revoke all on function public.exporter_donnees_personnelles() from public, anon;
grant execute on function public.exporter_donnees_personnelles() to authenticated;

create or replace function public.anonymiser_client(
  p_numero_commande text,
  p_motif text,
  p_reference text
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
  v_motif text := btrim(coalesce(p_motif, ''));
  v_ref text := btrim(coalesce(p_reference, ''));
  v_numero text := btrim(coalesce(p_numero_commande, ''));
  v_tel text;
  v_touche integer := 0;
  v_n integer := 0;
  v_credits_n integer := 0;
  v_demande uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Anonymisation reservee au proprietaire.'; end if;
  if length(v_motif) < 3 then raise exception 'Motif obligatoire.'; end if;
  if length(v_ref) < 3 then raise exception 'Reference de la demande obligatoire.'; end if;
  if v_numero = '' then raise exception 'Commande a anonymiser obligatoire.'; end if;

  select nullif(regexp_replace(coalesce(c.telephone, ''), '\D', '', 'g'), '') into v_tel
    from public.cakes c
   where c.client_id = v_client and c.numero = v_numero
   limit 1;

  update public.cakes c
     set client_nom = 'Client anonymise (' || v_ref || ')',
         telephone = null
   where c.client_id = v_client and c.numero = v_numero;
  get diagnostics v_n = row_count;
  v_touche := v_touche + v_n;
  if v_n = 0 then
    raise exception 'Commande introuvable.';
  end if;

  if v_tel is not null and length(v_tel) >= 8 then
    update public.credits_clients cc
       set nom_debiteur = 'Client anonymise (' || v_ref || ')',
           telephone = '',
           updated_at = now()
     where cc.client_id = v_client
       and regexp_replace(coalesce(cc.telephone, ''), '\D', '', 'g') = v_tel;
    get diagnostics v_credits_n = row_count;
    v_touche := v_touche + v_credits_n;
  end if;

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, v_numero, v_touche, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION', 'credits_touches', v_credits_n);
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_touche,
    'credits_anonymises', v_credits_n,
    'commandes_conservees', (select count(*) from public.cakes where client_id = v_client),
    'ventes_conservees', (select count(*) from public.ventes where client_id = v_client)
  );
end;
$fn$;

revoke all on function public.anonymiser_client(text, text, text) from public, anon;
grant execute on function public.anonymiser_client(text, text, text) to authenticated;

create or replace function public.anonymiser_credit_client(
  p_credit_id uuid,
  p_motif text,
  p_reference text
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
  v_motif text := btrim(coalesce(p_motif, ''));
  v_ref text := btrim(coalesce(p_reference, ''));
  v_n integer := 0;
  v_demande uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Anonymisation reservee au proprietaire.'; end if;
  if p_credit_id is null then raise exception 'Credit obligatoire.'; end if;
  if length(v_motif) < 3 then raise exception 'Motif obligatoire.'; end if;
  if length(v_ref) < 3 then raise exception 'Reference de la demande obligatoire.'; end if;

  update public.credits_clients cc
     set nom_debiteur = 'Client anonymise (' || v_ref || ')',
         telephone = '',
         updated_at = now()
   where cc.client_id = v_client and cc.id = p_credit_id;
  get diagnostics v_n = row_count;
  if v_n = 0 then raise exception 'Credit introuvable.'; end if;

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, 'credit:' || p_credit_id::text, v_n, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation_credit', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION');
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_n
  );
end;
$fn$;

revoke all on function public.anonymiser_credit_client(uuid, text, text) from public, anon;
grant execute on function public.anonymiser_credit_client(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. RPCs atomiques d'administration (`service_role` uniquement)
-- ---------------------------------------------------------------------------
create or replace function public.provisionner_espace_patisserie_admin(
  p_auth_user_id uuid,
  p_nom_etab text,
  p_nom_prop text,
  p_email text,
  p_telephone text default null,
  p_duree_essai integer default 90,
  p_mode_gratuit boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_duree integer := least(90, greatest(60, coalesce(p_duree_essai, 90)));
  v_fin timestamptz := v_now + make_interval(days => v_duree);
  v_client_id uuid;
  v_site_labo uuid;
  v_site_boutique uuid;
  v_util_id uuid;
begin
  if p_auth_user_id is null then raise exception 'Utilisateur Auth obligatoire.'; end if;
  if length(btrim(coalesce(p_nom_etab, ''))) < 2 then raise exception 'Nom etablissement invalide.'; end if;
  if length(btrim(coalesce(p_nom_prop, ''))) < 2 then raise exception 'Nom proprietaire invalide.'; end if;
  if position('@' in coalesce(p_email, '')) < 2 then raise exception 'Email invalide.'; end if;

  insert into public.clients (
    nom, telephone, offre, statut_abonnement,
    essai_duree_jours, essai_debut_at, essai_fin_at,
    paye_at, paye_par_master
  )
  values (
    btrim(p_nom_etab),
    nullif(btrim(coalesce(p_telephone, '')), ''),
    'solo',
    case when coalesce(p_mode_gratuit, false) then 'paye' else 'essai' end,
    v_duree,
    v_now,
    v_fin,
    case when coalesce(p_mode_gratuit, false) then v_now else null end,
    case when coalesce(p_mode_gratuit, false) then 'mode-gratuit' else null end
  )
  returning id into v_client_id;

  insert into public.sites (client_id, nom, type)
  values (v_client_id, 'Laboratoire', 'laboratoire')
  returning id into v_site_labo;

  insert into public.sites (client_id, nom, type)
  values (v_client_id, 'Boutique', 'boutique')
  returning id into v_site_boutique;

  insert into public.utilisateurs (
    auth_user_id, client_id, email, nom, role, telephone, last_seen_at
  )
  values (
    p_auth_user_id,
    v_client_id,
    lower(btrim(p_email)),
    btrim(p_nom_prop),
    'proprietaire',
    nullif(btrim(coalesce(p_telephone, '')), ''),
    v_now
  )
  returning id into v_util_id;

  insert into public.equipe_sites (utilisateur_id, site_id)
  values (v_util_id, v_site_labo), (v_util_id, v_site_boutique);

  return jsonb_build_object(
    'client_id', v_client_id,
    'utilisateur_id', v_util_id,
    'site_labo_id', v_site_labo,
    'site_boutique_id', v_site_boutique,
    'essai_fin_at', v_fin
  );
end;
$$;

revoke all on function public.provisionner_espace_patisserie_admin(uuid, text, text, text, text, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.provisionner_espace_patisserie_admin(uuid, text, text, text, text, integer, boolean)
  to service_role;

create or replace function public.master_maj_licence_admin(
  p_client_id uuid,
  p_action text,
  p_duree_essai integer default null,
  p_statut text default null,
  p_master_email text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row record;
  v_duree integer;
  v_fin timestamptz;
  v_next_ver integer;
begin
  if p_client_id is null then raise exception 'Client obligatoire.'; end if;

  select c.id, c.essai_debut_at, coalesce(c.license_version, 1) as license_version
    into v_row
    from public.clients c
   where c.id = p_client_id
   for update;
  if v_row.id is null then raise exception 'Client introuvable.'; end if;

  v_next_ver := v_row.license_version + 1;

  if p_action = 'duree_essai' then
    v_duree := least(90, greatest(60, coalesce(p_duree_essai, 90)));
    v_fin := coalesce(v_row.essai_debut_at, now()) + make_interval(days => v_duree);
    update public.clients
       set essai_duree_jours = v_duree,
           essai_fin_at = v_fin,
           license_version = v_next_ver
     where id = p_client_id;
  elsif p_action = 'marquer_paye' then
    update public.clients
       set statut_abonnement = 'paye',
           paye_at = now(),
           paye_par_master = nullif(btrim(coalesce(p_master_email, '')), ''),
           license_version = v_next_ver
     where id = p_client_id;
  elsif p_action = 'changer_statut' then
    if p_statut not in ('essai', 'paye', 'suspendu') then
      raise exception 'Statut invalide.';
    end if;
    update public.clients
       set statut_abonnement = p_statut,
           license_version = v_next_ver
     where id = p_client_id;
  else
    raise exception 'Action licence invalide.';
  end if;

  return jsonb_build_object('client_id', p_client_id, 'license_version', v_next_ver);
end;
$$;

revoke all on function public.master_maj_licence_admin(uuid, text, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.master_maj_licence_admin(uuid, text, integer, text, text)
  to service_role;

-- ---------------------------------------------------------------------------
-- 6. Version de schéma -> 58
-- ---------------------------------------------------------------------------
insert into public.app_schema_version (id, version)
values (1, 58)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version),
      applique_le = now();

commit;
