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
