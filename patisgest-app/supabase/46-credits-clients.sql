-- Migration 45 — Carnet de crédits clients, cafés & entreprises
-- Additive only. Idempotente et isolée par client_id.

begin;

create table if not exists public.credits_clients (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  nom_debiteur text not null check (char_length(trim(nom_debiteur)) between 1 and 140),
  telephone text not null default '' check (char_length(telephone) <= 40),
  type_compte text not null default 'particulier' check (type_compte in ('particulier', 'cafe_entreprise')),
  montant_total_da numeric(12,2) not null check (montant_total_da > 0 and montant_total_da <= 100000000),
  montant_regle_da numeric(12,2) not null default 0 check (montant_regle_da >= 0 and montant_regle_da <= 100000000),
  date_echeance date null,
  note text not null default '' check (char_length(note) <= 400),
  vente_id uuid null references public.ventes(id) on delete set null,
  statut text not null default 'ouvert' check (statut in ('ouvert', 'solde', 'annule')),
  reglements jsonb not null default '[]'::jsonb check (jsonb_typeof(reglements) = 'array'),
  cree_par uuid null references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint credits_regle_lte_total check (montant_regle_da <= montant_total_da)
);

create index if not exists credits_clients_client_statut_idx
  on public.credits_clients (client_id, statut, created_at desc);

alter table public.credits_clients enable row level security;

revoke all on public.credits_clients from public, anon;
grant select, insert, update, delete on public.credits_clients to authenticated, service_role;

drop policy if exists credits_clients_select on public.credits_clients;
create policy credits_clients_select on public.credits_clients
  for select to authenticated
  using (client_id = public.patisgest_mon_client());

drop policy if exists credits_clients_insert on public.credits_clients;
create policy credits_clients_insert on public.credits_clients
  for insert to authenticated
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur', 'labo')
  );

drop policy if exists credits_clients_update on public.credits_clients;
create policy credits_clients_update on public.credits_clients
  for update to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  )
  with check (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() in ('proprietaire', 'vendeur')
  );

drop policy if exists credits_clients_delete on public.credits_clients;
create policy credits_clients_delete on public.credits_clients
  for delete to authenticated
  using (
    client_id = public.patisgest_mon_client()
    and public.patisgest_mon_role() = 'proprietaire'
  );

create or replace function public.enregistrer_reglement_credit(
  p_credit_id uuid,
  p_montant_da numeric,
  p_note text default ''
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
  v_row public.credits_clients%rowtype;
  v_new_regle numeric(12,2);
  v_new_statut text;
  v_entry jsonb;
begin
  if v_auth is null then raise exception 'Non authentifie.'; end if;
  select u.client_id, u.role::text into v_client, v_role
    from public.utilisateurs u where u.auth_user_id = v_auth limit 1;
  if v_client is null then raise exception 'Compte introuvable.'; end if;
  if v_role not in ('proprietaire', 'vendeur') then raise exception 'Role non autorise.'; end if;
  if p_montant_da is null or p_montant_da <= 0 then raise exception 'Montant invalide.'; end if;

  select * into v_row
    from public.credits_clients
   where id = p_credit_id and client_id = v_client
   for update;

  if not found then raise exception 'Credit introuvable.'; end if;
  if v_row.statut <> 'ouvert' then raise exception 'Ce credit est deja solde ou annule.'; end if;

  v_new_regle := round((v_row.montant_regle_da + p_montant_da)::numeric, 2);
  if v_new_regle > v_row.montant_total_da then
    raise exception 'Le montant depasse le reste a payer.';
  end if;

  v_new_statut := case when v_new_regle >= v_row.montant_total_da then 'solde' else 'ouvert' end;
  v_entry := jsonb_build_object(
    'montant_da', round(p_montant_da::numeric, 2),
    'note', left(trim(coalesce(p_note, '')), 200),
    'at', now(),
    'par', v_auth
  );

  update public.credits_clients
     set montant_regle_da = v_new_regle,
         statut = v_new_statut,
         reglements = reglements || jsonb_build_array(v_entry),
         updated_at = now()
   where id = v_row.id;

  return jsonb_build_object(
    'id', v_row.id,
    'montant_regle_da', v_new_regle,
    'reste_da', round((v_row.montant_total_da - v_new_regle)::numeric, 2),
    'statut', v_new_statut
  );
end;
$$;

revoke execute on function public.enregistrer_reglement_credit(uuid, numeric, text) from public, anon;
grant execute on function public.enregistrer_reglement_credit(uuid, numeric, text) to authenticated, service_role;

commit;
