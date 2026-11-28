-- Migration 56 — VAGUE 4 B.2 : langue FR/AR dans le profil utilisateur.
-- Additive only. Idempotente. Prérequis : 01 (utilisateurs) et 35 (app_schema_version).

begin;

-- Le cookie reste la source immédiate côté navigateur ; cette colonne permet
-- de retrouver la préférence sur un autre appareil après reconnexion.
alter table public.utilisateurs
  add column if not exists langue text not null default 'fr';

update public.utilisateurs
   set langue = 'fr'
 where langue is null or langue not in ('fr', 'ar');

alter table public.utilisateurs
  drop constraint if exists utilisateurs_langue_check;
alter table public.utilisateurs
  add constraint utilisateurs_langue_check check (langue in ('fr', 'ar'));

comment on column public.utilisateurs.langue is
  'Langue d’interface choisie par l’utilisateur : fr ou ar.';

-- Un utilisateur ne peut modifier QUE sa propre ligne, sans dépendre d’une
-- policy UPDATE supplémentaire sur utilisateurs. SECURITY DEFINER + search_path
-- vide + auth.uid() gardent la même isolation multi-tenant que le reste du schéma.
create or replace function public.enregistrer_langue_utilisateur(p_langue text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth uuid := auth.uid();
  v_client uuid;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  if p_langue not in ('fr', 'ar') then
    raise exception 'Langue invalide.';
  end if;

  select u.client_id into v_client
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;

  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;

  update public.utilisateurs
     set langue = p_langue
   where auth_user_id = v_auth
     and client_id = v_client;

  return jsonb_build_object('ok', true, 'langue', p_langue, 'client_id', v_client);
end;
$$;

revoke execute on function public.enregistrer_langue_utilisateur(text) from public, anon;
grant execute on function public.enregistrer_langue_utilisateur(text) to authenticated, service_role;

insert into public.app_schema_version (id, version)
values (1, 56)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

commit;
