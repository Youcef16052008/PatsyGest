-- US-15.3 — ajout d'une fiche fournisseur depuis Achats / le guide.
-- Pas d'UPDATE ni de DELETE : accès en insertion au seul établissement du rôle autorisé.
begin;

-- Remplacer les grants INSERT par défaut de Supabase par les deux colonnes utiles.
revoke insert on public.fournisseurs from public, anon, authenticated;
grant insert (client_id, nom) on public.fournisseurs to authenticated;

drop policy if exists fournisseurs_tenant_insert on public.fournisseurs;
create policy fournisseurs_tenant_insert on public.fournisseurs
  for insert to authenticated with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and char_length(btrim(nom)) between 1 and 120
  );

commit;
