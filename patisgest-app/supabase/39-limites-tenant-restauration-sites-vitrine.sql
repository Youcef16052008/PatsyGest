-- =====================================================================
-- 39 — garde-fous tenant pour la vue vitrine, les sites, l'offre et la restauration.
--
-- Additive only. Ne change aucune migration déjà appliquée. Cette migration
-- doit d'abord passer dans les fixtures PGlite et Supabase CLI jetables; elle
-- n'autorise pas son application automatique à un projet réel.
-- =====================================================================
begin;

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

commit;
