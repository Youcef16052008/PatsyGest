-- Migration 52 — Photo des recettes libres.
--
-- L'écran Recettes affiche une photo par recette (WebP compressé livré avec
-- l'application, ou photo prise au téléphone puis compressée dans le
-- navigateur). Additive only, idempotente, rejouable.

begin;

-- 1. Colonne photo : chemin livré (`/recettes/…`) ou data-URL JPEG bornée.
--    La borne de taille est volontairement basse (300 Ko) : une photo de
--    recette est lue à chaque affichage de l'écran Recettes, y compris en 3G.
alter table public.recettes_libres
  add column if not exists photo_url text;

do $$ begin
  alter table public.recettes_libres
    drop constraint if exists recettes_libres_photo_url_check;
  alter table public.recettes_libres
    add constraint recettes_libres_photo_url_check
    check (
      photo_url is null
      or char_length(photo_url) <= 300000
    );
exception
  when duplicate_object then null;
end $$;

comment on column public.recettes_libres.photo_url is
  'Photo de la recette : chemin local /recettes/<slug>.webp ou data:image/jpeg;base64 borné. Validé côté serveur par sanitizeRecipePhoto.';

-- 2. Version de schéma (jamais abaissée).
do $$ begin
  if to_regclass('public.app_schema_version') is null then
    raise exception 'Migration 52 : table app_schema_version absente (migration 35 requise).';
  end if;
end $$;

insert into public.app_schema_version (id, version) values (1, 52)
on conflict (id) do update set version = greatest(public.app_schema_version.version, excluded.version);

commit;
