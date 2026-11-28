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
    v_statut := 'devis';
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
