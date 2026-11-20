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

begin;

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

commit;

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
