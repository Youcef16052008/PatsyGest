   injected:=regexp_replace(def, E'\\mbegin\\M', format('begin perform public.patisgest_exiger_modules(string_to_array(%L, %L));', x.modules,'|'), 'i');
   if injected=def then raise exception 'Garde impossible sur RPC %',x.nom; end if;
   execute injected;
 end loop;
end $$;

-- La restauration contourne RLS et peut réécrire tous les modules. Elle ne
-- doit pas permettre de contourner un module désactivé pour le propriétaire.
alter function public.restaurer_sauvegarde(jsonb) rename to patisgest_restaurer_sauvegarde_interne;
revoke all on function public.patisgest_restaurer_sauvegarde_interne(jsonb) from public,anon,authenticated;
create function public.restaurer_sauvegarde(p_dump jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare m text;
begin
 foreach m in array array['stocks','achats','recettes','caisse','production','transferts','cloture','qualite','cake-design','tracabilite','planning','simulation'] loop
  perform public.patisgest_exiger_modules(array[m]);
 end loop;
 return public.patisgest_restaurer_sauvegarde_interne(p_dump);
end $$;
revoke all on function public.restaurer_sauvegarde(jsonb) from public,anon;
grant execute on function public.restaurer_sauvegarde(jsonb) to authenticated,service_role;

-- Tables à usage exclusif et écritures directes : les policies restrictives
-- s'ajoutent aux politiques de tenant/rôle, jamais ne les remplacent.
do $$ declare x record;
begin
 for x in select * from (values
 ('releve_temperatures','qualite','all'),('nettoyages','qualite','all'),('non_conformites','qualite','all'),
 ('transferts','transferts','all'),('taches_planning','planning','all'),('demandes_reassort','planning|transferts','all'),
 ('recette_familles','recettes|production|cake-design|planning','select'),('recette_versions','recettes|production|cake-design','select'),
 ('ordres_fabrication','production|planning|cake-design','select'),('cakes','cake-design','select'),
 ('bons_commande','achats','select'),('historique_prix','achats|simulation','select'),
 ('parametres_couts','simulation','insert'),('parametres_couts','simulation','update'),
 ('ventes','caisse|cloture|planning','select'),('z_imports','caisse|cloture','select'),('clotures','cloture|planning','select'),
 ('articles','stocks','insert'),('articles','stocks','update'),('lots','stocks','insert'),('lots','stocks','update'),('mouvements','stocks','insert'),('fournisseurs','achats','insert'),
 ('conversions','recettes','insert'),('conversions','recettes','update'),('conversions','recettes','delete')
 ) as t(table_name,modules,cmd) loop
  execute format('drop policy if exists %I on public.%I','module_guard_'||x.cmd,x.table_name);
  if x.cmd='insert' then
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|');
  elsif x.cmd='update' then
    execute format('create policy %I on public.%I as restrictive for update to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m))) with check (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|',x.modules,'|');
  elsif x.cmd='delete' then
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.modules,'|');
  else
    execute format('create policy %I on public.%I as restrictive for %s to authenticated using (exists(select 1 from unnest(string_to_array(%L,%L)) m where public.patisgest_module_autorise(m)))','module_guard_'||x.cmd,x.table_name,x.cmd,x.modules,'|');
  end if;
 end loop;
end $$;

-- ===== 24-index-exploitation.sql =====
-- =====================================================================
-- Migration 24 — Index d'exploitation multi-tenant.
--
-- Pourquoi maintenant : le pilote ne compte qu'un établissement et
-- 8 ventes, donc tout est instantané même sans index. Le modèle visé
-- (50 comptes · 100 boutiques · dizaines de tickets par jour) met
-- toutes les boutiques dans les MÊMES tables, séparées par client_id.
-- Relevé du 2026-11-19 sur la base pilote (evepzygucfxarpdnflzv) :
--   ventes (8 lignes)      → 2 index : pkey + (client_id, ticket)
--   mouvements (7)         → 1 index : pkey
--   lots (13)              → 1 index : pkey
--   clotures / OF / etc.   → 1 index : pkey
-- Chaque écran filtre client_id puis trie par date : sans index
-- composite, PostgreSQL balaie la table entière à chaque affichage,
-- pour toutes les boutiques à la fois.
--
-- Portée volontairement limitée : uniquement les prédicats réellement
-- écrits dans src/ (relevés fichier par fichier) et dans les RPC
-- FEFO des migrations 06 à 11. Aucun index « au cas où ».
--
-- Coût : quelques Mo pour 1,8 M tickets/an. Aucun verrou long sur des
-- tables de cette taille. Sur une base déjà volumineuse, remplacer
-- chaque `create index` par `create index concurrently` (hors
-- transaction) pour ne pas bloquer la caisse.
--
-- Idempotent : `if not exists`, rejouable sans effet.
-- =====================================================================

-- ------------------------------------------------------------- ventes
-- lireVentesJours : eq(client_id) + date_vente entre … order by id
-- Clôture / reconstitution : order by date_vente desc limit 500
create index if not exists ventes_client_date_idx
  on public.ventes (client_id, date_vente);

-- lireHistoriqueCaisse : order by created_at desc, id desc limit 40
create index if not exists ventes_client_created_idx
  on public.ventes (client_id, created_at desc, id desc);

-- --------------------------------------------------------- mouvements
-- Journal immuable : lecture d'un lot, d'un article ou d'une période.
create index if not exists mouvements_client_date_idx
  on public.mouvements (client_id, date_mvt desc);

create index if not exists mouvements_client_lot_idx
  on public.mouvements (client_id, lot_id);

-- ---------------------------------------------------------------- lots
-- Cœur du FEFO (migrations 06, 07, 08, 10, 11) : le prédicat est
--   client_id = … and article_id = … and site_id = …
--   and not bloque and qte_rest > 0
-- suivi de `order by congele, dlc nulls last, date_reception, id`.
-- Index partiel : il ne contient que les lots consommables, donc il
-- reste petit même après des années d'historique épuisé.
create index if not exists lots_fefo_idx
  on public.lots (client_id, article_id, site_id, congele, dlc, date_reception, id)
  where qte_rest > 0 and not bloque;

-- Traçabilité / rappel de lot : recherche par numéro.
create index if not exists lots_client_numero_idx
  on public.lots (client_id, numero);

-- ---------------------------------------------------------- production
-- lireProduction : eq(client_id) + order by date_prevue
create index if not exists ordres_client_date_idx
  on public.ordres_fabrication (client_id, date_prevue);

-- --------------------------------------------------------- clôtures
create index if not exists clotures_client_date_idx
  on public.clotures (client_id, date_cloture desc);

-- ----------------------------------------------------- qualité (HACCP)
create index if not exists temperatures_client_date_idx
  on public.releve_temperatures (client_id, date_releve desc);

create index if not exists nettoyages_client_date_idx
  on public.nettoyages (client_id, date_nettoyage desc);

create index if not exists non_conformites_client_date_idx
  on public.non_conformites (client_id, date_nc desc);

-- ----------------------------------------------------------- planning
create index if not exists taches_client_date_idx
  on public.taches_planning (client_id, date_tache);

-- ------------------------------------------------ achats / prix / Z
create index if not exists historique_prix_client_date_idx
  on public.historique_prix (client_id, article_id, date_prix desc);

create index if not exists z_imports_client_date_idx
  on public.z_imports (client_id, date_z desc);

-- ------------------------------------------------- cakes et transferts
create index if not exists cakes_client_event_idx
  on public.cakes (client_id, date_event);

create index if not exists transferts_client_date_idx
  on public.transferts (client_id, date_transfert desc);

-- ------------------------------------------------ listes de référence
-- Les sélecteurs trient les articles et les sites par nom (lireArticles,
-- lireSites, écrans Stocks/Caisse/Clôture).
create index if not exists articles_client_nom_idx
  on public.articles (client_id, nom);

create index if not exists sites_client_nom_idx
  on public.sites (client_id, nom);

-- -------------------------------------------- confirmation de lecture
-- À exécuter après application pour vérifier que les 14 index existent :
--
--   select tablename, indexname from pg_indexes
--    where schemaname = 'public' and indexname like '%_idx'
--    order by tablename, indexname;

-- ===== 25-domaines-boutiques.sql =====
-- =====================================================================
-- Migration 25 — Domaines des boutiques en ligne (prérequis vitrine)
--
-- Objectif produit : chaque pâtisserie a un sous-domaine gratuit
-- (`elyasmine.patisgest.dz`), et l'offre Pro peut recevoir son propre
-- domaine (`patisserie-elyasmine.com`) via un CNAME → Cloudflare for SaaS.
--
-- ⚠️ Trois corrections par rapport au plan « évident » qu'on lit souvent :
--
--  1. `subdomain NOT NULL` casserait tout : la base pilote contient déjà
--     2 sites sans sous-domaine. La colonne est donc NULLABLE, et la
--     contrainte finale n'exige un sous-domaine QUE pour les sites dont
--     la vitrine est publiée (`publication <> 'aucune'`).
--
--  2. Un sous-domaine n'existe pas en double dans le monde : un client
--     pouvait prendre « el-yasmine » avant qu'un autre ne le veuille.
--     Le format est donc verrouillé (minuscules, chiffres, tirets) pour
--     qu'il soit aussi un nom DNS valide, et la réservation se fait via
--     une RPC (migration suivante) et non par un UPDATE direct.
--
--  3. Pas de `UNIQUE` global sur `custom_domain` sans normalisation : la
--     casse et le « www. » créeraient deux entrées pour le même site.
--     On normalise en minuscules et on interdit le préfixe www. : le
--     visiteur arrive sur le domaine nu, il n'y a rien à distinguer.
--
-- Rien n'est publié par cette migration : elle prépare le schéma. Le
-- routage par hôte est un chantier distinct (voir NOTE-COUT-MINIMAL.md).
-- Idempotent : rejouable.
-- =====================================================================

-- ------------------------------------------------------- sous-domaine
alter table public.sites
  add column if not exists subdomain text,
  add column if not exists custom_domain text,
  -- 'aucune' = pas de vitrine ; 'brouillon' = réservée, pas visible ;
  -- 'publiee' = la vitrine répond. Le défaut protège les sites existants :
  -- deux boutiques ne deviennent pas publiques par accident.
  add column if not exists publication text not null default 'aucune',
  add column if not exists vitrine_publiee_le timestamptz;

-- Contraintes de forme, nommées pour être modifiables plus tard.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sites_subdomain_forme') then
    alter table public.sites add constraint sites_subdomain_forme
      check (subdomain is null or subdomain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sites_custom_domain_forme') then
    alter table public.sites add constraint sites_custom_domain_forme
      check (
        custom_domain is null
        or (
          custom_domain = lower(custom_domain)
          and custom_domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
          and custom_domain not like 'www.%'
        )
      );
  end if;

  if not exists (select 1 from pg_constraint where conname = 'sites_publication_valeurs') then
    alter table public.sites add constraint sites_publication_valeurs
      check (publication in ('aucune', 'brouillon', 'publiee'));
  end if;

  -- Une vitrine publiée DOIT avoir une adresse : sinon elle serait
  -- inaccessible tout en apparaissant comme publiée dans l'interface.
  if not exists (select 1 from pg_constraint where conname = 'sites_publiee_a_une_adresse') then
    alter table public.sites add constraint sites_publiee_a_une_adresse
      check (publication <> 'publiee' or subdomain is not null or custom_domain is not null);
  end if;
end $$;

-- --------------------------------------------------------- unicité
-- Un sous-domaine est unique dans TOUT le service, pas par client :
-- il devient un nom DNS. Index partiels : les NULL restent autorisés.
create unique index if not exists sites_subdomain_unique
  on public.sites (lower(subdomain)) where subdomain is not null;

create unique index if not exists sites_custom_domain_unique
  on public.sites (lower(custom_domain)) where custom_domain is not null;

-- Résolution `host → site` : c'est la requête faite à CHAQUE visite
-- d'une vitrine. Sans cet index, chaque page vue balaie tous les sites.
create index if not exists sites_publication_idx
  on public.sites (publication) where publication = 'publiee';

-- ------------------------------------------------- mots réservés
-- Un client ne doit pas pouvoir prendre « app », « api », « www »… :
-- ces noms portent l'application elle-même.
create table if not exists public.sous_domaines_reserves (
  nom text primary key,
  raison text
);

insert into public.sous_domaines_reserves (nom, raison) values
  ('www', 'site principal'),
  ('app', 'application de gestion'),
  ('api', 'API'),
  ('admin', 'administration'),
  ('mail', 'e-mail'),
  ('smtp', 'e-mail'),
  ('ftp', 'transfert de fichiers'),
  ('cdn', 'assets'),
  ('static', 'assets'),
  ('assets', 'assets'),
  ('status', 'page de statut'),
  ('support', 'support'),
  ('aide', 'support'),
  ('blog', 'contenu'),
  ('demo', 'démonstration'),
  ('test', 'test'),
  ('staging', 'recette'),
  ('dev', 'développement'),
  ('patisgest', 'marque')
on conflict (nom) do nothing;

-- Lecture publique nécessaire ? Non : cette table ne contient aucune
-- donnée personnelle, mais elle est lue par la fonction de réservation
-- (SECURITY DEFINER) et non par le client. RLS activée sans policy =
-- invisible pour `anon` et `authenticated`, ce qui est le but.
alter table public.sous_domaines_reserves enable row level security;

-- ------------------------------------------------------ cohérence
-- Le site doit appartenir au même client que le sous-domaine réservé :
-- impossible de réserver pour un autre établissement.
create or replace function public.patisgest_reserver_sous_domaine(
  p_site_id uuid,
  p_sous_domaine text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_nom text := lower(trim(coalesce(p_sous_domaine, '')));
begin
  if auth.uid() is null then
    raise exception 'Non authentifié.';
  end if;
  if public.patisgest_mon_role() not in ('proprietaire') then
    raise exception 'Réservé au propriétaire.';
  end if;

  select s.client_id into v_client
    from public.sites s
   where s.id = p_site_id
     and s.client_id = public.patisgest_mon_client();
  if v_client is null then
    raise exception 'Site introuvable dans cet établissement.';
  end if;

  if v_nom !~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' then
    raise exception 'Sous-domaine invalide : minuscules, chiffres et tirets uniquement.';
  end if;
  if length(v_nom) < 3 then
    raise exception 'Sous-domaine trop court (3 caractères minimum).';
  end if;
  if exists (select 1 from public.sous_domaines_reserves r where r.nom = v_nom) then
    raise exception 'Ce sous-domaine est réservé.';
  end if;
  if exists (
    select 1 from public.sites s
     where lower(s.subdomain) = v_nom and s.id <> p_site_id
  ) then
    raise exception 'Ce sous-domaine est déjà pris.';
  end if;

  update public.sites
     set subdomain = v_nom
   where id = p_site_id;
end;
$$;

revoke all on function public.patisgest_reserver_sous_domaine(uuid, text) from public;
grant execute on function public.patisgest_reserver_sous_domaine(uuid, text) to authenticated;

-- ------------------------------------------------ vérification
-- Doit renvoyer 4 colonnes et 5 contraintes (les 3 existantes + 3 ajoutées,
-- moins celles déjà présentes) :
--
--   select column_name from information_schema.columns
--    where table_name = 'sites'
--      and column_name in ('subdomain','custom_domain','publication','vitrine_publiee_le');
--
--   select conname from pg_constraint
--    where conrelid = 'public.sites'::regclass and conname like 'sites_%';
--
-- Les 2 sites existants restent à publication = 'aucune' : aucune vitrine
-- n'est ouverte par cette migration.

-- ===== 26-vitrine-publique.sql =====
-- =====================================================================
-- Migration 26 — Vitrine publique par boutique (schéma)
--                                    (la RPC de commande est en 27)
--
-- Objectif produit : chaque site (boutique) peut publier sa vitrine. Elle
-- montre les recettes du catalogue de l'établissement, avec photos, et
-- permet au visiteur de déposer une demande de commande. Les demandes
-- arrivent dans `cakes` et le vendeur peut seulement les accepter ou les
-- refuser.
--
-- ⚠️ Ce fichier a été corrigé après lecture du schéma RÉEL de la base
--    pilote (2026-11-19). Trois erreurs du premier jet sont corrigées ici :
--
--  1. `cakes.statut` a une contrainte `cakes_statut_valid` limitée à
--     devis/acompte/confirme/produit/livre/annule. Écrire « demande »
--     aurait fait échouer toute commande de visiteur. La contrainte est
--     donc élargie explicitement, en dernier recours dans cette migration.
--
--  2. Le dédoublonnage se fait sur le NOM DE LA RECETTE (`recette_familles.nom`),
--     pas sur le produit lié. Relevé sur la base : la famille « Cake » pointe
--     sur l'article « Pâte feuilletée » et la famille « Croissant Pur Beurre »
--     sur « Croissant au beurre » — les noms divergent. Dédoublonner sur
--     l'article aurait fusionné ou scindé les mauvaises recettes.
--
--  3. « Cake » pointe sur un article à `pv_ht = 0.00`. Afficher « 0 DA » sur
--     une vitrine est un mensonge commercial : la vue publie `null` et la
--     page écrit « prix sur demande ». Aucune recette à 0 n'est publiée à 0.
--
-- Une vitrine ne doit JAMAIS exposer les coûts : les tables de coût
-- (recette_versions, parametres_couts) restent illisibles par `anon`, et la
-- vue ne sélectionne que des colonnes de vente, une par une.
--
-- Idempotent : rejouable.
-- =====================================================================

-- --------------------------------------------- 1. clé de nom normalisée
-- Supprime accents, casse, espaces et ponctuation : « Éclair au chocolat »
-- et « eclair  au  chocolat » donnent « eclair au chocolat ».
--
-- On n'utilise PAS `unaccent()` : cette fonction est STABLE et non
-- IMMUTABLE ; l'appeler depuis une fonction déclarée IMMUTABLE donnerait un
-- index silencieusement faux. `translate()` est déterministe, 1 caractère
-- vers 1 caractère, et ne demande aucune extension. Les ligatures (œ, æ)
-- sont traitées à part car elles se dédoublent en deux lettres.
create or replace function public.patisgest_cle_nom(p_nom text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    trim(regexp_replace(
      replace(replace(
        translate(
          lower(coalesce(p_nom, '')),
          'àáâãäåāăąçćĉċčèéêëēĕėęěìíîïĩīĭįıñńņňòóôõöøōŏőùúûüũūŭůűųýÿŷžźżšśșşțţ',
          'aaaaaaaaaccccceeeeeeeeeiiiiiiiiinnnnooooooooouuuuuuuuuuyyyzzzsssstt'
        ),
        'œ', 'oe'
      ), 'æ', 'ae'),
      '[^a-z0-9]+', ' ', 'g'
    )),
    ''
  );
$$;

comment on function public.patisgest_cle_nom(text) is
  'Clé de dédoublonnage des noms de recettes : accents, casse et ponctuation ignorés.';

-- ------------------------------------------------ 2. champs vitrine
-- `nom` reste le nom technique utilisé par la production ; `nom_vitrine`
-- est ce que le client final lit. Les deux peuvent différer.
alter table public.recette_familles
  add column if not exists cle_nom text,
  add column if not exists nom_vitrine text,
  add column if not exists description_vitrine text,
  add column if not exists photo_vitrine text,
  -- Par défaut NON publiée : aucune recette existante ne part en ligne
  -- par accident le jour de l'exécution de cette migration.
  add column if not exists visible_vitrine boolean not null default false,
  add column if not exists ordre_vitrine integer not null default 100;

-- `cle_nom` est maintenue par trigger : l'application n'a pas à y penser,
-- et une correction de nom ne peut pas laisser une clé périmée derrière elle.
create or replace function public.patisgest_maj_cle_nom()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.cle_nom := public.patisgest_cle_nom(new.nom);
  return new;
end;
$$;

drop trigger if exists recette_familles_cle_nom_trg on public.recette_familles;
create trigger recette_familles_cle_nom_trg
  before insert or update of nom on public.recette_familles
  for each row execute function public.patisgest_maj_cle_nom();

-- Remplissage initial des familles existantes.
update public.recette_familles
   set cle_nom = public.patisgest_cle_nom(nom)
 where cle_nom is null;

-- Recherche du dédoublonnage (`distinct on (client_id, cle_nom)`).
-- Non unique à dessein : deux recettes homonymes peuvent exister côté
-- production ; c'est la VUE qui n'en publie qu'une.
create index if not exists recette_familles_cle_nom_idx
  on public.recette_familles (client_id, cle_nom);

-- ------------------------------------------------ 3. photos vitrine
-- Table dédiée plutôt qu'une colonne par recette : un gâteau a plusieurs
-- photos et la vitrine n'a besoin de rien d'autre.
create table if not exists public.vitrine_photos (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  famille_id uuid not null references public.recette_familles (id) on delete cascade,
  chemin text not null,
  legende text,
  position integer not null default 100,
  created_at timestamptz not null default now()
);

create index if not exists vitrine_photos_famille_idx
  on public.vitrine_photos (client_id, famille_id, position);

alter table public.vitrine_photos enable row level security;

-- Écriture des photos : propriétaire ET laboratoire (règle métier).
drop policy if exists vitrine_photos_ecriture on public.vitrine_photos;
create policy vitrine_photos_ecriture on public.vitrine_photos
  for all to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- Lecture interne : tout le personnel (le vendeur doit voir la photo en
-- caisse). La lecture PUBLIQUE passe par la vue, jamais par cette table.
drop policy if exists vitrine_photos_lecture on public.vitrine_photos;
create policy vitrine_photos_lecture on public.vitrine_photos
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

-- ------------------------------------------- 4. demandes de visiteurs
-- Une demande n'est PAS un devis : elle n'a ni prix ni acompte, et le
-- vendeur n'a pas le droit de la modifier — seulement de l'accepter
-- (elle devient un devis à chiffrer) ou de la refuser.
alter table public.cakes
  add column if not exists origine text not null default 'interne',
  add column if not exists cle_vitrine text,
  add column if not exists statut_note text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'cakes_origine_valeurs') then
    alter table public.cakes add constraint cakes_origine_valeurs
      check (origine in ('interne', 'vitrine'));
  end if;
end $$;

-- Le statut « demande » n'existait pas. On remplace la contrainte en
-- conservant l'ordre logique du cycle de vie ; « demande » est en tête.
do $$
begin
  if exists (
    select 1 from pg_constraint
     where conrelid = 'public.cakes'::regclass
       and conname = 'cakes_statut_valid'
       and pg_get_constraintdef(oid) not like '%demande%'
  ) then
    alter table public.cakes drop constraint cakes_statut_valid;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.cakes'::regclass
       and conname = 'cakes_statut_valid'
  ) then
    alter table public.cakes add constraint cakes_statut_valid
      check (statut in ('demande', 'devis', 'acompte', 'confirme', 'produit', 'livre', 'annule'));
  end if;
end $$;

-- Deux envois identiques du même visiteur (double clic, réseau instable)
-- = une seule demande. L'unicité porte sur une référence tirée par le
-- navigateur, jamais sur l'IP ni sur le contenu (deux vraies commandes
-- peuvent être identiques).
create unique index if not exists cakes_cle_vitrine_unique
  on public.cakes (client_id, cle_vitrine) where cle_vitrine is not null;

-- ------------------------------------------------- 5. vue publique
-- Seules les recettes VISIBLES d'un site PUBLIÉ sont exposées. Colonnes
-- choisies une par une : aucun coût, aucun ingrédient, aucun identifiant
-- interne n'est nécessaire au visiteur.
--
-- Dédoublonnage : une même `cle_nom` ne sort qu'UNE fois par établissement
-- (exigence métier : « même nom de gâteau = même gâteau »). On garde la
-- recette dont l'ordre d'affichage est le plus petit, puis le nom, puis
-- l'id — donc de façon déterministe et testable.
create or replace view public.vitrine_catalogue
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
select p.client_id,
       p.cle_nom,
       p.nom,
       p.description,
       p.photo_vitrine,
       p.ordre_vitrine,
       c.nom as etablissement,
       s.nom as boutique,
       s.subdomain,
       s.custom_domain,
       -- Prix de vente UNIQUEMENT, jamais le coût. 0 devient `null` :
       -- « 0 DA » sur une vitrine serait un mensonge commercial.
       nullif(a.pv_ht, 0) as prix_ht,
       a.tva,
       a.unite
  from premiere p
  join public.clients c on c.id = p.client_id
  join public.sites s on s.client_id = p.client_id
   and s.publication = 'publiee'
  left join public.articles a on a.id = p.produit_id;

-- La vue est en security_invoker = false : elle contourne la RLS et expose
-- donc exactement les colonnes listées ci-dessus, pour tous les sites
-- publiés. C'est le prix à payer pour qu'un visiteur anonyme voie une
-- vitrine sans jamais lire `recette_familles` ou `articles` directement.
comment on view public.vitrine_catalogue is
  'Catalogue public des vitrines publiées. Aucune colonne de coût. Lecture anon admise.';

revoke all on public.vitrine_catalogue from public, anon, authenticated;
grant select on public.vitrine_catalogue to anon, authenticated;

-- ------------------------------------------------ vérification
--   -- toutes les familles ont une clé
--   select count(*) from public.recette_familles where cle_nom is null;   -- 0
--   -- aucune vitrine publiée par accident
--   select count(*) from public.recette_familles where visible_vitrine;   -- 0
--   -- anon ne voit aucune table interne
--   begin; set local role anon;
--     select count(*) from public.clients;       -- 0
--     select count(*) from public.recette_familles; -- 0
--   rollback;

-- ===== 27-commandes-vitrine.sql =====
-- =====================================================================
-- Migration 27 — Commandes de vitrine : dépôt public et traitement vendeur
--
-- Deux RPC, et deux seulement :
--
--   1. `patisgest_demander_commande`  — appelée par un visiteur ANONYME
--      depuis une vitrine publiée. Elle est la SEULE fonction exécutable
--      par `anon` dans tout le schéma (voir tests/securite.test.mjs, qui
--      exige une liste blanche explicite).
--
--   2. `patisgest_traiter_demande`    — appelée par le personnel, pour
--      accepter (→ devis) ou refuser (→ annule) une demande.
--
-- Pourquoi une RPC et pas un `insert` direct : `anon` n'a aucun droit
-- d'écriture sur `cakes` (migration 28), et il ne doit jamais en avoir.
-- La fonction décide elle-même du `client_id` (jamais fourni par le
-- visiteur), du numéro, du statut et du prix. Un visiteur ne peut donc
-- ni choisir son établissement, ni fixer un prix, ni marquer une
-- commande comme payée.
--
-- Idempotent : rejouable.
-- =====================================================================

-- ============================================================= 1. dépôt
create or replace function public.patisgest_demander_commande(
  p_sous_domaine text,
  p_cle_recette text,
  p_client_nom text,
  p_telephone text,
  p_date_event date,
  p_nb_parts integer,
  p_note text,
  p_cle_navigateur text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_site record;
  v_client uuid;
  v_famille text;
  v_cle text;
  v_numero text;
  v_id uuid;
  v_existant record;
  v_flux int;
begin
  -- ---- 1. le site visé : publié, et désigné par son sous-domaine.
  -- Un site « brouillon » ou « aucune » est traité exactement comme un
  -- site inexistant : pas de fuite d'existence.
  select s.id, s.client_id, s.nom
    into v_site
    from public.sites s
   where lower(s.subdomain) = lower(trim(coalesce(p_sous_domaine, '')))
     and s.publication = 'publiee'
   limit 1;
  if v_site.id is null then
    raise exception 'Vitrine introuvable ou non publiée.';
  end if;
  v_client := v_site.client_id;

  -- ---- 2. la recette : elle doit être réellement publiée sur CETTE
  -- vitrine. Sans ce contrôle, un visiteur pourrait commander une recette
  -- masquée en devinant sa clé.
  v_cle := public.patisgest_cle_nom(p_cle_recette);
  if v_cle is null then
    raise exception 'Recette invalide.';
  end if;
  select v.nom into v_famille
    from public.vitrine_catalogue v
   where v.client_id = v_client
     and v.subdomain = v_site.subdomain
     and v.cle_nom = v_cle
   limit 1;
  if v_famille is null then
    raise exception 'Cette recette n''est pas proposée par cette vitrine.';
  end if;

  -- ---- 3. validations de saisie (mêmes bornes que `creer_cake`).
  if p_client_nom is null or length(trim(p_client_nom)) < 2
     or length(trim(p_client_nom)) > 100 then
    raise exception 'Votre nom est requis (2 à 100 caractères).';
  end if;
  if p_telephone is null or length(regexp_replace(p_telephone, '[^0-9]', '', 'g')) < 6
     or length(p_telephone) > 40 then
    raise exception 'Un numéro de téléphone joignable est requis.';
  end if;
  if p_date_event is null or p_date_event < current_date then
    raise exception 'La date souhaitée doit être aujourd''hui ou plus tard.';
  end if;
  if p_date_event > current_date + 365 then
    raise exception 'Les commandes se prennent au plus un an à l''avance.';
  end if;
  if p_nb_parts is null or p_nb_parts < 1 or p_nb_parts > 10000 then
    raise exception 'Nombre de parts invalide (1 à 10000).';
  end if;
  if p_note is not null and length(p_note) > 500 then
    raise exception 'Précisions trop longues (500 caractères maximum).';
  end if;

  -- ---- 4. idempotence : rejouer le même envoi renvoie la même demande.
  -- La clé est tirée par le navigateur et unique par établissement
  -- (index `cakes_cle_vitrine_unique`, migration 26). Un double clic,
  -- un retour arrière ou un réseau instable ne crée pas de doublon.
  v_cle := nullif(trim(coalesce(p_cle_navigateur, '')), '');
  if v_cle is null or length(v_cle) < 8 or length(v_cle) > 64 then
    raise exception 'Référence de demande invalide.';
  end if;

  select k.id, k.numero into v_existant
    from public.cakes k
   where k.client_id = v_client
     and k.cle_vitrine = v_cle
   limit 1;
  if v_existant.id is not null then
    return jsonb_build_object(
      'id', v_existant.id,
      'numero', v_existant.numero,
      'deja_enregistree', true);
  end if;

  -- ---- 5. garde-fou anti-flood, sans stocker d'IP (donnée personnelle
  -- qu'on n'a aucune raison de conserver). 30 demandes par heure et par
  -- établissement : au-delà, c'est un robot, pas une pâtisserie.
  select count(*) into v_flux
    from public.cakes k
   where k.client_id = v_client
     and k.origine = 'vitrine'
     and k.created_at > now() - interval '1 hour';
  if v_flux >= 30 then
    raise exception 'Trop de demandes en peu de temps. Merci de réessayer plus tard ou d''appeler la boutique.';
  end if;

  -- ---- 6. écriture. Le prix n'est PAS fixé par le visiteur : la demande
  -- part à 0 et c'est la boutique qui chiffre en l'acceptant.
  v_numero := 'VIT-' || upper(substr(md5(gen_random_uuid()::text), 1, 8));

  insert into public.cakes (
    client_id, numero, client_nom, telephone, date_event, nb_parts,
    options, prix_ht, acompte, statut, cgv, notes, retro, paiements,
    site_id, origine, cle_vitrine, statut_note
  ) values (
    v_client, v_numero, trim(p_client_nom), trim(p_telephone), p_date_event, p_nb_parts,
    jsonb_build_array(jsonb_build_object('name', v_famille, 'cout', 0, 'minutes', 0)),
    0, 0, 'demande', false,
    nullif(trim(coalesce(p_note, '')), ''),
    '[]'::jsonb, '[]'::jsonb,
    v_site.id, 'vitrine', v_cle,
    'Demande déposée depuis la vitrine en ligne.'
  )
  returning id into v_id;

  return jsonb_build_object('id', v_id, 'numero', v_numero, 'deja_enregistree', false);
end;
$$;

-- Seule fonction du schéma ouverte à `anon` : `tests/securite.test.mjs`
-- contient une liste blanche nominative et échouera sur toute autre.
revoke all on function public.patisgest_demander_commande(text, text, text, text, date, integer, text, text)
  from public, anon, authenticated;
grant execute on function public.patisgest_demander_commande(text, text, text, text, date, integer, text, text)
  to anon, authenticated;

-- ========================================================= 2. traitement
create or replace function public.patisgest_traiter_demande(
  p_id uuid,
  p_decision text
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
  v_cake record;
  v_statut text;
begin
  if v_auth is null then
    raise exception 'Non authentifié.';
  end if;

  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;

  -- Les vendeurs traitent les demandes : c'est explicitement leur rôle.
  if v_role not in ('proprietaire', 'labo', 'vendeur') then
    raise exception 'Rôle non autorisé.';
  end if;
  if p_decision not in ('accepter', 'refuser') then
    raise exception 'Décision invalide (accepter ou refuser).';
  end if;

  select k.* into v_cake
    from public.cakes k
   where k.id = p_id
   for update;
  if not found then
    raise exception 'Demande introuvable.';
  end if;
  if v_cake.client_id <> v_client then
    raise exception 'Demande hors périmètre.';
  end if;
  if v_cake.statut <> 'demande' then
    raise exception 'Cette demande a déjà été traitée (statut : %).', v_cake.statut;
  end if;

  -- Accepter ne veut pas dire vendre : la demande devient un DEVIS, que
  -- le personnel chiffre ensuite. Aucun prix n'est inventé ici.
  if p_decision = 'accepter' then
