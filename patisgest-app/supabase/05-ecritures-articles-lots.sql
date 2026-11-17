-- =====================================================================
-- PâtisGest — Sprint 2 : écritures transactionnelles (articles, lots, mouvements)
-- À exécuter UNE fois dans Supabase > SQL Editor > Run.
--
-- Principes :
--   * Écritures réservées aux rôles proprietaire et labo, strictement
--     limitées au client de l'appelant (pas de cross-tenant, y compris
--     via les clés étrangères article_id / site_id / fournisseur_id).
--   * Aucune politique UPDATE/DELETE sur mouvements : journal immuable.
--   * Aucun DELETE sur articles/lots : la suppression est interdite.
--   * réception atomique (lot + mouvement) via une fonction RPC.
--   * Contraintes CHECK pour interdire les quantités négatives.
-- Idempotent : peut être relancé.
-- =====================================================================

-- ---------- Helpers (SECURITY INVOKER par défaut : voient la ligne
-- ---------- propre de l'appelant grâce à la RLS sur utilisateurs) ----------
create or replace function public.patisgest_mon_client()
returns uuid
language sql
stable
as $$
  select u.client_id from public.utilisateurs u where u.auth_user_id = auth.uid() limit 1
$$;

create or replace function public.patisgest_mon_role()
returns text
language sql
stable
as $$
  select u.role::text from public.utilisateurs u where u.auth_user_id = auth.uid() limit 1
$$;

-- ---------- Contraintes de cohérence (données existantes vérifiées : 0 négatif) ----------
alter table public.lots drop constraint if exists lots_qte_positive;
alter table public.lots add constraint lots_qte_positive check (qte_init > 0 and qte_rest >= 0);

-- ---------- Articles : création / mise à jour (propriétaire + labo) ----------
drop policy if exists articles_tenant_insert on public.articles;
create policy articles_tenant_insert on public.articles
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

drop policy if exists articles_tenant_update on public.articles;
create policy articles_tenant_update on public.articles
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  );

-- ---------- Lots : réception / correction (propriétaire + labo) ----------
-- with_check : le lot, l'article, le site et le fournisseur appartiennent
-- tous au client de l'appelant (protection anti cross-tenant par FK).
drop policy if exists lots_tenant_insert on public.lots;
create policy lots_tenant_insert on public.lots
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and exists (select 1 from public.articles a where a.id = article_id and a.client_id = public.patisgest_mon_client())
    and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.patisgest_mon_client())
    and (fournisseur_id is null or exists (select 1 from public.fournisseurs f where f.id = fournisseur_id and f.client_id = public.patisgest_mon_client()))
  );

drop policy if exists lots_tenant_update on public.lots;
create policy lots_tenant_update on public.lots
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and exists (select 1 from public.articles a where a.id = article_id and a.client_id = public.patisgest_mon_client())
    and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.patisgest_mon_client())
    and (fournisseur_id is null or exists (select 1 from public.fournisseurs f where f.id = fournisseur_id and f.client_id = public.patisgest_mon_client()))
  );

-- ---------- Mouvements : INSERT seul (journal immuable, pas d'UPDATE/DELETE) ----------
drop policy if exists mouvements_tenant_insert on public.mouvements;
create policy mouvements_tenant_insert on public.mouvements
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo')
    and exists (select 1 from public.articles a where a.id = article_id and a.client_id = public.patisgest_mon_client())
    and exists (select 1 from public.sites s where s.id = site_id and s.client_id = public.patisgest_mon_client())
    and (lot_id is null or exists (select 1 from public.lots l where l.id = lot_id and l.client_id = public.patisgest_mon_client()))
  );

-- ---------- RPC : réception atomique lot + mouvement ----------
create or replace function public.receptionner_lot(
  p_article_id uuid,
  p_site_id uuid,
  p_numero text,
  p_qte numeric,
  p_pu numeric,
  p_dlc date default null,
  p_fournisseur_id uuid default null,
  p_ref text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_client uuid;
  v_lot uuid;
  v_numero text;
begin
  v_numero := trim(coalesce(p_numero, ''));
  if p_article_id is null or p_site_id is null then
    raise exception 'Article et site sont obligatoires.';
  end if;
  if length(v_numero) < 1 or length(v_numero) > 80 then
    raise exception 'Numéro de lot invalide (1 à 80 caractères).';
  end if;
  if p_qte is null or p_qte <= 0 or p_qte > 100000000 then
    raise exception 'Quantité invalide.';
  end if;
  if p_pu is null or p_pu < 0 or p_pu > 100000000 then
    raise exception 'Prix unitaire invalide.';
  end if;
  if p_ref is not null and length(trim(p_ref)) > 80 then
    raise exception 'Référence trop longue.';
  end if;

  select u.client_id into v_client from public.utilisateurs u where u.auth_user_id = auth.uid() limit 1;
  if v_client is null then
    raise exception 'Non authentifié.';
  end if;

  -- La RLS (lots_tenant_insert) vérifie à nouveau tenant + rôle + FK.
  insert into public.lots (client_id, article_id, site_id, fournisseur_id, numero, qte_init, qte_rest, pu, dlc, ref)
  values (v_client, p_article_id, p_site_id, p_fournisseur_id, v_numero, p_qte, p_qte, p_pu, p_dlc, nullif(trim(coalesce(p_ref, '')), ''))
  returning id into v_lot;

  insert into public.mouvements (client_id, article_id, lot_id, site_id, type, qte, pu, ref, motif)
  values (v_client, p_article_id, v_lot, p_site_id, 'reception', p_qte, p_pu, v_numero, 'Réception');

  return v_lot;
end;
$$;

-- L'appelant doit être authentifié : anon ne peut pas appeler la réception.
revoke execute on function public.receptionner_lot(uuid, uuid, text, numeric, numeric, date, uuid, text) from public, anon;
grant execute on function public.receptionner_lot(uuid, uuid, text, numeric, numeric, date, uuid, text) to authenticated, service_role;
