-- Migration 47 — Notifications & Alertes Prix au Propriétaire (B.6)
-- Quand un employé saisit le prix d'un nouveau gâteau, tarte, cake ou recette,
-- le patron reçoit immédiatement une alerte (critique si le prix est trop bas).

begin;

create table if not exists public.notifications_patron (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  type text not null check (type in ('nouveau_prix_employe', 'prix_trop_bas')),
  severite text not null default 'warning' check (severite in ('info', 'warning', 'critical')),
  cible_type text not null check (cible_type in ('recette_libre', 'article', 'cake', 'nouveau_produit')),
  cible_id text not null default '',
  nom_produit text not null check (char_length(trim(nom_produit)) between 1 and 160),
  categorie text not null default 'gateau',
  prix_saisi_da numeric(12,2) not null check (prix_saisi_da >= 0 and prix_saisi_da <= 100000000),
  cout_estime_da numeric(12,2) null,
  prix_conseille_da numeric(12,2) null,
  auteur_id uuid null references auth.users(id) on delete set null,
  auteur_nom text not null default 'Employé',
  message text not null,
  traite_statut text not null default 'en_attente' check (traite_statut in ('en_attente', 'approuve', 'corrige', 'bloque')),
  prix_final_da numeric(12,2) null,
  traite_par uuid null references auth.users(id) on delete set null,
  traite_at timestamptz null,
  created_at timestamptz not null default now()
);

create index if not exists notifications_patron_client_statut_idx
  on public.notifications_patron (client_id, traite_statut, created_at desc);

alter table public.notifications_patron enable row level security;

drop policy if exists notifications_patron_select on public.notifications_patron;
create policy notifications_patron_select on public.notifications_patron
  for select to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and (
      public.patisgest_mon_role() = 'proprietaire'
      or auteur_id = auth.uid()
    )
  );

drop policy if exists notifications_patron_insert on public.notifications_patron;
create policy notifications_patron_insert on public.notifications_patron
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'labo', 'vendeur')
  );

drop policy if exists notifications_patron_update on public.notifications_patron;
create policy notifications_patron_update on public.notifications_patron
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

create or replace function public.traiter_alerte_prix_patron(
  p_alerte_id uuid,
  p_decision text,
  p_nouveau_prix numeric default null
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
  v_row public.notifications_patron%rowtype;
  v_prix_final numeric(12,2);
  v_uuid uuid;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role <> 'proprietaire' then raise exception 'Reserve au proprietaire.'; end if;
  if p_decision not in ('approuve', 'corrige', 'bloque') then
    raise exception 'Decision invalide.';
  end if;

  select * into v_row
    from public.notifications_patron
   where id = p_alerte_id and client_id = v_client
   for update;

  if not found then raise exception 'Notification introuvable.'; end if;

  if p_decision = 'corrige' then
    if p_nouveau_prix is null or p_nouveau_prix <= 0 then
      raise exception 'Nouveau prix positif requis.';
    end if;
    v_prix_final := round(p_nouveau_prix::numeric, 2);
  elsif p_decision = 'approuve' then
    v_prix_final := v_row.prix_saisi_da;
  else
    v_prix_final := null;
  end if;

  update public.notifications_patron
     set traite_statut = p_decision,
         prix_final_da = v_prix_final,
         traite_par = v_auth,
         traite_at = now()
   where id = v_row.id;

  if v_row.cible_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_uuid := v_row.cible_id::uuid;
    if v_row.cible_type = 'recette_libre' and to_regclass('public.recettes_libres') is not null then
      update public.recettes_libres
         set prix_vente_da = coalesce(v_prix_final, prix_vente_da),
             statut_prix = case when p_decision = 'bloque' then 'bloque' else 'valide' end,
             updated_at = now()
       where id = v_uuid and client_id = v_client;
    elsif v_row.cible_type = 'article' then
      update public.articles
         set pv_ht = coalesce(v_prix_final, pv_ht)
       where id = v_uuid and client_id = v_client;
    end if;
  end if;

  return jsonb_build_object('id', v_row.id, 'statut', p_decision, 'prix_final_da', v_prix_final);
end;
$$;

revoke execute on function public.traiter_alerte_prix_patron(uuid, text, numeric) from public, anon;
grant execute on function public.traiter_alerte_prix_patron(uuid, text, numeric) to authenticated, service_role;

commit;
