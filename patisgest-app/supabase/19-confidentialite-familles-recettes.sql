-- Les familles de recettes exposent la structure de gamme, même en l'absence
-- de versions. Aligner leur lecture (y compris via PostgREST) sur la migration
-- 17 : uniquement le propriétaire et le laboratoire du même établissement.
begin;

drop policy if exists recette_familles_tenant_read on public.recette_familles;
drop policy if exists recette_familles_cost_read on public.recette_familles;
create policy recette_familles_cost_read on public.recette_familles
  for select to authenticated using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

commit;
