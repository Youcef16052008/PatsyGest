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

begin;

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

commit;

-- ------------------------------------------------ vérification
--   -- aucune écriture directe possible : 0 policy d'écriture
--   select c.relname,
--          (select count(*) from pg_policy p
--            where p.polrelid = c.oid and p.polcmd in ('w','a','d','*'))
--     from pg_class c join pg_namespace n on n.oid = c.relnamespace
--    where n.nspname = 'public' and c.relname in ('recette_familles', 'cakes');
