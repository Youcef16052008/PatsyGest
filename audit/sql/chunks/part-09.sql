begin
  if tg_op = 'UPDATE' then
    raise exception 'Journal d''audit immuable : la ligne % ne peut pas être modifiée.', old.id
      using errcode = 'insufficient_privilege';
  end if;
  -- DELETE : refusé dans tous les cas sur une ligne de moins de 10 ans (RI-06).
  -- Au-delà, seul un rôle de confiance (service_role / propriétaire) peut agir ;
  -- les rôles applicatifs n'ont de toute façon pas le privilège DELETE.
  select exists (
    select 1 from public.journal_audit j
     where j.id = old.id and j.cree_le > now() - interval '10 years'
  ) into v_recent;
  if v_recent then
    raise exception 'Journal d''audit immuable : purge interdite avant 10 ans (RI-06), ligne %.', old.id
      using errcode = 'insufficient_privilege';
  end if;
  return old;
end
$$;

drop trigger if exists journal_audit_immuable on public.journal_audit;
create trigger journal_audit_immuable
  before update or delete on public.journal_audit
  for each row execute function public.patisgest_journal_audit_immuable();

-- Une fonction de déclencheur n'a aucune raison d'être appelable en RPC.
-- Sans ces révocations, `anon` peut l'invoquer via PostgREST (test droits-execution).
revoke all on function public.patisgest_journal_audit_immuable() from public, anon, authenticated;

-- ---------- RLS ----------
alter table public.journal_audit enable row level security;

revoke all on public.journal_audit from public, anon, authenticated;
-- Insertion réservée aux déclencheurs (SECURITY DEFINER). Aucun droit
-- d'écriture directe : sinon l'acteur pourrait fabriquer un faux événement.
-- Lecture : le propriétaire de son tenant, plus la service_role d'exploitation.
grant select on public.journal_audit to authenticated;

drop policy if exists journal_audit_lecture_proprietaire on public.journal_audit;
create policy journal_audit_lecture_proprietaire on public.journal_audit
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

-- ---------- Écriture par déclencheur ----------
-- Une seule fonction d'enregistrement, appelée par les déclencheurs cibles.
-- Elle impose l'identité depuis la session et ignore toute valeur fournie.
create or replace function public.patisgest_journaliser(
  p_client_id uuid,
  p_action text,
  p_table text,
  p_ligne_id uuid default null,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := 'inconnu';
  v_uid   uuid := auth.uid();
begin
  if p_client_id is null then
    return; -- rien à rattacher (contexte de service) : on n'écrit pas de ligne orpheline
  end if;
  if v_uid is not null then
    select u.email into v_email from public.utilisateurs u where u.auth_user_id = v_uid limit 1;
  end if;
  insert into public.journal_audit (client_id, acteur_id, acteur_email, action, table_cible, ligne_id, details)
  values (p_client_id, v_uid, coalesce(v_email, 'inconnu'), p_action, p_table, p_ligne_id, coalesce(p_details, '{}'::jsonb));
exception
  when others then
    -- Invariant produit « alerte, jamais blocage » (RG-01.1) : une panne du
    -- journal ne doit pas annuler une vente. On journalise l'échec dans les
    -- journaux PostgreSQL pour qu'il soit visible à l'exploitation.
    raise warning 'journal_audit : écriture impossible pour %.% (action %) : %',
      p_table, coalesce(p_ligne_id::text, '-'), p_action, sqlerrm;
end
$$;

revoke all on function public.patisgest_journaliser(uuid, text, text, uuid, jsonb) from public, anon, authenticated;

-- ---------- Déclencheurs métier ----------
-- NF-10 nomme explicitement ventes, stocks, clôtures et connexions.

create or replace function public.patisgest_audit_ligne()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ligne record;
  v_client uuid;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_op = 'DELETE' then
    v_ligne := old;
  else
    v_ligne := new;
  end if;
  -- `client_id` est présent sur toutes les tables auditées (RI-01).
  execute format('select ($1).client_id') into v_client using v_ligne;
  -- On ne conserve pas les montants ni les coûts dans `details` : le journal
  -- ne doit pas devenir une seconde base de données financière lisible.
  if tg_op = 'INSERT' then
    v_details := jsonb_build_object('operation', 'INSERT');
  elsif tg_op = 'UPDATE' then
    v_details := jsonb_build_object('operation', 'UPDATE');
  else
    v_details := jsonb_build_object('operation', 'DELETE');
  end if;
  perform public.patisgest_journaliser(
    v_client,
    lower(tg_table_name) || '.' || lower(tg_op),
    tg_table_name,
    v_ligne.id,
    v_details
  );
  return coalesce(new, old);
end
$$;

-- Idem pour la fonction de déclencheur métier : elle ne doit pas être exposée
-- comme RPC. `postgres` conserve EXECUTE, donc les déclencheurs fonctionnent.
revoke all on function public.patisgest_audit_ligne() from public, anon, authenticated;

do $declencheurs$
declare
  v_table text;
begin
  foreach v_table in array array['ventes', 'mouvements', 'clotures', 'ordres_fabrication', 'articles', 'lots'] loop
    if to_regclass('public.' || v_table) is null then
      continue; -- tableau absent sur une base partielle : ne pas bloquer la migration
    end if;
    execute format('drop trigger if exists audit_%1$s on public.%1$I;', v_table);
    execute format(
      'create trigger audit_%1$s after insert or update or delete on public.%1$I
         for each row execute function public.patisgest_audit_ligne();',
      v_table
    );
  end loop;
end
$declencheurs$;

-- Connexions / changements de rôle : la table utilisateurs porte l'arrivée d'un
-- compte et les changements de rôle (c'est là qu'un droit est accordé). Les
-- vraies connexions Auth vivent chez Supabase ; on trace ce qui est auditable
-- depuis le schéma public, et on ne prétend pas faire plus.
drop trigger if exists audit_utilisateurs on public.utilisateurs;
create trigger audit_utilisateurs
  after insert or update of role on public.utilisateurs
  for each row execute function public.patisgest_audit_ligne();

-- ---------- Version de schéma ----------
insert into public.app_schema_version (id, version)
values (1, 40)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ------------------------------------------------ vérification (lecture seule)
--   select tgname, c.relname from pg_trigger t join pg_class c on c.oid = t.tgrelid
--    where not t.tgisinternal and t.tgname like 'audit_%' order by 2;
--   select count(*) from public.journal_audit;           -- doit croître après une vente
--   update public.journal_audit set action = 'x';        -- doit échouer (immuable)

-- ===== 41-avoirs-retours.sql =====
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

-- ===== 42-donnees-personnelles.sql =====
-- Migration 42 — Loi 18-07 : export et anonymisation des données personnelles.
--
-- Les mentions légales du produit promettent « un export et une suppression sur
-- demande sont possibles ». Rien ne permettait de tenir cette promesse : c'était
-- une phrase, pas une fonctionnalité. La loi 18-07 impose pourtant :
--   * le droit d'accès (savoir ce qui est détenu sur une personne) ;
--   * le droit d'opposition / d'effacement.
--
-- Décision structurante : **on anonymise, on ne supprime pas.**
--
-- Une vente est une écriture comptable conservée 10 ans (code de commerce,
-- RI-06). La détruire au motif d'une demande individuelle créerait une faute
-- comptable. La loi 18-07 ne demande d'ailleurs pas la destruction des
-- écritures : elle demande qu'on ne puisse plus identifier la personne. On
-- remplace donc les données identifiantes par une référence d'anonymisation,
-- et les montants, dates et liens restent intacts pour la comptabilité et la
-- traçabilité produit (rappel de lot).
--
-- Ce qui n'est jamais touché :
--   * `journal_audit` — le réécrire reviendrait à effacer l'historique d'accès
--     aux données qu'on prétend protéger ;
--   * les montants, dates, lots, quantités — non identifiants.

-- ------------------------------------------------------------ journal des demandes
-- Toute demande doit être traçable : qui a demandé quoi, quand, et pourquoi.
-- Sans ce registre, l'entreprise ne peut pas répondre à un contrôle.
create table if not exists public.demandes_donnees (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  reference text not null,
  type text not null check (type in ('export', 'anonymisation')),
  motif text not null check (length(btrim(motif)) between 3 and 500),
  -- Portée : une commande précise ou l'ensemble des données d'une personne.
  cible text,
  lignes_affectees integer not null default 0,
  acteur_id uuid,
  cree_le timestamptz not null default now(),
  unique (client_id, reference)
);

alter table public.demandes_donnees enable row level security;

drop policy if exists demandes_donnees_lecture on public.demandes_donnees;
create policy demandes_donnees_lecture on public.demandes_donnees
  for select using (client_id = public.patisgest_mon_client()
                    and public.patisgest_mon_role() = 'proprietaire');

revoke all on public.demandes_donnees from public, anon, authenticated;
grant select on public.demandes_donnees to authenticated;

-- ------------------------------------------------------------ export (droit d'accès)
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
  -- Export complet de l'établissement : réservé au propriétaire. Un vendeur
  -- n'a pas à extraire la base clients pour l'emporter ailleurs.
  if v_role <> 'proprietaire' then
    raise exception 'Export reserve au proprietaire.';
  end if;

  -- Ne sortent que les champs identifiants. Les montants, statuts et dates
  -- restent dans l'export : sans eux, la personne ne peut pas vérifier que le
  -- document est bien le sien.
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
    'comptes_utilisateurs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'email', u.email,
        'role', u.role,
        'cree_le', u.created_at
      ) order by u.created_at)
        from public.utilisateurs u where u.client_id = v_client
    ), '[]'::jsonb)
  ) into v_out;

  -- La référence doit être unique par tenant. `now()` est figé pour toute la
  -- transaction : deux exports dans la même transaction (ou la même seconde)
  -- produisaient la même référence et le second échouait sur la contrainte
  -- unique — un export refusé pour une raison qui n'a rien à voir avec le droit
  -- d'accès demandé. On ajoute un suffixe tiré au hasard, et un `on conflict`
  -- en filet de sécurité : perdre une ligne de registre n'est pas grave,
  -- refuser un export à une personne qui exerce son droit l'est.
  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client,
          'EXP-' || to_char(now(), 'YYMMDDHH24MISS') || '-' || substr(md5(gen_random_uuid()::text), 1, 6),
          'export',
          'Export des donnees personnelles de l etablissement', 'etablissement',
          jsonb_array_length(coalesce(v_out->'commandes', '[]'::jsonb)), v_auth)
  on conflict (client_id, reference) do nothing;

  return v_out;
end;
$fn$;

revoke all on function public.exporter_donnees_personnelles() from public, anon;
grant execute on function public.exporter_donnees_personnelles() to authenticated;

-- ------------------------------------------------------------ anonymisation
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
  v_touche integer := 0;
  v_n integer := 0;
  v_demande uuid;
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
    raise exception 'Anonymisation reservee au proprietaire.';
  end if;
  if length(v_motif) < 3 then
    raise exception 'Motif obligatoire.';
  end if;
  if length(v_ref) < 3 then
    raise exception 'Reference de la demande obligatoire.';
  end if;
  if v_numero = '' then
    raise exception 'Commande a anonymiser obligatoire.';
  end if;

  -- Le remplacement garde une trace lisible : on doit pouvoir constater
  -- l'anonymisation sans pouvoir remonter à la personne.
  update public.cakes c
     set client_nom = 'Client anonymise (' || v_ref || ')',
         telephone = null
   where c.client_id = v_client and c.numero = v_numero;
  get diagnostics v_n = row_count;
  v_touche := v_touche + v_n;
  if v_n = 0 then
    raise exception 'Commande introuvable.';
  end if;

  -- Les tickets de vente ne portent pas de nom client : le ticket est anonyme
  -- par construction (`ventes.lignes` ne contient que des articles). Il n'y a
  -- donc qu'une seule table à nettoyer pour une commande — `cakes`, qui sert
  -- à la fois le comptoir et les commandes venues de la vitrine (migration 27).

  insert into public.demandes_donnees (client_id, reference, type, motif, cible, lignes_affectees, acteur_id)
  values (v_client, v_ref, 'anonymisation', v_motif, v_numero, v_touche, v_auth)
  on conflict (client_id, reference) do update set lignes_affectees = excluded.lignes_affectees
  returning id into v_demande;

  -- Trace explicite. Les déclencheurs de la migration 40 journalisent les
  -- écritures ligne à ligne, mais pas l'INTENTION : « qui a demandé
  -- l'effacement, pour quel motif, sous quelle référence ». Une anonymisation
  -- sans cette trace est indistinguable, en audit, d'une perte de données.
  --
  -- Le bloc `execute` est utilisé volontairement : si la migration 40 n'est pas
  -- appliquée, `patisgest_journaliser` n'existe pas et un appel direct ferait
  -- échouer la COMPILATION de cette fonction, pas seulement l'exécution. Un
  -- `execute` diffère la résolution et laisse l'anonymisation fonctionner.
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_journaliser') then
    execute $trace$
      select public.patisgest_journaliser($1, $2, $3, $4, $5)
    $trace$ using v_client, 'donnees_personnelles.anonymisation', 'demandes_donnees',
                 v_demande, jsonb_build_object('operation', 'ANONYMIZATION');
  end if;

  return jsonb_build_object(
    'demande_id', v_demande,
    'reference', v_ref,
    'lignes_affectees', v_touche,
    'commandes_conservees', (select count(*) from public.cakes where client_id = v_client),
    'ventes_conservees', (select count(*) from public.ventes where client_id = v_client)
  );
end;
$fn$;

revoke all on function public.anonymiser_client(text, text, text) from public, anon;
grant execute on function public.anonymiser_client(text, text, text) to authenticated;

-- ------------------------------------------------------------ audit
do $audit$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'patisgest_audit_ligne') then
    drop trigger if exists audit_demandes_donnees on public.demandes_donnees;
    create trigger audit_demandes_donnees
      after insert or update or delete on public.demandes_donnees
      for each row execute function public.patisgest_audit_ligne();
  end if;
end
$audit$;

insert into public.app_schema_version (id, version) values (1, 42)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 43-unicite-lot.sql =====
-- Migration 43 — RI-04 : identité du lot, et non « unicité du numéro ».
--
-- La question ouverte était : faut-il `unique (client_id, numero)` sur `lots` ?
--
-- Réponse : non, et cette contrainte casserait une fonctionnalité livrée.
-- `transferer_article` (migration 08) crée volontairement un lot miroir sur le
-- site d'arrivée avec le MÊME numéro : un transfert déplace le lot, il n'en
-- crée pas un nouveau. Appliquer `(client_id, numero)` ferait échouer tout
-- transfert. C'est l'exigence MOD-11 (traçabilité amont, rappel produit) qui
-- impose de conserver le numéro d'origine.
--
-- L'identité réelle d'un lot est :
--     (client_id, article_id, site_id, numero)
--
--   * client_id  : étanchéité entre établissements (RI-01) ;
--   * article_id : deux fournisseurs peuvent facturer le même numéro ;
--   * site_id    : c'est ce qui distingue le lot d'origine de son miroir ;
--   * numero     : numéro fournisseur, conservé tel quel.
--
-- Ce que la contrainte interdit vraiment — et c'est son but : réceptionner
-- DEUX FOIS le même lot au même endroit, l'erreur qui double le stock en
-- silence quand deux personnes saisissent le même bon de livraison.
--
-- Pourquoi une clé PARTIELLE et pas une contrainte pleine : un miroir de
-- transfert peut être re-transféré puis revenir. Deux lignes du même numéro
-- sur le même site avec des quantités différentes sont alors légitimes.
-- Les réceptions directes écrivent `ref` = numéro de bon (ou null) ;
-- `transferer_article` écrit `ref` = 'TR-XXXXXXXX'. Le schéma distingue donc
-- déjà les deux cas sans colonne supplémentaire.
--
-- Additive only. Ne modifie aucune ligne (vérifié : aucun doublon existant).

-- ---------------------------------------------------------------- garde
do $garde$
declare
  v_doublon bigint;
begin
  if to_regclass('public.lots') is null then
    raise exception 'Migration 43 : table lots absente (migration 03 requise).'
      using errcode = 'P0001';
  end if;

  -- On refuse de poser une contrainte sur une base déjà incohérente : mieux
  -- vaut s'arrêter avec un message lisible que d'échouer sur un 23505 obscur
  -- en pleine migration.
  select count(*) into v_doublon from (
    select 1
      from public.lots
     where ref is null or ref not like 'TR-%'
     group by client_id, article_id, site_id, numero
    having count(*) > 1
  ) d;
  if v_doublon > 0 then
    raise exception 'Migration 43 refusee : % doublon(s) de lot deja presents. Corriger les donnees avant de contraindre.', v_doublon
      using errcode = 'P0001';
  end if;
end
$garde$;

-- ---------------------------------------------------------------- contrainte
-- Index unique PARTIEL : ne couvre que les réceptions directes.
create unique index if not exists lots_reception_unique
  on public.lots (client_id, article_id, site_id, numero)
  where ref is null or ref not like 'TR-%';

comment on index public.lots_reception_unique is
  'RI-04 : un lot reçu directement est unique par (client, article, site, numéro). Les miroirs de transfert (ref TR-*) en sont exemptés, sinon un aller-retour de marchandise serait refusé.';

-- Index de service : retrouver un lot par son numéro est l'opération la plus
-- fréquente d'un rappel produit (MOD-11). Sans lui, un rappel scanne la table.
create index if not exists lots_numero_idx
  on public.lots (client_id, numero);

-- ---------------------------------------------------------------- version
insert into public.app_schema_version (id, version) values (1, 43)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

-- ===== 44-retrait-mode-carte.sql =====
-- =====================================================================
-- 44 — Retrait du mode de règlement « carte » (CIB / Edahabia).
--
-- Décision produit : la caisse ne propose plus que espèces et chèque/virement.
-- Effets :
--   1. Les ventes enregistrées avec mode « carte » passent à NULL
--      (mode non précisé) : aucune vente n'est supprimée ni recalculée.
--   2. La contrainte ventes_mode_paiement_valid n'accepte plus « carte ».
--   3. vendre_panier refuse « carte ». Son corps installé (21 + 32) est
--      patché avec des gardes strictes : si le corps diffère, la migration
--      s'arrête au lieu de deviner.
-- Compatible : l'application n'envoie plus « carte » ; les anciens clients
-- qui en enverraient recevraient « Mode de reglement invalide. ».
-- Non appliquée au pilote : exige une validation humaine explicite.
-- =====================================================================

update public.ventes
   set mode_paiement = null
 where mode_paiement = 'carte';

alter table public.ventes drop constraint if exists ventes_mode_paiement_valid;
alter table public.ventes
  add constraint ventes_mode_paiement_valid
  check (mode_paiement is null or mode_paiement in ('especes', 'cheque_virement'));

do $migration$
declare
  definition text;
  corrigee text;
  ancien constant text := 'if v_mode not in (''especes'', ''carte'', ''cheque_virement'') then';
  nouveau constant text := 'if v_mode not in (''especes'', ''cheque_virement'') then';
  n integer;
begin
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
  if definition is null then
    raise exception 'RPC vendre_panier absente : appliquer 21 à 32 avant 40.';
  end if;

  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà corrigée
  else
    raise exception 'Corps de vendre_panier inattendu (garde carte introuvable ou ambiguë) : réconciliation manuelle requise.';
  end if;
end
$migration$;

-- ===== 45-recettes-libres.sql =====
-- Migration 44 — Recettes libres (saisie rapide DA multi-appareils)
-- Additive only. Idempotente et isolée par client_id.

create table if not exists public.recettes_libres (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom text not null check (char_length(trim(nom)) between 1 and 160),
  categorie text not null default 'Pâtisserie' check (char_length(categorie) <= 80),
  parts integer not null default 1 check (parts >= 1 and parts <= 10000),
  frais_fixes_da numeric(12,2) not null default 0 check (frais_fixes_da >= 0 and frais_fixes_da <= 100000000),
  prix_vente_da numeric(12,2) null check (prix_vente_da is null or (prix_vente_da >= 0 and prix_vente_da <= 100000000)),
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  statut_prix text not null default 'valide' check (statut_prix in ('valide', 'a_verifier_patron', 'bloque')),
  cree_par uuid null references auth.users(id) on delete set null,
  modifie_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recettes_libres_client_idx
  on public.recettes_libres (client_id, updated_at desc);

alter table public.recettes_libres enable row level security;

revoke all on public.recettes_libres from public, anon;
grant select, insert, update, delete on public.recettes_libres to authenticated, service_role;

drop policy if exists recettes_libres_select on public.recettes_libres;
create policy recettes_libres_select on public.recettes_libres
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

drop policy if exists recettes_libres_insert on public.recettes_libres;
create policy recettes_libres_insert on public.recettes_libres
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists recettes_libres_update on public.recettes_libres;
create policy recettes_libres_update on public.recettes_libres
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists recettes_libres_delete on public.recettes_libres;
create policy recettes_libres_delete on public.recettes_libres
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- ===== 46-credits-clients.sql =====
-- Migration 45 — Carnet de crédits clients, cafés & entreprises
-- Additive only. Idempotente et isolée par client_id.

create table if not exists public.credits_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom_debiteur text not null check (char_length(trim(nom_debiteur)) between 1 and 140),
  telephone text not null default '' check (char_length(telephone) <= 40),
  type_compte text not null default 'particulier' check (type_compte in ('particulier', 'cafe_entreprise')),
  montant_total_da numeric(12,2) not null check (montant_total_da > 0 and montant_total_da <= 100000000),
  montant_regle_da numeric(12,2) not null default 0 check (montant_regle_da >= 0 and montant_regle_da <= 100000000),
  date_echeance date null,
  note text not null default '' check (char_length(note) <= 400),
  vente_id uuid null references public.ventes(id) on delete set null,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'solde', 'annule')),
  reglements jsonb not null default '[]'::jsonb check (jsonb_typeof(reglements) = 'array'),
  cree_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credits_regle_lte_total check (montant_regle_da <= montant_total_da)
);

create index if not exists credits_clients_client_statut_idx
  on public.credits_clients (client_id, statut, created_at desc);

alter table public.credits_clients enable row level security;

revoke all on public.credits_clients from public, anon;
grant select, insert, update, delete on public.credits_clients to authenticated, service_role;

drop policy if exists credits_clients_select on public.credits_clients;
