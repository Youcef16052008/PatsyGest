-- Migration 41 — Retours et avoirs (MOD-06 / US-06.4).
--
-- « En tant que vendeur, je fais un retour/avoir (motif, remise en stock ou
--   destruction tracée). »  — Cahier des charges v4.0, US-06.4
--
-- Décisions, et pourquoi :
--
-- 1. Deux devenirs seulement : `remise_en_stock` ou `destruction`. Pas de
--    troisième voie implicite, pas de « on verra plus tard ». Un retour dont
--    le devenir est flou est un risque sanitaire et un écart de stock garanti.
--
-- 2. La quantité rendue ne peut jamais dépasser la quantité vendue, avoirs
--    successifs inclus. Un avoir est une correction, pas une source de stock :
--    sans ce plafond, un vendeur peut fabriquer de la marchandise avec des
--    retours fictifs.
--
-- 3. Le stock n'est jamais rendu « en vrac » : il retourne dans le lot
--    d'origine quand il existe encore, sinon dans un lot de retour dédié
--    traçable. On ne mélange pas la marchandise rendue avec la production du
--    jour.
--
-- 4. La destruction produit un mouvement négatif à hauteur de la quantité
--    rendue : les pertes restent mesurables (MOD-07, anti-gaspi).
--
-- 5. Tout est journalisé par la migration 40 : la table `avoirs` est ajoutée
--    à la liste des tables auditées, sans code dédié dans cette migration.

-- ---------------------------------------------------------------- table
create table if not exists public.avoirs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  vente_id uuid not null references public.ventes (id) on delete restrict,
  site_id uuid not null references public.sites (id) on delete restrict,
  article_id uuid not null references public.articles (id) on delete restrict,
  numero text not null,
  qte numeric(12,4) not null check (qte > 0),
  -- Montants figés au moment de l'avoir : le prix de vente peut changer
  -- demain, l'avoir déjà émis ne doit pas changer avec lui.
  pu_ht numeric(12,2) not null default 0,
  tva_pct numeric(5,2) not null default 0,
  total_ht numeric(12,2) not null default 0,
  total_ttc numeric(12,2) not null default 0,
  mode text not null check (mode in ('remise_en_stock', 'destruction')),
  motif text not null check (length(btrim(motif)) between 3 and 500),
  lot_id uuid references public.lots (id) on delete set null,
  -- Avoir de remise en stock qui ne trouve plus le lot d'origine : on crée un
  -- lot de retour et on garde le lien. La traçabilité ne dépend pas du hasard.
  lot_retour_cree boolean not null default false,
  acteur_id uuid,
  acteur_email text,
  cree_le timestamptz not null default now(),
  unique (client_id, numero)
);

create index if not exists avoirs_client_date_idx on public.avoirs (client_id, cree_le desc);
create index if not exists avoirs_vente_idx on public.avoirs (vente_id);

alter table public.avoirs enable row level security;

drop policy if exists avoirs_lecture on public.avoirs;
create policy avoirs_lecture on public.avoirs
  for select using (client_id = public.patisgest_mon_client());

-- Aucune écriture directe : tout passe par la fonction ci-dessous, qui vérifie
-- le plafond de quantité, le périmètre du tenant et la cohérence du stock.
-- `revoke all` et pas seulement les écritures : certaines installations
-- accordent des droits par défaut à `anon` sur toute nouvelle table du schéma
-- public, et un `revoke insert, update…` laisserait alors `select` ouvert au
-- visiteur anonyme. C'est exactement ce que la revue de surface anonyme
-- (test `serie-main-vitrine`) détecte — et elle a raison.
revoke all on public.avoirs from public, anon, authenticated;
grant select on public.avoirs to authenticated;

-- ---------------------------------------------------------------- fonction
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
  v_auth uuid := auth.uid();
  v_client uuid;
  v_role text;
  v_email text;
  v_vente record;
  v_article record;
  v_deja numeric;
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
  v_ids uuid[] := '{}';
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;

  -- ---- appelant : tenant + rôle ----
  select u.client_id, u.role::text, u.email into v_client, v_role, v_email
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Role non autorise a enregistrer un avoir.';
  end if;

  -- ---- validations d'entrée ----
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

  -- ---- vente : périmètre et cohérence ----
  select v.id, v.client_id, v.site_id, v.lignes into v_vente
    from public.ventes v
   where v.id = p_vente_id;
  if v_vente.id is null then
    raise exception 'Vente introuvable.';
  end if;
  if v_vente.client_id <> v_client then
    raise exception 'Vente hors perimetre.';
  end if;

  -- L'article de l'avoir est celui de la première ligne de la vente : un avoir
  -- porte sur un produit, pas sur un ticket entier. Les tickets multi-produits
  -- sont traités par autant d'avoirs que de produits rendus.
  select (l->>'articleId')::uuid into v_lot_id from jsonb_array_elements(v_vente.lignes) l limit 1;
  if v_lot_id is null then
    raise exception 'Vente sans ligne : avoir impossible.';
  end if;

  select a.id, a.client_id, a.nom into v_article
    from public.articles a where a.id = v_lot_id;
  if v_article.client_id is null or v_article.client_id <> v_client then
    raise exception 'Article de la vente hors perimetre.';
  end if;
  v_lot_id := null;

  -- Quantité totale vendue de cet article sur ce ticket.
  declare
    v_vendu numeric := 0;
  begin
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
  end;

  -- ---- devenir de la marchandise ----
  if p_mode = 'remise_en_stock' then
    -- Lot d'origine : celui de la vente, s'il existe encore et appartient au
    -- tenant. On ne remet pas en stock un lot d'un autre site.
    -- Attention à la structure : `lignes[].lots[]` porte {lotId, numero, qty},
    -- ce n'est PAS un champ de la ligne (bug évité ici, verrouillé par test).
    select (lot->>'lotId')::uuid into v_lot_id
      from jsonb_array_elements(v_vente.lignes) l,
           lateral jsonb_array_elements(coalesce(l->'lots', '[]'::jsonb)) lot
     where (l->>'articleId')::uuid = v_article.id
     limit 1;
    if v_lot_id is not null then
      perform 1 from public.lots l
       where l.id = v_lot_id and l.client_id = v_client and l.site_id = v_vente.site_id;
      if not found then
        v_lot_id := null;
      end if;
    end if;

    if v_lot_id is not null then
      update public.lots l
         set qte_rest = l.qte_rest + v_qte
       where l.id = v_lot_id;
    else
      -- Lot de retour dédié : traçable, isolé de la production du jour.
      v_numero := 'RET-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' ||
                  substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
      insert into public.lots (client_id, article_id, site_id, numero, qte_init, qte_rest, pu, date_reception, ref)
      values (v_client, v_article.id, v_vente.site_id, v_numero, v_qte, v_qte, 0, current_date, 'Retour client')
      returning id into v_lot_id;
      v_lot_cree := true;
    end if;

    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, v_lot_id, v_vente.site_id, 'avoir_remise', v_qte, 0,
            p_vente_id::text, 'Retour client : ' || v_motif);
  else
    -- Destruction : sortie de stock à hauteur du retour, pour que la perte
    -- reste mesurable. Aucun lot n'est recréé.
    insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
    values (v_client, v_article.id, null, v_vente.site_id, 'avoir_destruction', -v_qte, 0,
            p_vente_id::text, 'Destruction : ' || v_motif);
  end if;

  -- ---- montants ----
  -- Prix unitaire et TVA issus de la ligne de vente d'origine, pas des prix
  -- du jour : un avoir rembourse ce qui a ete encaisse, pas ce que coute
  -- aujourd'hui le meme produit.
  select coalesce((l->>'pu')::numeric, 0), coalesce((l->>'tva')::numeric, 0)
    into v_pu, v_tva
    from jsonb_array_elements(v_vente.lignes) l
   where (l->>'articleId')::uuid = v_article.id
   limit 1;
  v_pu := coalesce(v_pu, 0);
  v_tva := coalesce(v_tva, 0);
  v_ht := round(v_qte * v_pu, 2);
  v_ttc := round(v_ht * (1 + v_tva / 100), 2);

  -- ---- enregistrement de l'avoir ----
  v_numero := 'AV-' || to_char(current_timestamp, 'YYMMDDHH24MISS') || '-' ||
              substr(md5(v_auth::text || clock_timestamp()::text), 1, 6);
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
    'lot_id', v_lot_id,
    'lot_retour_cree', v_lot_cree
  );
end;
$fn$;

revoke all on function public.enregistrer_avoir(uuid, text, text, numeric) from public, anon;
grant execute on function public.enregistrer_avoir(uuid, text, text, numeric) to authenticated, service_role;

-- ---------------------------------------------------------------- audit
-- La table `avoirs` entre dans la liste auditée par la migration 40, avec les
-- mêmes garanties (identité issue de la session, ligne immuable).
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_avoirs on public.avoirs;
    create trigger audit_avoirs
      after insert or update or delete on public.avoirs
      for each row execute function public.patisgest_audit_ligne();
  end if;
end
$audit$;

-- ---------------------------------------------------------------- version
insert into public.app_schema_version (id, version) values (1, 41)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);
