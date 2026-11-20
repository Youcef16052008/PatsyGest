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

begin;

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

commit;

-- ------------------------------------------------ vérification
--   -- le laboratoire doit être refusé
--   begin;
--     set local request.jwt.claims = '{"sub":"…302","role":"authenticated"}';
--     set local role authenticated;
--     select public.patisgest_publier_vitrine('<site>', 'publiee');  -- erreur attendue
--   rollback;
