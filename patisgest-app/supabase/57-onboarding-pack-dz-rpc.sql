-- Migration 57 — VAGUE 4 D : RPC idempotente du pack pâtisserie algérien.
-- Additive only. Idempotente et isolée par client_id.
-- Prérequis : 01/03 (articles), 50 (rôles), 56 (profil langue).
-- La migration 47 historique porte un nom proche mais ne contient que
-- `valider_tiroir_jour` : aucune migration appliquée n'est réécrite ici.

begin;

create or replace function public.importer_pack_patisserie_dz(
  p_activite text default 'mixte',
  p_tva text default 'ifu_0'
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
  v_total integer := 0;
  v_imported integer := 0;
begin
  if v_auth is null then
    raise exception 'Non authentifie.';
  end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u
   where u.auth_user_id = v_auth
   limit 1;
  if v_client is null then
    raise exception 'Compte introuvable.';
  end if;
  if v_role <> 'proprietaire' then
    raise exception 'Reserve au proprietaire.';
  end if;
  if p_activite not in ('mixte', 'boulangerie', 'patisserie', 'cake_shop') then
    raise exception 'Activite invalide.';
  end if;
  if p_tva not in ('ifu_0', 'reel_dz') then
    raise exception 'Regime TVA invalide.';
  end if;

  -- `on conflict (client_id, code) do nothing` rend l'appel rejouable sans
  -- écraser un prix ou une unité corrigés par le pâtissier. SECURITY DEFINER
  -- n'élargit pas le tenant : client_id vient uniquement du profil de auth.uid().
  with pack(code, nom, niveau, unite, seuil, prix_da, tva_reel, secteur) as (
    values
    ('PF-BAG', 'Baguette traditionnelle', 'produit', 'pcs', 40, 15, 0, 'boulangerie'),
    ('PF-PCM', 'Pain complet / céréales', 'produit', 'pcs', 20, 50, 9, 'boulangerie'),
    ('PF-BRI', 'Brioche artisanale', 'produit', 'pcs', 12, 160, 19, 'boulangerie'),
    ('PF-CRO', 'Croissant au beurre', 'produit', 'pcs', 20, 60, 19, 'boulangerie'),
    ('PF-PAC', 'Pain au chocolat', 'produit', 'pcs', 20, 70, 19, 'boulangerie'),
    ('PF-MIL', 'Mille-feuille vanille', 'produit', 'pcs', 12, 180, 19, 'patisserie'),
    ('PF-ECL', 'Éclair au chocolat', 'produit', 'pcs', 12, 200, 19, 'patisserie'),
    ('PF-TAR', 'Tartelette fruits', 'produit', 'pcs', 10, 240, 19, 'patisserie'),
    ('PF-BAK', 'Baklawa amandes', 'produit', 'kg', 3, 3200, 19, 'patisserie'),
    ('PF-MAK', 'Makrout el louz / miel', 'produit', 'kg', 4, 1800, 19, 'patisserie'),
    ('PF-KAL', 'Kalb El Louz', 'produit', 'pcs', 20, 120, 19, 'patisserie'),
    ('PF-ANN', 'Gâteau anniversaire (10 parts)', 'produit', 'pcs', 2, 3800, 19, 'cake_shop'),
    ('PF-BEN', 'Bento Cake personnalisé', 'produit', 'pcs', 4, 1600, 19, 'cake_shop'),
    ('PF-CUP', 'Boîte 6 Cupcakes décorés', 'produit', 'boîte', 4, 1200, 19, 'cake_shop'),
    ('MP-FAR', 'Farine pâtissière / boulangère', 'matiere', 'kg', 25, 95, 9, 'commun'),
    ('MP-LEV', 'Levure boulangère fraîche', 'matiere', 'kg', 3, 420, 9, 'boulangerie'),
    ('MP-BEU', 'Beurre de tourage / pâtissier', 'matiere', 'kg', 10, 950, 19, 'commun'),
    ('MP-SUC', 'Sucre cristallisé', 'matiere', 'kg', 15, 110, 9, 'commun'),
    ('MP-LAI', 'Lait entier', 'matiere', 'L', 12, 90, 9, 'commun'),
    ('MP-OEU', 'Œufs frais', 'matiere', 'pcs', 60, 22, 9, 'commun'),
    ('MP-AMA', 'Amandes blanchies', 'matiere', 'kg', 5, 1900, 19, 'patisserie'),
    ('MP-MIE', 'Miel pur', 'matiere', 'kg', 4, 1100, 9, 'patisserie'),
    ('MP-CHO', 'Chocolat noir pâtissier', 'matiere', 'kg', 4, 1800, 19, 'commun'),
    ('MP-CRE', 'Crème fraîche 35 %', 'matiere', 'L', 6, 780, 19, 'commun')
  ),
  selection as (
    select
      code,
      nom,
      niveau,
      unite,
      seuil::numeric(12,3) as seuil,
      case
        when p_tva = 'ifu_0' then prix_da::numeric
        else round((prix_da::numeric / (1 + tva_reel::numeric / 100))::numeric, 2)
      end as pv_ht,
      case when p_tva = 'ifu_0' then 0 else tva_reel end::numeric(5,2) as tva
    from pack
    where p_activite = 'mixte' or secteur = 'commun' or secteur = p_activite
  ),
  insere as (
    insert into public.articles (
      client_id, code, nom, niveau, unite, seuil, pv_ht, tva, allergenes, traces
    )
    select v_client, code, nom, niveau, unite, seuil, pv_ht, tva,
           '{}'::text[], '{}'::text[]
      from selection
    on conflict (client_id, code) do nothing
    returning 1
  )
  select (select count(*)::int from selection), (select count(*)::int from insere)
    into v_total, v_imported;

  return jsonb_build_object(
    'ok', true,
    'imported', v_imported,
    'total', v_total,
    'client_id', v_client,
    'activite', p_activite,
    'tva', p_tva
  );
end;
$$;

revoke execute on function public.importer_pack_patisserie_dz(text, text) from public, anon;
grant execute on function public.importer_pack_patisserie_dz(text, text) to authenticated, service_role;

insert into public.app_schema_version (id, version)
values (1, 57)
on conflict (id) do update
  set version = greatest(public.app_schema_version.version, excluded.version);

commit;
