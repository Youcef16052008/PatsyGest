  else
    v_statut := 'annule';
  end if;

  update public.cakes k
     set statut = v_statut,
         statut_note = case
           when p_decision = 'accepter' then 'Demande de vitrine acceptée — à chiffrer.'
           else 'Demande de vitrine refusée.'
         end
   where k.id = p_id;

  return jsonb_build_object('id', p_id, 'statut', v_statut);
end;
$$;

revoke all on function public.patisgest_traiter_demande(uuid, text) from public, anon;
grant execute on function public.patisgest_traiter_demande(uuid, text) to authenticated;

-- ------------------------------------------------ vérification
--   -- anon ne peut exécuter qu'une fonction
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('anon', p.oid, 'execute');   -- 1 ligne

-- ===== 28-fermeture-anon.sql =====
-- =====================================================================
-- Migration 28 — Fermeture des droits `anon` sur les tables internes
--
-- Constat mesuré sur la base pilote (2026-11-19) :
--
--   select grantee, privilege_type
--     from information_schema.role_table_grants
--    where table_schema = 'public' and table_name = 'cakes' and grantee = 'anon';
--   → INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--
-- Autrement dit : `anon` (la clé publique, embarquée dans le navigateur)
-- possédait les droits DML complets sur `cakes`, `articles`, `sites`,
-- `recette_familles`, `recette_versions`… Aujourd'hui rien ne fuit, parce
-- que la RLS est active partout et qu'aucune policy ne vise `anon` ou
-- `public` : mesuré, `anon` lit 0 ligne. Mais c'est une protection par un
-- seul verrou. Une policy ajoutée par distraction (`to public`, `to anon`,
-- ou un oubli de `to authenticated`) ouvrirait immédiatement la table.
--
-- La vitrine est le premier écran qui rend la clé `anon` réellement utile
-- et donc réellement attractive : on ajoute le second verrou AVANT.
--
-- Portée : `anon` perd tout droit sur les tables internes. Il conserve :
--   * `select` sur `public.vitrine_catalogue` (la vue publique, 26) ;
--   * `execute` sur `public.patisgest_demander_commande` (27).
-- `authenticated` et `service_role` ne changent pas.
--
-- Idempotent : rejouable.
-- =====================================================================

-- On boucle sur les tables du schéma public pour ne pas dépendre d'une
-- liste écrite à la main qui se périmerait à la prochaine table créée.
-- Les vues sont incluses séparément : `anon` doit les perdre aussi, sauf
-- `vitrine_catalogue` regrantée explicitement en fin de migration.
do $$
declare
  r record;
begin
  for r in
    select c.relname, c.relkind
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind in ('r', 'p', 'v', 'm')
       and c.relname <> 'vitrine_catalogue'
  loop
    execute format('revoke all on public.%I from anon', r.relname);
  end loop;
end $$;

-- Les séquences aussi (reconstruites par défaut après un `pg_restore`).
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'S'
  loop
    execute format('revoke all on sequence public.%I from anon', r.relname);
  end loop;
end $$;

-- Les fonctions : `anon` ne garde que la RPC de dépôt de commande et les
-- fonctions d'aide non sensibles déjà accordées à `authenticated`.
-- On révoque tout, puis on regrante le strict nécessaire pour que l'état
-- soit identique après n'importe quel `pg_restore`.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig, p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'patisgest_demander_commande'
  loop
    execute format('revoke all on function %s from anon', r.sig);
  end loop;
end $$;

-- La vue publique reste lisible par un visiteur non connecté.
grant select on public.vitrine_catalogue to anon;

-- ------------------------------------------------ vérification
--   -- 0 table interne lisible par anon
--   begin; set local role anon;
--     select count(*) from public.clients;          -- 0
--     select count(*) from public.cakes;            -- 0
--     select count(*) from public.vitrine_catalogue;-- N (dès qu'une vitrine est publiée)
--   rollback;
--
--   -- exactement une fonction exécutable par anon
--   select p.proname
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute');

-- ===== 29-fermeture-public-fonctions.sql =====
-- =====================================================================
-- Migration 29 — Fermeture des fonctions via PUBLIC
--
-- Constat mesuré APRÈS la migration 28 (2026-11-19) :
--
--   select p.proname from pg_proc p …
--    where has_function_privilege('anon', p.oid, 'execute');
--   → patisgest_cle_nom, patisgest_maj_cle_nom,
--     patisgest_mon_client, patisgest_mon_role, patisgest_demander_commande
--
-- La migration 28 révoquait sur `anon`, mais PostgreSQL accorde EXECUTE à
-- **PUBLIC** par défaut sur toute fonction créée, et `anon` hérite de
-- PUBLIC. Révoquer sur `anon` seul ne retire donc rien : il faut révoquer
-- sur PUBLIC. C'est le même piège que celui corrigé en migration 17 pour
-- `rls_auto_enable()`.
--
-- Après cette migration, une seule fonction reste joignable par `anon` :
-- `patisgest_demander_commande`, la RPC publique de la vitrine (migration
-- 27), qui ne prend aucun `client_id` et ne fixe aucun prix.
--
-- Les trois fonctions d'aide doivent rester exécutables par
-- `authenticated` : les policies RLS les appellent (`patisgest_mon_client`,
-- `patisgest_mon_role`) et le trigger `cle_nom` appelle la troisième.
-- Elles ne sont PAS SECURITY DEFINER : les exécuter ne donne aucun accès.
--
-- Idempotent : rejouable.
-- =====================================================================

do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname <> 'patisgest_demander_commande'
  loop
    execute format('revoke all on function %s from public', r.sig);
  end loop;
end $$;

-- Redonner explicitement l'exécution au personnel connecté : les policies
-- et le trigger en dépendent, un `revoke from public` les couperait aussi.
revoke all on function public.patisgest_cle_nom(text) from public, anon;
grant execute on function public.patisgest_cle_nom(text) to authenticated, service_role;

revoke all on function public.patisgest_maj_cle_nom() from public, anon;
grant execute on function public.patisgest_maj_cle_nom() to authenticated, service_role;

revoke all on function public.patisgest_mon_client() from public, anon;
grant execute on function public.patisgest_mon_client() to authenticated, service_role;

revoke all on function public.patisgest_mon_role() from public, anon;
grant execute on function public.patisgest_mon_role() to authenticated, service_role;

-- ------------------------------------------------ vérification
--   -- exactement 1 fonction exécutable par anon
--   select count(*) as nb,
--          coalesce(string_agg(p.proname, ', '), 'aucune') as liste
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('anon', p.oid, 'execute');   -- 1 / patisgest_demander_commande
--
--   -- le personnel connecté garde ses RPC
--   select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and has_function_privilege('authenticated', p.oid, 'execute');  -- 41

-- ===== 30-edition-vitrine-rpc.sql =====
-- =====================================================================
-- Migration 30 — Écriture de la vitrine par RPC (pas par `update` direct)
--
-- Constat mesuré sur la base pilote (2026-11-19) :
--
--   select relname, count(*) from pg_policy … where polcmd in ('w','a','d','*')
--   → recette_familles : 0 policy d'écriture
--   → cakes            : 0 policy d'écriture
--
-- C'est volontaire (tout passe par des RPC SECURITY DEFINER), mais cela a
-- une conséquence : un `supabase.from('recette_familles').update(...)`
-- renvoie **0 ligne sans erreur** — la RLS ne lève pas d'exception, elle
-- filtre. Le code aurait affiché « enregistré » sans rien avoir écrit.
-- Toute l'écriture de la vitrine passe donc par les RPC ci-dessous.
--
-- Idempotent : rejouable.
-- =====================================================================

-- `creer_famille` exige déjà l'unicité du code par établissement côté
-- application ; on la garantit aussi par index. La table pilote n'a
-- aucune contrainte d'unicité sur (client_id, code).
create unique index if not exists recette_familles_client_code_unique
  on public.recette_familles (client_id, code);

-- ---------------------------------------- fiche vitrine (photo, nom, ordre)
create or replace function public.patisgest_enregistrer_fiche_vitrine(
  p_famille_id uuid,
  p_visible boolean,
  p_nom_vitrine text,
  p_description text,
  p_photo text,
  p_ordre integer
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
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;

  -- Fiche et photos : propriétaire et laboratoire. Le vendeur traite les
  -- commandes, il n'écrit pas le catalogue.
  if v_role not in ('proprietaire', 'labo') then
    raise exception 'Rôle non autorisé : la vitrine se modifie au labo ou à la direction.';
  end if;

  if not exists (
    select 1 from public.recette_familles f
     where f.id = p_famille_id and f.client_id = v_client
  ) then
    raise exception 'Recette introuvable dans cet établissement.';
  end if;

  if p_nom_vitrine is not null and length(p_nom_vitrine) > 80 then
    raise exception 'Nom de vitrine trop long (80 max).';
  end if;
  if p_description is not null and length(p_description) > 400 then
    raise exception 'Description trop longue (400 max).';
  end if;
  if p_photo is not null and length(p_photo) > 500 then
    raise exception 'Chemin de photo trop long (500 max).';
  end if;
  if p_ordre is null or p_ordre < 0 or p_ordre > 9999 then
    raise exception 'Ordre d''affichage invalide (0 à 9999).';
  end if;

  update public.recette_familles f
     set visible_vitrine = coalesce(p_visible, false),
         nom_vitrine = nullif(trim(coalesce(p_nom_vitrine, '')), ''),
         description_vitrine = nullif(trim(coalesce(p_description, '')), ''),
         -- `p_photo` à null conserve la photo existante : une mise à jour
         -- de l'ordre d'affichage n'efface pas la photo par accident.
         photo_vitrine = coalesce(nullif(trim(p_photo), ''), f.photo_vitrine),
         ordre_vitrine = p_ordre
   where f.id = p_famille_id;

  return jsonb_build_object('id', p_famille_id, 'visible', coalesce(p_visible, false));
end;
$$;

revoke all on function public.patisgest_enregistrer_fiche_vitrine(uuid, boolean, text, text, text, integer)
  from public, anon;
grant execute on function public.patisgest_enregistrer_fiche_vitrine(uuid, boolean, text, text, text, integer)
  to authenticated;

-- ---------------------------------------------- retirer / supprimer
-- « Seul le propriétaire peut ajouter ou supprimer des recettes. »
-- Retirer de la vitrine = dépublier (réversible, labo autorisé).
-- SUPPRIMER la recette = propriétaire seul.
create or replace function public.patisgest_supprimer_recette(
  p_famille_id uuid
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
  v_nom text;
  v_versions int;
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then
    raise exception 'Seul le propriétaire peut supprimer une recette.';
  end if;

  select f.nom into v_nom from public.recette_familles f
   where f.id = p_famille_id and f.client_id = v_client;
  if v_nom is null then
    raise exception 'Recette introuvable dans cet établissement.';
  end if;

  -- Une recette qui porte des versions est le support de la traçabilité
  -- des lots (RG-15, rappel). On la dépublie, on ne la supprime pas.
  select count(*) into v_versions from public.recette_versions v
   where v.famille_id = p_famille_id;
  if v_versions > 0 then
    raise exception 'Cette recette a des versions : dépubliez-la de la vitrine au lieu de la supprimer.';
  end if;

  delete from public.recette_familles f where f.id = p_famille_id;
  return jsonb_build_object('id', p_famille_id, 'supprimee', true, 'nom', v_nom);
end;
$$;

revoke all on function public.patisgest_supprimer_recette(uuid) from public, anon;
grant execute on function public.patisgest_supprimer_recette(uuid) to authenticated;

-- ------------------------------------------------ vérification
--   -- aucune écriture directe possible : 0 policy d'écriture
--   select c.relname,
--          (select count(*) from pg_policy p
--            where p.polrelid = c.oid and p.polcmd in ('w','a','d','*'))
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname in ('recette_familles', 'cakes');

-- ===== 31-publication-vitrine.sql =====
-- =====================================================================
-- Migration 31 — Publication d'une vitrine (propriétaire seul)
--
-- Pourquoi une RPC alors que `sites` a déjà des policies d'écriture :
-- `sites_update_staff` autorise propriétaire **et labo**. Or publier une
-- vitrine engage l'établissement (nom, prix, adresse publique) : la règle
-- métier dit « propriétaire ». Un `update` direct depuis l'interface
-- laisserait donc le laboratoire publier, ce qui n'est pas voulu.
--
-- Cette fonction fait aussi les contrôles que la RPC de réservation ne
-- peut pas faire seule :
--   • publier sans adresse est impossible (contrainte `sites_publiee_a_une_adresse`) ;
--   • publier une vitrine sans AUCUNE recette visible donnerait une page
--     vide au visiteur — on refuse avec un message actionnable.
--
-- Idempotent : rejouable.
-- =====================================================================

create or replace function public.patisgest_publier_vitrine(
  p_site_id uuid,
  p_publication text
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
  v_site record;
  v_visibles int;
begin
  if v_auth is null then raise exception 'Non authentifié.'; end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;

  -- Publier engage l'établissement : propriétaire seul.
  if v_role <> 'proprietaire' then
    raise exception 'Seul le propriétaire peut publier ou dépublier une vitrine.';
  end if;

  if p_publication not in ('aucune', 'brouillon', 'publiee') then
    raise exception 'État de publication invalide.';
  end if;

  select s.* into v_site from public.sites s
   where s.id = p_site_id and s.client_id = v_client
   for update;
  if not found then
    raise exception 'Site introuvable dans cet établissement.';
  end if;

  if p_publication = 'publiee' then
    if coalesce(trim(v_site.subdomain), '') = '' and coalesce(trim(v_site.custom_domain), '') = '' then
      raise exception 'Réservez d''abord une adresse (sous-domaine) pour cette boutique.';
    end if;

    select count(*) into v_visibles
      from public.recette_familles f
     where f.client_id = v_client and f.visible_vitrine;
    if v_visibles = 0 then
      raise exception 'Publiez au moins une recette sur la vitrine avant de la mettre en ligne.';
    end if;
  end if;

  update public.sites s
     set publication = p_publication,
         vitrine_publiee_le = case
           when p_publication = 'publiee' then coalesce(s.vitrine_publiee_le, now())
           else s.vitrine_publiee_le
         end
   where s.id = p_site_id;

  return jsonb_build_object(
    'site_id', p_site_id,
    'publication', p_publication,
    'recettes_visibles', v_visibles);
end;
$$;

revoke all on function public.patisgest_publier_vitrine(uuid, text) from public, anon;
grant execute on function public.patisgest_publier_vitrine(uuid, text) to authenticated;

-- ------------------------------------------------ vérification
--   -- le laboratoire doit être refusé
--   begin;
--     set local request.jwt.claims = '{"sub":"…302","role":"authenticated"}';
--     set local role authenticated;
--     select public.patisgest_publier_vitrine('<site>', 'publiee');  -- erreur attendue
--   rollback;

-- ===== 32-garde-prix-vitrine-rattrapage.sql =====
-- =====================================================================
-- 32 — Rattrapage Phase 1 de la revue : F-01 et F-18.
--
-- Pourquoi une migration et pas une édition de 21 / 27 : ces fichiers sont
-- déjà appliqués au pilote et leur empreinte est figée (repetition.json,
-- fixtures pilote). On corrige donc le corps INSTALLÉ, avec des gardes
-- strictes : si le corps n'est pas exactement celui attendu, la migration
-- s'arrête au lieu de deviner.
--
-- F-01 : une vente ne peut pas décrémenter le stock à un prix nul. Le
--        contrôle est dans vendre_panier (vendre_article en est un wrapper).
-- F-18 : patisgest_demander_commande lit v_site.subdomain ; la sélection
--        initiale ne charge que s.nom => « record "v_site" has no field
--        "subdomain" » pour tout visiteur. On sélectionne subdomain.
--
-- Compatible avec le brouillon 127 : si subdomain est déjà sélectionné,
-- 127 ne fait rien.
-- =====================================================================

do $migration$
declare
  definition text;
  corrigee text;
  n integer;
begin
  -- ---- F-01 : vendre_panier refuse un prix de vente nul ----------------
  select pg_get_functiondef(p.oid) into definition
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.oid = to_regprocedure('public.vendre_panier(uuid,jsonb,text,text)');
  if definition is null then
    raise exception 'RPC vendre_panier absente : appliquer 21 avant 32.';
  end if;

  n := (length(definition) - length(replace(definition,
         'if v_art.pv_ht is null or v_art.pv_ht < 0 or',
         ''))) / length('if v_art.pv_ht is null or v_art.pv_ht < 0 or');
  if n = 0 then
    if position('if v_art.pv_ht is null or v_art.pv_ht <= 0 or' in definition) > 0 then
      null; -- déjà corrigée
    else
      raise exception 'Corps de vendre_panier inattendu : réconciliation manuelle requise.';
    end if;
  elsif n = 1 then
    corrigee := replace(definition,
      'if v_art.pv_ht is null or v_art.pv_ht < 0 or',
      'if v_art.pv_ht is null or v_art.pv_ht <= 0 or');
    execute corrigee;
  else
    raise exception 'Garde de prix ambiguë dans vendre_panier : audit manuel requis.';
  end if;

  -- ---- F-18 : patisgest_demander_commande lit subdomain -----------------
  if to_regprocedure('public.patisgest_demander_commande(text,text,text,text,date,integer,text,text)') is not null then
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
