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
begin;

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

commit;
