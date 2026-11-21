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
begin;

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

commit;
