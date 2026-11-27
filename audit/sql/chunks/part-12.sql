  alter table public.utilisateurs
    add constraint utilisateurs_telephone_len_chk
    check (telephone is null or char_length(telephone) <= 40);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Journal des alertes de déconnexion (>1h)
-- ---------------------------------------------------------------------------
create table if not exists public.connectivite_alertes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  utilisateur_id uuid references public.utilisateurs(id) on delete set null,
  role text not null,
  utilisateur_nom text,
  telephone_cible text,
  canaux jsonb not null default '[]'::jsonb,
  statut text not null default 'envoye' check (statut in ('envoye', 'partiel', 'echec', 'simulation')),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_connectivite_alertes_client_created
  on public.connectivite_alertes (client_id, created_at desc);

alter table public.connectivite_alertes enable row level security;
revoke all on public.connectivite_alertes from public, anon, authenticated;

drop policy if exists connectivite_alertes_select_owner on public.connectivite_alertes;
create policy connectivite_alertes_select_owner on public.connectivite_alertes
  for select using (
    exists (
      select 1 from public.utilisateurs u
       where u.auth_user_id = auth.uid()
         and u.client_id = connectivite_alertes.client_id
         and u.role = 'proprietaire'
    )
  );

grant select on public.connectivite_alertes to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. RPCs essai, présence et création d'espace
-- ---------------------------------------------------------------------------
create or replace function public.lire_statut_essai_client()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_rec record;
  v_verrouille boolean;
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;

  select
    c.id as client_id,
    c.nom as client_nom,
    c.statut_abonnement,
    c.essai_duree_jours,
    c.essai_debut_at,
    c.essai_fin_at,
    c.paye_at,
    c.license_version,
    u.id as utilisateur_id,
    u.role::text as role,
    u.telephone as utilisateur_telephone
  into v_rec
  from public.utilisateurs u
  join public.clients c on c.id = u.client_id
  where u.auth_user_id = v_auth
  limit 1;

  if not found then
    raise exception 'Compte introuvable.' using errcode = '42501';
  end if;

  v_verrouille := (
    v_rec.statut_abonnement = 'suspendu'
    or (v_rec.statut_abonnement = 'essai' and now() >= v_rec.essai_fin_at)
  );

  return jsonb_build_object(
    'client_id', v_rec.client_id,
    'client_nom', v_rec.client_nom,
    'statut_abonnement', v_rec.statut_abonnement,
    'essai_duree_jours', v_rec.essai_duree_jours,
    'essai_debut_at', v_rec.essai_debut_at,
    'essai_fin_at', v_rec.essai_fin_at,
    'paye_at', v_rec.paye_at,
    'license_version', v_rec.license_version,
    'server_now', now(),
    'verrouille', v_verrouille,
    'utilisateur_id', v_rec.utilisateur_id,
    'role', v_rec.role,
    'utilisateur_telephone', v_rec.utilisateur_telephone
  );
end;
$$;
revoke all on function public.lire_statut_essai_client() from public, anon;
grant execute on function public.lire_statut_essai_client() to authenticated, service_role;

create or replace function public.enregistrer_presence_utilisateur(p_telephone text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_tel text;
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;

  if p_telephone is not null then
    v_tel := nullif(left(trim(p_telephone), 40), '');
    update public.utilisateurs
       set last_seen_at = now(),
           offline_alert_sent_at = null,
           telephone = v_tel
     where auth_user_id = v_auth;
  else
    update public.utilisateurs
       set last_seen_at = now(),
           offline_alert_sent_at = null
     where auth_user_id = v_auth;
  end if;

  return public.lire_statut_essai_client();
end;
$$;
revoke all on function public.enregistrer_presence_utilisateur(text) from public, anon;
grant execute on function public.enregistrer_presence_utilisateur(text) to authenticated, service_role;

create or replace function public.definir_telephone_utilisateur(p_telephone text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_tel text := nullif(left(trim(coalesce(p_telephone, '')), 40), '');
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;
  update public.utilisateurs
     set telephone = v_tel
   where auth_user_id = v_auth;
  if not found then
    raise exception 'Compte introuvable.' using errcode = '42501';
  end if;
  return jsonb_build_object('ok', true, 'telephone', v_tel);
end;
$$;
revoke all on function public.definir_telephone_utilisateur(text) from public, anon;
grant execute on function public.definir_telephone_utilisateur(text) to authenticated, service_role;

create or replace function public.creer_espace_patisserie(
  p_nom_etablissement text,
  p_nom_proprietaire text,
  p_telephone text default null,
  p_duree_essai integer default 90
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_email text;
  v_nom_etab text := trim(coalesce(p_nom_etablissement, ''));
  v_nom_prop text := trim(coalesce(p_nom_proprietaire, ''));
  v_tel text := nullif(left(trim(coalesce(p_telephone, '')), 40), '');
  v_duree integer := least(90, greatest(60, coalesce(p_duree_essai, 90)));
  v_client uuid;
  v_site_labo uuid;
  v_site_boutique uuid;
  v_user_id uuid;
  v_fin timestamptz;
begin
  if v_auth is null then
    raise exception 'Non authentifie.' using errcode = '42501';
  end if;
  if char_length(v_nom_etab) < 2 or char_length(v_nom_etab) > 100 then
    raise exception 'Nom d’établissement invalide (2 à 100 caractères).';
  end if;
  if char_length(v_nom_prop) < 2 or char_length(v_nom_prop) > 100 then
    raise exception 'Nom du propriétaire invalide (2 à 100 caractères).';
  end if;

  if exists(select 1 from public.utilisateurs where auth_user_id = v_auth) then
    raise exception 'Un espace existe déjà pour ce compte.';
  end if;

  select lower(email) into v_email
    from auth.users
   where id = v_auth and deleted_at is null;
  if v_email is null then
    raise exception 'Utilisateur Auth introuvable.';
  end if;

  insert into public.clients (
    nom, telephone, offre, statut_abonnement, essai_duree_jours, essai_debut_at, essai_fin_at
  )
  values (
    v_nom_etab,
    v_tel,
    'solo',
    'essai',
    v_duree,
    now(),
    now() + make_interval(days => v_duree)
  )
  returning id, essai_fin_at into v_client, v_fin;

  insert into public.sites (client_id, nom, type)
  values (v_client, 'Laboratoire', 'laboratoire')
  returning id into v_site_labo;

  insert into public.sites (client_id, nom, type)
  values (v_client, 'Boutique', 'boutique')
  returning id into v_site_boutique;

  insert into public.utilisateurs (
    auth_user_id, client_id, email, nom, role, telephone, last_seen_at
  )
  values (
    v_auth, v_client, v_email, v_nom_prop, 'proprietaire', v_tel, now()
  )
  returning id into v_user_id;

  insert into public.equipe_sites (utilisateur_id, site_id)
  values (v_user_id, v_site_labo), (v_user_id, v_site_boutique)
  on conflict do nothing;

  return jsonb_build_object(
    'client_id', v_client,
    'utilisateur_id', v_user_id,
    'essai_duree_jours', v_duree,
    'essai_fin_at', v_fin
  );
end;
$$;
revoke all on function public.creer_espace_patisserie(text, text, text, integer) from public, anon;
grant execute on function public.creer_espace_patisserie(text, text, text, integer) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. Version du schéma
-- ---------------------------------------------------------------------------
insert into public.app_schema_version (id, version) values (1, 51)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 52-recettes-photos.sql =====
-- Migration 52 — Photo des recettes libres.
--
-- L'écran Recettes affiche une photo par recette (WebP compressé livré avec
-- l'application, ou photo prise au téléphone puis compressée dans le
-- navigateur). Additive only, idempotente, rejouable.

-- 1. Colonne photo : chemin livré (`/recettes/…`) ou data-URL JPEG bornée.
--    La borne de taille est volontairement basse (300 Ko) : une photo de
--    recette est lue à chaque affichage de l'écran Recettes, y compris en 3G.
alter table public.recettes_libres
  add column if not exists photo_url text;

do $$ begin
  alter table public.recettes_libres
    drop constraint if exists recettes_libres_photo_url_check;
  alter table public.recettes_libres
    add constraint recettes_libres_photo_url_check
    check (
      photo_url is null
      or char_length(photo_url) <= 300000
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.recettes_libres.photo_url is
  'Photo de la recette : chemin local /recettes/<slug>.webp ou data:image/jpeg;base64 borné. Validé côté serveur par sanitizeRecipePhoto.';

-- 2. Version de schéma (jamais abaissée).
do $$ begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 52 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

insert into public.app_schema_version (id, version) values (1, 52)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 53-caisse-ticket-scope.sql =====
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

-- ===== 54-anti-abus-vitrine-verrou.sql =====
-- =====================================================================
-- Migration 54 — Verrou transactionnel anti-abus vitrine (H04-06).
--
-- La migration 38 insère la visite AVANT de compter les lignes de la même
-- source, sans verrou. Deux transactions concurrentes peuvent donc toutes
-- deux lire un compte <= 10 et laisser passer une 11e/12e demande.
--
-- Correctif additif : on ne réécrit PAS la migration 38 déjà appliquée. On
-- remplace uniquement le corps de `patisgest_verifier_source_vitrine` par une
-- version qui prend un verrou advisory de transaction, borné au couple
-- (établissement, source), AVANT la purge/insertion/comptage. Les autres
-- sources et les autres boutiques ne partagent pas ce verrou.
--
-- `pg_advisory_xact_lock` se libère à la fin de la transaction PostgREST :
-- une requête qui échoue ne laisse donc pas de verrou session bloquant.
-- Le comportement métier et les droits de la fonction restent inchangés.
--
-- Idempotente, rejouable. Prérequis : 38 et 35 (app_schema_version).
-- =====================================================================

do $$
begin
  if to_regprocedure('public.patisgest_verifier_source_vitrine(text,text)') is null then
    raise exception 'Migration 54 : patisgest_verifier_source_vitrine absente (migration 38 requise).';
  end if;
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 54 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

create or replace function public.patisgest_verifier_source_vitrine(
  p_sous_domaine text,
  p_source text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_nb int;
begin
  if p_source is null or p_source !~ '^[0-9a-f]{32,128}$' then
    raise exception 'Référence de connexion invalide.';
  end if;

  select s.client_id into v_client
    from public.sites s
   where lower(s.subdomain) = lower(trim(coalesce(p_sous_domaine, '')))
     and s.publication = 'publiee'
   limit 1;
  if v_client is null then
    raise exception 'Vitrine introuvable ou non publiée.';
  end if;

  -- Sérialise uniquement les vérifications du même couple boutique/source.
  -- `hashtext` est volontairement qualifié pg_catalog : search_path est vide.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(v_client::text || ':' || p_source)::bigint
  );

  delete from public.vitrine_sources_recentes r
   where r.client_id = v_client and r.created_at < now() - interval '2 hours';

  insert into public.vitrine_sources_recentes (client_id, source_hash)
  values (v_client, p_source);

  select count(*) into v_nb
    from public.vitrine_sources_recentes r
   where r.client_id = v_client and r.source_hash = p_source
     and r.created_at > now() - interval '1 hour';
  if v_nb > 10 then
    raise exception 'Trop de demandes depuis votre connexion. Merci de réessayer plus tard ou d''appeler la boutique.';
  end if;
end;
$$;

revoke all on function public.patisgest_verifier_source_vitrine(text, text) from public;
grant execute on function public.patisgest_verifier_source_vitrine(text, text)
  to anon, authenticated, service_role;

insert into public.app_schema_version (id, version) values (1, 54)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 55-dates-algiers-rattrapage.sql =====
-- =====================================================================
-- Migration 55 — Rattrapage F-04 : date métier dans les fonctions créées
-- APRÈS la migration 36.
--
-- 36 remplaçait `current_date` par `(now() at time zone 'Africa/Algiers')::date`
-- dans les défauts de colonnes et les fonctions présentes à ce moment-là.
-- Les migrations 41 (`enregistrer_avoir`) et 47/50 (`valider_tiroir_jour`)
-- ont ensuite réintroduit `current_date` : entre 23 h et minuit UTC, un
-- avoir ou un comptage de tiroir prenait la date UTC de la veille.
--
-- Correctif additif et rejouable : on ne réécrit aucune migration appliquée.
-- On reprend la définition installée de chaque fonction publique contenant
-- encore `current_date`, on remplace l'occurrence par la date d'Alger, puis on
-- vérifie qu'il n'en reste aucune. Les droits, `SECURITY DEFINER`,
-- `search_path` et le langage sont conservés par `CREATE OR REPLACE`.
--
-- Prérequis : 36 et 35 (app_schema_version). Aucune vue publique avec
-- `current_date` n'est tolérée : une vue serait figée et exigerait un audit.
-- =====================================================================

do $migration$
declare
  r record;
  n integer := 0;
  remplacement constant text := '(now() at time zone ''Africa/Algiers'')::date';
begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 55 : table app_schema_version absente (migration 35 requise).';
  end if;
  if exists (
    select 1 from pg_views v
     where v.schemaname = 'public'
       and pg_get_viewdef(format('%I.%I', v.schemaname, v.viewname)::regclass) ~* '\mcurrent_date\M'
  ) then
    raise exception 'Migration 55 : vue publique contenant current_date, audit manuel requis.';
  end if;

  for r in
    select p.oid, pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  loop
    execute regexp_replace(r.def, '\mcurrent_date\M', remplacement, 'gi');
    n := n + 1;
  end loop;

  if exists (
    select 1 from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')
       and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  ) then
    raise exception 'Migration 55 : current_date subsiste après réécriture.';
  end if;

  raise notice 'Migration 55 : % fonction(s) repassées en date Africa/Algiers.', n;
end $migration$;

insert into public.app_schema_version (id, version) values (1, 55)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 56-profil-langue.sql =====
-- Migration 56 — VAGUE 4 B.2 : langue FR/AR dans le profil utilisateur.
-- Additive only. Idempotente. Prérequis : 01 (utilisateurs) et 35 (app_schema_version).

-- Le cookie reste la source immédiate côté navigateur ; cette colonne permet
-- de retrouver la préférence sur un autre appareil après reconnexion.
alter table public.utilisateurs
  add column if not exists langue text not null default 'fr';

update public.utilisateurs
   set langue = 'fr'
 where langue is null or langue not in ('fr', 'ar');

alter table public.utilisateurs
  drop constraint if exists utilisateurs_langue_check;
alter table public.utilisateurs
  add constraint utilisateurs_langue_check check (langue in ('fr', 'ar'));

comment on column public.utilisateurs.langue is
  'Langue d’interface choisie par l’utilisateur : fr ou ar.';

-- Un utilisateur ne peut modifier QUE sa propre ligne, sans dépendre d’une
-- policy UPDATE supplémentaire sur utilisateurs. SECURITY DEFINER + search_path
-- vide + auth.uid() gardent la même isolation multi-tenant que le reste du schéma.
create or replace function public.enregistrer_langue_utilisateur(p_langue text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_langue not in ('fr', 'ar') then
    raise exception 'Langue invalide.';
  end if;

  select u.client_id into v_client
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;

  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;

  update public.utilisateurs
     set langue = p_langue
   where auth_user_id = v_auth
     and client_id = v_client;

  return jsonb_build_object('ok', true, 'langue', p_langue, 'client_id', v_client);
end;
$$;

revoke execute on function public.enregistrer_langue_utilisateur(text) from public, anon;
grant execute on function public.enregistrer_langue_utilisateur(text) to authenticated, service_role;

insert into public.app_schema_version (id, version)
values (1, 56)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 57-onboarding-pack-dz-rpc.sql =====
-- Migration 57 — VAGUE 4 D : RPC idempotente du pack pâtisserie algérien.
-- Additive only. Idempotente et isolée par client_id.
-- Prérequis : 01/03 (articles), 50 (rôles), 56 (profil langue).
-- La migration 47 historique porte un nom proche mais ne contient que
-- `valider_tiroir_jour` : aucune migration appliquée n'est réécrite ici.

create or replace function public.importer_pack_patisserie_dz(
  p_activite text default 'mixte',
  p_tva text default 'ifu_0'
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
  v_total integer := 0;
  v_imported integer := 0;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Reserve au proprietaire.';
  end if;
  if p_activite not in ('mixte', 'boulangerie', 'patisserie', 'cake_shop') then
    raise exception 'Activite invalide.';
  end if;
  if p_tva not in ('ifu_0', 'reel_dz') then
    raise exception 'Regime TVA invalide.';
  end if;

  -- `on conflict (client_id, code) do nothing` rend l'appel rejouable sans
  -- écraser un prix ou une unité corrigés par le pâtissier. SECURITY DEFINER
  -- n'élargit pas le tenant : client_id vient uniquement du profil de auth.uid().
  with pack(code, nom, niveau, unite, seuil, prix_da, tva_reel, secteur) as (
    values
    ('PF-BAG', 'Baguette traditionnelle', 'produit', 'pcs', 40, 15, 0, 'boulangerie'),
    ('PF-PCM', 'Pain complet / céréales', 'produit', 'pcs', 20, 50, 9, 'boulangerie'),
    ('PF-BRI', 'Brioche artisanale', 'produit', 'pcs', 12, 160, 19, 'boulangerie'),
    ('PF-CRO', 'Croissant au beurre', 'produit', 'pcs', 20, 60, 19, 'boulangerie'),
    ('PF-PAC', 'Pain au chocolat', 'produit', 'pcs', 20, 70, 19, 'boulangerie'),
    ('PF-MIL', 'Mille-feuille vanille', 'produit', 'pcs', 12, 180, 19, 'patisserie'),
    ('PF-ECL', 'Éclair au chocolat', 'produit', 'pcs', 12, 200, 19, 'patisserie'),
    ('PF-TAR', 'Tartelette fruits', 'produit', 'pcs', 10, 240, 19, 'patisserie'),
    ('PF-BAK', 'Baklawa amandes', 'produit', 'kg', 3, 3200, 19, 'patisserie'),
    ('PF-MAK', 'Makrout el louz / miel', 'produit', 'kg', 4, 1800, 19, 'patisserie'),
    ('PF-KAL', 'Kalb El Louz', 'produit', 'pcs', 20, 120, 19, 'patisserie'),
    ('PF-ANN', 'Gâteau anniversaire (10 parts)', 'produit', 'pcs', 2, 3800, 19, 'cake_shop'),
    ('PF-BEN', 'Bento Cake personnalisé', 'produit', 'pcs', 4, 1600, 19, 'cake_shop'),
    ('PF-CUP', 'Boîte 6 Cupcakes décorés', 'produit', 'boîte', 4, 1200, 19, 'cake_shop'),
    ('MP-FAR', 'Farine pâtissière / boulangère', 'matiere', 'kg', 25, 95, 9, 'commun'),
    ('MP-LEV', 'Levure boulangère fraîche', 'matiere', 'kg', 3, 420, 9, 'boulangerie'),
    ('MP-BEU', 'Beurre de tourage / pâtissier', 'matiere', 'kg', 10, 950, 19, 'commun'),
    ('MP-SUC', 'Sucre cristallisé', 'matiere', 'kg', 15, 110, 9, 'commun'),
    ('MP-LAI', 'Lait entier', 'matiere', 'L', 12, 90, 9, 'commun'),
    ('MP-OEU', 'Œufs frais', 'matiere', 'pcs', 60, 22, 9, 'commun'),
    ('MP-AMA', 'Amandes blanchies', 'matiere', 'kg', 5, 1900, 19, 'patisserie'),
    ('MP-MIE', 'Miel pur', 'matiere', 'kg', 4, 1100, 9, 'patisserie'),
    ('MP-CHO', 'Chocolat noir pâtissier', 'matiere', 'kg', 4, 1800, 19, 'commun'),
    ('MP-CRE', 'Crème fraîche 35 %', 'matiere', 'L', 6, 780, 19, 'commun')
  ),
  selection as (
    select
      code,
      nom,
      niveau,
      unite,
      seuil::numeric(12,3) as seuil,
      case
        when p_tva = 'ifu_0' then prix_da::numeric
        else round((prix_da::numeric / (1 + tva_reel::numeric / 100))::numeric, 2)
      end as pv_ht,
      case when p_tva = 'ifu_0' then 0 else tva_reel end::numeric(5,2) as tva
    from pack
    where p_activite = 'mixte' or secteur = 'commun' or secteur = p_activite
  ),
  insere as (
    insert into public.articles (
      client_id, code, nom, niveau, unite, seuil, pv_ht, tva, allergenes, traces
    )
    select v_client, code, nom, niveau, unite, seuil, pv_ht, tva,
           '{}'::text[], '{}'::text[]
      from selection
    on conflict (client_id, code) do nothing
    returning 1
  )
  select (select count(*)::int from selection), (select count(*)::int from insere)
    into v_total, v_imported;

  return jsonb_build_object(
    'ok', true,
    'imported', v_imported,
    'total', v_total,
    'client_id', v_client,
    'activite', p_activite,
    'tva', p_tva
  );
end;
$$;

revoke execute on function public.importer_pack_patisserie_dz(text, text) from public, anon;
grant execute on function public.importer_pack_patisserie_dz(text, text) to authenticated, service_role;

insert into public.app_schema_version (id, version)
values (1, 57)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);
