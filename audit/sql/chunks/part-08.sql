    select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
      into definition;
    if position('select s.id, s.client_id, s.nom' in definition) > 0 then
      n := (length(definition) - length(replace(definition,
             'select s.id, s.client_id, s.nom', ''))) / length('select s.id, s.client_id, s.nom');
      if n <> 1 then
        raise exception 'Sélection vitrine ambiguë : audit manuel requis.';
      end if;
      corrigee := replace(definition,
        'select s.id, s.client_id, s.nom',
        'select s.id, s.client_id, s.subdomain');
      execute corrigee;
    elsif position('select s.id, s.client_id, s.subdomain' in definition) = 0 then
      raise exception 'Définition vitrine inattendue : audit manuel requis.';
    end if;
  end if;
end
$migration$;

-- ===== 33-restauration-sans-perte.sql =====
-- =====================================================================
-- 33 — Restauration sans perte silencieuse (revue F-02, F-05).
--
-- Avant : chaque table était insérée en un seul ordre ; un seul doublon
-- (unique_violation) faisait sauter TOUTE la table, lignes valides comprises,
-- tout en annonçant un succès. Aucun contrôle de version côté SQL.
--
-- Après :
--  - insertion par `on conflict do nothing` : une ligne déjà présente n'annule
--    plus les autres ; le nombre de lignes réellement insérées et ignorées est
--    rapporté table par table (`insere` / `ignore` = nb de lignes, plus table);
--  - les erreurs réelles (clé étrangère, not-null, check) remontent toujours :
--    la transaction échoue en bloc, rien n'est partiellement restauré ;
--  - version de format contrôlée (1), comme validerSauvegarde côté application.
--
-- Architecture (migration 23) : la logique vit dans patisgest_restaurer_sauvegarde_interne ;
-- restaurer_sauvegarde est une enveloppe qui exige les modules actifs puis l'appelle.
-- Cette migration redéfinit SEULEMENT l'interne : l'enveloppe, donc le contrôle des
-- modules, reste intacte.
--
-- Le contrôle inter-établissements des clés étrangères (rapport externe B-002)
-- n'est PAS traité ici : il demande des clés composites, traitées à part.
-- =====================================================================

create or replace function public.patisgest_restaurer_sauvegarde_interne(p_dump jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_auth   uuid := auth.uid();
  v_client uuid;
  v_role   text;
  v_tbl    text;
  v_lignes jsonb;
  v_lu     int;
  v_n      int;
  v_insere jsonb := '{}'::jsonb;
  v_ignore jsonb := '{}'::jsonb;
  -- Liste fermée : v_tbl ne vient jamais de l'entrée utilisateur, donc %I est sûr.
  v_ordre  text[] := array[
    'sites','fournisseurs','articles','conversions','parametres_couts',
    'recette_familles','recette_versions','lots','mouvements','historique_prix',
    'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
    'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
    'non_conformites','taches_planning'
  ];
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role is distinct from 'proprietaire' then
    raise exception 'Role non autorise : restauration reservee au proprietaire.';
  end if;
  if p_dump is null or jsonb_typeof(p_dump) <> 'object' then
    raise exception 'Sauvegarde illisible.';
  end if;
  if p_dump->>'version' is distinct from '1' then
    raise exception 'Version de sauvegarde non prise en charge (attendue : 1).';
  end if;
  if p_dump->>'client_id' is distinct from v_client::text then
    raise exception 'Cette sauvegarde appartient a un autre etablissement.';
  end if;
  if jsonb_typeof(p_dump->'tables') <> 'array' then
    raise exception 'Sauvegarde sans tables.';
  end if;
  if not exists (select 1 from public.clients where id = v_client) then
    raise exception 'Etablissement introuvable : creez la fiche client avant de restaurer.';
  end if;

  foreach v_tbl in array v_ordre loop
    select t->'lignes' into v_lignes
      from jsonb_array_elements(p_dump->'tables') t
     where t->>'table' = v_tbl;
    if v_lignes is null or jsonb_typeof(v_lignes) <> 'array' or jsonb_array_length(v_lignes) = 0 then
      continue;
    end if;

    if exists (
      select 1 from jsonb_array_elements(v_lignes) l
       where l ? 'client_id' and l->>'client_id' is distinct from v_client::text
    ) then
      raise exception 'Ligne etrangere detectee dans la table % : restauration refusee.', v_tbl;
    end if;

    v_lu := jsonb_array_length(v_lignes);
    execute format(
      'insert into public.%I select r.* from jsonb_populate_recordset(null::public.%I, $1) r on conflict do nothing',
      v_tbl, v_tbl
    ) using v_lignes;
    get diagnostics v_n = row_count;

    v_insere := v_insere || jsonb_build_object(v_tbl, v_n);
    if v_lu - v_n > 0 then
      v_ignore := v_ignore || jsonb_build_object(v_tbl, v_lu - v_n);
    end if;
  end loop;

  return jsonb_build_object('insere', v_insere, 'ignore', v_ignore);
end;
$fn$;

-- Droits inchangés : l'interne n'est appelable que par l'enveloppe (définie en 23).
revoke all on function public.patisgest_restaurer_sauvegarde_interne(jsonb) from public, anon, authenticated;

-- ===== 34-cout-of-partiel.sql =====
-- =====================================================================
-- 34 — Coût des OF partiellement produits (revue F-20, rapport externe B-004).
--
-- Bug : terminer_of calcule le coût unitaire avec `v_known / p_qte`, où p_qte
-- est la quantité du lot partiel. Or les consommations (v_known) sont
-- enregistrées UNE fois, au lancement, pour toute la quantité prévue. Chaque
-- lot partiel réimpute donc la totalité : 1 000 DA de matières, lots 50 + 50
-- => 2 000 DA comptés au lieu de 1 000.
--
-- Correction : diviser par la quantité PRÉVUE de l'OF, la même pour tous les lots.
--
-- Portée : seules les NOUVELLES clôtures de lots sont corrigées. Les coûts
-- déjà enregistrés ne sont pas modifiés ; leur revue est une décision séparée.
-- Garde stricte : la migration refuse de s'appliquer si le corps installé n'est
-- pas exactement celui attendu (une seule occurrence de la formule).
-- =====================================================================

do $migration$
declare
  definition text;
  corrigee   text;
  n          integer;
  ancien     constant text := 'v_known / p_qte + v_overhead_unit';
  nouveau    constant text := 'v_known / nullif(v_of.qte_prevue, 0) + v_overhead_unit';
begin
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.terminer_of(uuid,numeric,text,date)');
  if definition is null then
    raise exception 'RPC terminer_of absente : appliquer 07 avant 34.';
  end if;

  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà corrigée : migration rejouable sans effet
  else
    raise exception 'Formule de coût de terminer_of inattendue (occurrences : %) : audit manuel requis.', n;
  end if;
end
$migration$;

-- ===== 35-version-schema-app.sql =====
-- =====================================================================
-- 35 — Version de schéma vérifiée par l'application (revue F-19).
--
-- Problème : l'application lit des vues et des colonnes qui peuvent être
-- absentes d'une base déployée à une autre version. Sans marqueur, l'erreur
-- remonte en « relation does not exist » au milieu d'un écran.
--
-- Correction : une table à une seule ligne donne la version du schéma.
-- L'application la lit au chargement de l'espace et refuse de fonctionner si
-- elle est absente ou inférieure à la version qu'elle attend (src/lib/schema-version.ts).
--
-- Rejouable : création idempotente, la version n'est jamais abaissée.
-- Lecture réservée aux utilisateurs authentifiés ; aucune écriture côté client.
-- =====================================================================

create table if not exists public.app_schema_version (
  id          smallint primary key default 1 check (id = 1),
  version     integer not null check (version > 0),
  applique_le timestamptz not null default now()
);

insert into public.app_schema_version (id, version)
values (1, 35)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

alter table public.app_schema_version enable row level security;

revoke all on public.app_schema_version from public, anon, authenticated;
grant select on public.app_schema_version to authenticated;

-- Création conditionnelle de la politique de lecture (sans DROP : rejouable).
do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'app_schema_version'
       and policyname = 'app_schema_version_lecture'
  ) then
    create policy app_schema_version_lecture on public.app_schema_version
      for select to authenticated using (true);
  end if;
end $$;

-- ===== 36-dates-algiers.sql =====
-- =====================================================================
-- 36 — Dates métier à Oran (revue F-04, partie SQL).
--
-- Problème : `current_date` suit le fuseau de la session, en UTC côté Supabase.
-- Entre 23 h et minuit à Oran (UTC+1), une vente, un mouvement ou une réception
-- reçoivent la date du lendemain… ou de la veille selon l'heure : la journée
-- comptable est décalée.
--
-- Correction : toutes les occurrences `current_date` des fonctions publiques et
-- les valeurs par défaut de colonnes sont remplacées par la date du fuseau
-- Africa/Algiers. Réécriture par la définition installée (pg_get_functiondef),
-- avec gardes : toute forme inattendue fait échouer la migration entière.
--
-- Limite connue : les VUES publiques contenant `current_date` font échouer la
-- migration (non réécrites ici) ; à auditer avant de relancer.
-- Rejouable : sans occurrence restante, la migration ne change rien.
-- =====================================================================

do $migration$
declare
  r        record;
  remplacement constant text := '(now() at time zone ''Africa/Algiers'')::date';
  n_defauts integer := 0;
  n_fonctions integer := 0;
begin
  if exists (
    select 1 from pg_views v
     where v.schemaname = 'public'
       and pg_get_viewdef(format('%I.%I', v.schemaname, v.viewname)::regclass) ~* '\mcurrent_date\M'
  ) then
    raise exception 'Vue publique contenant current_date : audit manuel requis avant 36.';
  end if;

  for r in
    select c.relname, a.attname, pg_get_expr(d.adbin, d.adrelid) as expr
      from pg_attrdef d
      join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
      join pg_class c on c.oid = d.adrelid
      join pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and pg_get_expr(d.adbin, d.adrelid) ~* '\mcurrent_date\M'
  loop
    if lower(trim(r.expr)) <> 'current_date' then
      raise exception 'Défaut inattendu sur %.% : % — audit manuel requis.', r.relname, r.attname, r.expr;
    end if;
    execute format('alter table public.%I alter column %I set default %s', r.relname, r.attname, remplacement);
    n_defauts := n_defauts + 1;
  end loop;

  for r in
    select pg_get_functiondef(p.oid) as def
      from pg_proc p
      join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public'
       and p.prokind in ('f', 'p')  -- pg_get_functiondef refuse les agrégats
       and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  loop
    execute regexp_replace(r.def, '\mcurrent_date\M', remplacement, 'gi');
    n_fonctions := n_fonctions + 1;
  end loop;

  if exists (
    select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prokind in ('f', 'p') and pg_get_functiondef(p.oid) ~* '\mcurrent_date\M'
  ) then
    raise exception 'current_date subsiste dans une fonction publique après 36.';
  end if;

  raise notice '36 : % défaut(s) et % fonction(s) réécrites', n_defauts, n_fonctions;
end
$migration$;

do $version$
begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Table app_schema_version absente : appliquer 35 avant 36.';
  end if;
end
$version$;

insert into public.app_schema_version (id, version)
values (1, 36)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ===== 37-transfert-client-ref.sql =====
-- =====================================================================
-- 37 — Transfert idempotent (revue B-007 : client_ref sur les transferts).
--
-- Problème : un double clic, une resoumission ou un rejeu hors ligne
-- relancent transferer_article et déplacent deux fois le même stock.
-- Les ordres de fabrication sont déjà protégés (migration 16, client_ref).
--
-- Correction (sans modifier transferer_article, déjà appliquée) :
--   * transferts.client_ref, unique par client quand il est renseigné ;
--   * transferer_article_ref : même référence = rejeu, renvoie le transfert
--     existant sans rien déplacer ; même référence pour une autre demande =
--     refus explicite ; verrou consultatif pour que deux appels simultanés
--     ne déplacent pas deux fois. Tout se fait dans une seule transaction.
--
-- L'application ne l'appelle pas encore : elle reste sur transferer_article
-- tant que cette migration n'est pas appliquée au pilote. La version de schéma
-- est enregistrée à 37 (jamais abaissée) ; la requise côté app passera à 37
-- lorsque l'appel sera branché.
--
-- Rejouable. Gardes strictes : échoue si les prérequis sont absents.
-- =====================================================================

do $$
begin
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'transferts') then
    raise exception 'Migration 37 : table transferts absente (migration 08 requise).';
  end if;
  if not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = 'transferer_article') then
    raise exception 'Migration 37 : transferer_article absente (migrations 08 et 21 requises).';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_schema_version') then
    raise exception 'Migration 37 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

alter table public.transferts add column if not exists client_ref text;

alter table public.transferts drop constraint if exists transferts_client_ref_longueur;
alter table public.transferts add constraint transferts_client_ref_longueur
  check (client_ref is null or length(client_ref) between 1 and 64);

create unique index if not exists transferts_client_ref_uniq
  on public.transferts (client_id, client_ref) where client_ref is not null;

create or replace function public.transferer_article_ref(
  p_article_id uuid,
  p_from_site_id uuid,
  p_to_site_id uuid,
  p_qte numeric,
  p_motif text,
  p_responsable text default null,
  p_client_ref text default null
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
  v_cle text := nullif(trim(coalesce(p_client_ref, '')), '');
  v_existant record;
  v_qte_existante numeric;
  v_article_present boolean;
  v_resultat jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  if v_cle is not null and length(v_cle) > 64 then
    raise exception 'Référence de transfert trop longue (64 caractères maximum).';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Role non autorise a transférer.';
  end if;

  if v_cle is not null then
    -- Sérialise les appels de même référence : le second attend la fin du premier
    -- puis voit son transfert et le rejoue au lieu de déplacer le stock à nouveau.
    perform pg_advisory_xact_lock(hashtextextended(v_client::text || ':' || v_cle, 0));

    select t.id, t.ref, t.responsable, t.from_site_id, t.to_site_id, t.lignes
      into v_existant
      from public.transferts t
     where t.client_id = v_client and t.client_ref = v_cle;

    if found then
      select coalesce(sum((l->>'qty')::numeric), 0),
             coalesce(bool_or(l->>'articleId' = p_article_id::text), false)
        into v_qte_existante, v_article_present
        from jsonb_array_elements(v_existant.lignes) l;

      if v_existant.from_site_id is distinct from p_from_site_id
         or v_existant.to_site_id is distinct from p_to_site_id
         or not v_article_present
         or v_qte_existante is distinct from round(p_qte, 4) then
        raise exception 'Référence de transfert déjà utilisée pour un autre transfert.';
      end if;

      return jsonb_build_object(
        'transfert_id', v_existant.id,
        'ref', v_existant.ref,
        'responsable', v_existant.responsable,
        'lots', jsonb_array_length(v_existant.lignes),
        'qte', p_qte,
        'rejoue', true
      );
    end if;
  end if;

  -- Délègue au mouvement existant : même transaction, mêmes contrôles de stock et de DLC.
  v_resultat := public.transferer_article(
    p_article_id, p_from_site_id, p_to_site_id, p_qte, p_motif, p_responsable
  );

  if v_cle is not null then
    update public.transferts t set client_ref = v_cle
     where t.id = (v_resultat->>'transfert_id')::uuid;
  end if;

  return v_resultat || jsonb_build_object('rejoue', false);
end;
$$;

revoke all on function public.transferer_article_ref(uuid, uuid, uuid, numeric, text, text, text)
  from public, anon, authenticated;
grant execute on function public.transferer_article_ref(uuid, uuid, uuid, numeric, text, text, text)
  to authenticated, service_role;

-- Version de schéma : enregistrée à 37, jamais abaissée (même mécanisme que la 35).
insert into public.app_schema_version (id, version)
values (1, 37)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ===== 38-anti-abus-vitrine-source.sql =====
-- =====================================================================
-- 38 — Anti-abus vitrine par source (revue B-008).
--
-- Problème : 27 limite à 30 demandes par heure pour TOUT l'établissement.
-- Un seul robot bloque donc toutes les demandes légitimes.
--
-- Correction :
--   1. patisgest_verifier_source_vitrine(sous_domaine, source) : appelée par le
--      serveur avant la demande. `source` est un HMAC de l'IP calculé côté
--      serveur avec un secret ; la base ne voit jamais l'IP. Plafond : 10
--      demandes par heure et par source et par établissement. Les lignes sont
--      purgées au bout de 2 heures.
--   2. Le plafond global de 27 passe de 30 à 300 par heure : il ne sert plus
--      qu'à borner un afflux massif. Garde stricte : échec si le corps installé
--      diffère de celui attendu.
--
-- Limite connue : le plafond par source ne protège pas contre un botnet qui
-- change d'adresse. Cela relève de la limitation au bord (hébergeur), hors base.
--
-- Rejouable. Prérequis : 27 et 32 (patisgest_demander_commande installée).
-- =====================================================================

do $$
begin
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is null then
    raise exception 'Migration 38 : patisgest_demander_commande absente (migrations 27 et 32 requises).';
  end if;
  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'app_schema_version') then
    raise exception 'Migration 38 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

create table if not exists public.vitrine_sources_recentes (
  client_id    uuid        not null references public.clients(id) on delete cascade,
  source_hash  text        not null check (source_hash ~ '^[0-9a-f]{32,128}$'),
  created_at   timestamptz not null default now()
);
create index if not exists vitrine_sources_recentes_idx
  on public.vitrine_sources_recentes (client_id, source_hash, created_at);

-- Données de contrôle : aucun accès direct, seulement via la fonction ci-dessous.
alter table public.vitrine_sources_recentes enable row level security;
revoke all on public.vitrine_sources_recentes from public, anon, authenticated;

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

  delete from public.vitrine_sources_recentes r
   where r.client_id = v_client and r.created_at < now() - interval '2 hours';

  insert into public.vitrine_sources_recentes (client_id, source_hash) values (v_client, p_source);

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
grant execute on function public.patisgest_verifier_source_vitrine(text, text) to anon, authenticated, service_role;

-- Plafond global : 30 -> 300 (garde stricte, une seule occurrence attendue).
do $migration$
declare
  definition text;
  corrigee text;
  n integer;
  ancien constant text := 'if v_flux >= 30 then';
  nouveau constant text := 'if v_flux >= 300 then';
begin
  select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
    into definition;
  n := (length(definition) - length(replace(definition, ancien, ''))) / length(ancien);
  if n = 1 then
    corrigee := replace(definition, ancien, nouveau);
    execute corrigee;
  elsif n = 0 and position(nouveau in definition) > 0 then
    null; -- déjà relevé : rejouable sans effet
  else
    raise exception 'Plafond global de patisgest_demander_commande inattendu (occurrences : %) : audit manuel requis.', n;
  end if;
end
$migration$;

insert into public.app_schema_version (id, version)
values (1, 38)
on conflict (id) do update
  set version = excluded.version,
      applique_le = now()
  where public.app_schema_version.version < excluded.version;

-- ===== 39-limites-tenant-restauration-sites-vitrine.sql =====
-- =====================================================================
-- 39 — garde-fous tenant pour la vue vitrine, les sites, l'offre et la restauration.
--
-- Additive only. Ne change aucune migration déjà appliquée. Cette migration
-- doit d'abord passer dans les fixtures PGlite et Supabase CLI jetables; elle
-- n'autorise pas son application automatique à un projet réel.
-- =====================================================================

-- D2: enlever la clé interne client_id de la projection anon. La routine de
-- commande retrouve désormais la famille par sous-domaine et clé publique.
do $migration$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := 'where v.client_id = v_client';
  v_count integer;
begin
  if to_regclass('public.vitrine_catalogue') is null then
    raise exception 'Vue vitrine_catalogue absente : appliquer la série vitrine avant 39.';
  end if;

  -- La fonction publique doit déjà être réparée par la migration 32, mais le
  -- test de présence refuse explicitement toute autre variante.
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is null then
    raise exception 'RPC de commande vitrine absente : appliquer la migration 27 avant 39.';
  end if;
  select pg_get_functiondef('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)'::regprocedure)
    into v_definition;
  if position('select s.id, s.client_id, s.subdomain' in v_definition) = 0 then
    raise exception 'RPC vitrine inattendue : appliquer/réconcilier la migration 32 avant 39.';
  end if;
  v_count := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
  if v_count = 1 then
    v_corrected := replace(v_definition, v_anchor, 'where v.subdomain = v_site.subdomain');
    execute v_corrected;
  elsif v_count = 0 and position('where v.subdomain = v_site.subdomain' in v_definition) > 0 then
    null; -- déjà corrigée
  else
    raise exception 'Filtre catalogue de la RPC vitrine inattendu/ambigu : réconciliation manuelle.';
  end if;

  -- DROP sans CASCADE : un dépendant inattendu fait échouer la migration au
  -- lieu de le supprimer silencieusement. L'ACL est restaurée explicitement.
  drop view public.vitrine_catalogue;
  execute $view$
    create view public.vitrine_catalogue
    with (security_invoker = false)
    as
    with premiere as (
      select distinct on (f.client_id, f.cle_nom)
             f.client_id,
             f.cle_nom,
             coalesce(nullif(trim(f.nom_vitrine), ''), f.nom) as nom,
             f.description_vitrine as description,
             f.photo_vitrine,
             f.ordre_vitrine,
             f.produit_id
        from public.recette_familles f
       where f.visible_vitrine
         and f.cle_nom is not null
       order by f.client_id, f.cle_nom, f.ordre_vitrine, f.nom, f.id
    )
    select p.cle_nom,
           p.nom,
           p.description,
           p.photo_vitrine,
           p.ordre_vitrine,
           c.nom as etablissement,
           s.nom as boutique,
           s.subdomain,
           s.custom_domain,
           nullif(a.pv_ht, 0) as prix_ht,
           a.tva,
           a.unite
      from premiere p
      join public.clients c on c.id = p.client_id
      join public.sites s on s.client_id = p.client_id
       and s.publication = 'publiee'
      left join public.articles a on a.id = p.produit_id
  $view$;
  comment on view public.vitrine_catalogue is
    'Catalogue public des vitrines publiées. Aucun coût ni identifiant interne de tenant.';
  revoke all on public.vitrine_catalogue from public, anon, authenticated;
  grant select on public.vitrine_catalogue to anon, authenticated;
end
$migration$;

-- D4: les colonnes sensibles ne sont modifiables qu'au travers des RPC
-- SECURITY DEFINER validées. L'écran d'administration n'écrit que nom/type/adresse.
revoke insert, update on public.sites from public, anon, authenticated;
grant insert (client_id, nom, type, adresse) on public.sites to authenticated;
grant update (nom, type, adresse) on public.sites to authenticated;

-- D9: l'offre est un état de facturation, pas une préférence du tenant.
--
-- Correction du 23/11/2026, après application réelle au pilote : la première
-- version révoquait UPDATE sur TOUTE la table `clients`. C'était trop large —
-- `actions-etablissement.ts` met à jour nom/adresse/téléphone/NIF/NIS/RC depuis
-- l'écran Paramètres, et c'est ce qui alimente les mentions légales des tickets
-- (NF-06). Révoquer en bloc cassait une fonctionnalité vendue pour protéger un
-- champ qui n'y tenait pas.
--
-- On révoque donc la table entière puis on re-accorde, **colonne par colonne**,
-- les seules colonnes que l'écran d'administration écrit réellement. `offre`
-- n'y est pas : c'est un état de facturation, il ne se change pas depuis
-- l'interface. Toute autre colonne future sera, par défaut, non modifiable —
-- le défaut sûr est de refuser, pas d'ouvrir.
revoke update on public.clients from public, anon, authenticated;
grant update (nom, adresse, telephone, nif, nis, rc) on public.clients to authenticated;

-- D7: valider toutes les FK mono-colonne entre tables restaurées qui portent
-- client_id, avant la première insertion. Les références peuvent cibler une
-- ligne déjà présente (même tenant) ou une ligne de ce même dump. Une ID déjà
-- détenue par un autre tenant est rejetée même si le dump contient une ligne
-- conflictuelle de même ID. La liste fermée est la même que celle de la routine
-- de restauration; noms SQL viennent uniquement du catalogue système.
create or replace function public.patisgest_verifier_references_tenant_dump(
  p_dump jsonb,
  p_client uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_fk record;
  v_foreign boolean;
begin
  for v_fk in
    select child.relname as child_table,
           child_col.attname as child_column,
           parent.relname as parent_table
      from pg_catalog.pg_constraint fk
      join pg_catalog.pg_class child on child.oid = fk.conrelid
      join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
      join pg_catalog.pg_class parent on parent.oid = fk.confrelid
      join pg_catalog.pg_namespace parent_ns on parent_ns.oid = parent.relnamespace
      join pg_catalog.pg_attribute child_col
        on child_col.attrelid = child.oid and child_col.attnum = fk.conkey[1]
      join pg_catalog.pg_attribute parent_col
        on parent_col.attrelid = parent.oid and parent_col.attnum = fk.confkey[1]
     where fk.contype = 'f'
       and child_ns.nspname = 'public'
       and parent_ns.nspname = 'public'
       and array_length(fk.conkey, 1) = 1
       and array_length(fk.confkey, 1) = 1
       and parent_col.attname = 'id'
       and child.relname = any (array[
         'sites','fournisseurs','articles','conversions','parametres_couts',
         'recette_familles','recette_versions','lots','mouvements','historique_prix',
         'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
         'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
         'non_conformites','taches_planning'
       ])
       and parent.relname = any (array[
         'sites','fournisseurs','articles','conversions','parametres_couts',
         'recette_familles','recette_versions','lots','mouvements','historique_prix',
         'bons_commande','ordres_fabrication','ventes','z_imports','clotures',
         'transferts','demandes_reassort','cakes','releve_temperatures','nettoyages',
         'non_conformites','taches_planning'
       ])
       and exists (select 1 from pg_catalog.pg_attribute a
                    where a.attrelid = child.oid and a.attname = 'client_id' and not a.attisdropped)
       and exists (select 1 from pg_catalog.pg_attribute a
                    where a.attrelid = parent.oid and a.attname = 'client_id' and not a.attisdropped)
  loop
    execute pg_catalog.format($sql$
      select exists (
        select 1
          from jsonb_array_elements($1->'tables') as t(item)
          cross join lateral jsonb_array_elements(
            case when jsonb_typeof(t.item->'lignes') = 'array'
                 then t.item->'lignes' else '[]'::jsonb end
          ) as child_row(item)
         where t.item->>'table' = %L
           and child_row.item->>%L is not null
           and (
             exists (
               select 1 from public.%I parent_row
                where parent_row.id::text = child_row.item->>%L
                  and parent_row.client_id is distinct from $2
             )
             or (
               not exists (
                 select 1 from public.%I parent_row
                  where parent_row.id::text = child_row.item->>%L
                    and parent_row.client_id = $2
               )
               and not exists (
                 select 1
                   from jsonb_array_elements($1->'tables') as target_table(item)
                   cross join lateral jsonb_array_elements(
                     case when jsonb_typeof(target_table.item->'lignes') = 'array'
                          then target_table.item->'lignes' else '[]'::jsonb end
                   ) as target_row(item)
                  where target_table.item->>'table' = %L
                    and target_row.item->>'id' = child_row.item->>%L
                    and target_row.item->>'client_id' = $2::text
               )
             )
           )
      )
    $sql$, v_fk.child_table, v_fk.child_column, v_fk.parent_table, v_fk.child_column,
          v_fk.parent_table, v_fk.child_column, v_fk.parent_table, v_fk.child_column)
      into v_foreign using p_dump, p_client;
    if v_foreign then
      raise exception 'Référence étrangère inter-tenant détectée dans %.% : restauration refusée.',
        v_fk.child_table, v_fk.child_column;
    end if;
  end loop;
end;
$fn$;
revoke all on function public.patisgest_verifier_references_tenant_dump(jsonb, uuid) from public, anon, authenticated;

-- Brancher le prévol dans la routine interne; marqueur + gardes pour empêcher
-- une double insertion si cette migration est rejouée en fixture.
do $patch$
declare
  v_definition text;
  v_corrected text;
  v_anchor text := '  foreach v_tbl in array v_ordre loop';
  v_count integer;
begin
  select pg_get_functiondef('public.patisgest_restaurer_sauvegarde_interne(jsonb)'::regprocedure)
    into v_definition;
  if v_definition is null then
    raise exception 'Routine interne de restauration absente : appliquer la migration 23 avant 39.';
  end if;
  if position('patisgest_verifier_references_tenant_dump(p_dump, v_client)' in v_definition) > 0 then
    null;
  else
    v_count := (length(v_definition) - length(replace(v_definition, v_anchor, ''))) / length(v_anchor);
    if v_count <> 1 then
      raise exception 'Ancre de restauration inattendue/ambiguë : revue manuelle nécessaire.';
    end if;
    v_corrected := replace(v_definition, v_anchor,
      '  perform public.patisgest_verifier_references_tenant_dump(p_dump, v_client);' || E'\n' || v_anchor);
    execute v_corrected;
  end if;
end
$patch$;

-- ===== 40-journal-audit.sql =====
-- =====================================================================
-- 40 — Journal d'audit « qui, quoi, quand » conservé 10 ans (NF-10, RI-06).
--
-- Problème : le cahier des charges v4.0 exige un journal d'audit sur ventes,
-- stocks, clôtures et connexions, conservé 10 ans (NF-10, §7 Sécurité, RI-06),
-- et la table `journal_audit` est décrite dans l'architecture (§4.1). Aucune
-- migration ne l'avait créée : le produit fonctionnait sans aucune trace
-- exploitable en cas de contrôle, de litige ou de rappel produit.
--
-- Propriétés garanties ici, et pourquoi chacune est nécessaire :
--
--   * IMMUABILITÉ — un journal qu'on peut réécrire ne prouve rien. Les rôles
--     applicatifs n'ont ni UPDATE ni DELETE, et un déclencheur refuse ces
--     opérations même pour le propriétaire de la table (protection contre une
--     erreur de code côté serveur, pas contre un superutilisateur).
--   * AUTORITÉ DE L'IDENTITÉ — acteur_id et client_id sont imposés par
--     `auth.uid()` / `patisgest_mon_client()`, jamais par le client HTTP.
--     Sans cela, n'importe qui pourrait signer une action au nom d'un autre.
--   * CONSERVATION 10 ANS — RI-06 interdit toute purge avant 10 ans ; le
--     déclencheur refuse un DELETE qui toucherait une ligne plus récente que
--     dix ans. (Le propriétaire de la base peut toujours tronquer manuellement :
--     aucune politique SQL ne protège d'un superutilisateur. C'est écrit ici
--     pour que personne ne croie à une garantie qu'on n'a pas donnée.)
--   * ISOLATION — lecture réservée au propriétaire du même client. Le labo et
--     le vendeur n'ont pas à lire l'historique global des actions du tenant.
--
-- Additive only. Ne modifie aucune migration déjà appliquée. Rejouable.
-- =====================================================================

do $garde$
begin
  if to_regclass('public.clients') is null then
    raise exception 'Migration 40 : table clients absente (migration 01 requise).';
  end if;
  if to_regclass('public.utilisateurs') is null then
    raise exception 'Migration 40 : table utilisateurs absente (migration 01 requise).';
  end if;
  if to_regprocedure('public.patisgest_mon_client()') is null then
    raise exception 'Migration 40 : patisgest_mon_client() absente (migration 05 requise).';
  end if;
end
$garde$;

-- ---------- Table ----------
-- `details` reste jsonb volontairement : le journal doit pouvoir enregistrer
-- une forme qui change (prix avant/après, quantités, motif) sans migration.
-- Aucune clé étrangère vers `utilisateurs` : supprimer un compte ne doit jamais
-- effacer l'historique de ses actions (l'email est donc conservé en texte).
create table if not exists public.journal_audit (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.clients (id),
  acteur_id    uuid,
  acteur_email text not null default 'inconnu',
  action       text not null,
  table_cible  text not null,
  ligne_id     uuid,
  details      jsonb not null default '{}'::jsonb,
  cree_le      timestamptz not null default now()
);

comment on table public.journal_audit is
  'Journal d''audit NF-10 : qui, quoi, quand. Immuable, isolation par tenant, conservation 10 ans (RI-06).';
comment on column public.journal_audit.acteur_email is
  'Copie de l''email au moment de l''action : survit à la suppression du compte.';
comment on column public.journal_audit.details is
  'Charge utile libre (avant/après, motif). Ne jamais y stocker de secret ni de coût fournisseur détaillé.';

create index if not exists journal_audit_client_date_idx
  on public.journal_audit (client_id, cree_le desc);
create index if not exists journal_audit_cible_idx
  on public.journal_audit (client_id, table_cible, ligne_id, cree_le desc);
create index if not exists journal_audit_acteur_idx
  on public.journal_audit (client_id, acteur_id, cree_le desc);

-- ---------- Immuabilité ----------
-- Déclencheur plutôt que simple absence de GRANT : un GRANT oublié sur une
-- base restaurée ou recréée doit échouer bruyamment, pas silencieusement.
create or replace function public.patisgest_journal_audit_immuable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recent boolean;
